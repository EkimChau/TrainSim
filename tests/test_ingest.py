"""Ingestion tests. The OSM fixture is SYNTHETIC (approximate positions), never survey truth."""
import json
import re
import sqlite3
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'scripts'))

from ingest import geo, sources  # noqa: E402
from ingest.scope import ALIASES, normalise  # noqa: E402
from ingest.xlsx import read_scope  # noqa: E402

FIXTURE = ROOT / 'data/fixtures/osm-seq-fixture.osm'
SCRIPT = ROOT / 'scripts/ingest_osm.py'


def ingest(db, *files, extra=()):
    return subprocess.run([sys.executable, str(SCRIPT), '--source', 'file', *map(str, files), '--db', str(db), *extra],
                          check=True, capture_output=True, text=True)


class ScopeTests(unittest.TestCase):
    def test_workbook_scope(self):
        scope = read_scope(ROOT / 'docs/stations.xlsx')
        self.assertEqual(len(scope['stations']), 143)
        names = {s['name'] for s in scope['stations']}
        self.assertTrue({'Caboolture', 'Petrie', 'Roma Street', 'Gympie North', 'Varsity Lakes'} <= names)
        lines = {l['name']: l for l in scope['lines']}
        self.assertEqual(lines['Caboolture Line']['colour'], '#0072bb')
        self.assertEqual(lines['Caboolture Line']['start_station'], 'Caboolture')
        self.assertTrue(any(c['station'] == 'Petrie' for c in scope['connections']))

    def test_name_normalisation(self):
        self.assertEqual(normalise('Glasshouse Mtns'), normalise('Glass House Mountains'))
        self.assertEqual(normalise('Roma Street railway station'), 'romastreet')
        self.assertIn('coorparoo', ALIASES[normalise('Coarparoo')])

    def test_scope_tiles_and_contains(self):
        s = geo.Scope([(-27.2672, 152.9793)], 20000)
        self.assertTrue(s.contains(-27.10, 152.98))
        self.assertFalse(s.contains(-27.56, 151.95))
        tiles = s.tiles(0.25)
        self.assertTrue(all(t[2] - t[0] == 0.25 for t in tiles))
        self.assertTrue(any(t[0] <= -27.2672 <= t[2] and t[1] <= 152.9793 <= t[3] for t in tiles))


class SourceTests(unittest.TestCase):
    def test_overpass_query_covers_every_layer(self):
        q = sources.railway_query((-27.5, 152.75, -27.25, 153.0))
        for part in ['nwr["railway"]', 'nwr["disused:railway"]', 'nwr["public_transport"]["train"="yes"]',
                     'rel(bw.infra)', 'rel(br.rels)["type"="route_master"]', 'node(w)', 'out meta',
                     'nwr["power"="substation"]["substation"="traction"]']:
            self.assertIn(part, q)
        self.assertIn('(-27.5,152.75,-27.25,153.0)', q)

    def test_fail_closed_on_incomplete_overpass(self):
        with tempfile.TemporaryDirectory() as d:
            p = Path(d) / 'bad.json'
            p.write_text(json.dumps({'remark': 'runtime error: Query timed out', 'elements': []}))
            with self.assertRaisesRegex(ValueError, 'Incomplete'):
                sources.parse_overpass_json(p)

    def test_merge_keeps_newest_version(self):
        a = [{'type': 'node', 'id': 1, 'lat': 0, 'lon': 0, 'version': 1}]
        b = [{'type': 'node', 'id': 1, 'lat': 1, 'lon': 1, 'version': 2}]
        self.assertEqual(sources.merge_elements([b, a])[('node', 1)]['version'], 2)


class IngestTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.tmp = tempfile.TemporaryDirectory()
        cls.db = Path(cls.tmp.name) / 'world.sqlite'
        cls.out = ingest(cls.db, FIXTURE)
        cls.con = sqlite3.connect(cls.db)

    @classmethod
    def tearDownClass(cls):
        cls.con.close()
        cls.tmp.cleanup()

    def one(self, sql, *args):
        return self.con.execute(sql, args).fetchone()

    def test_typed_layers(self):
        self.assertEqual(self.one('SELECT count(*) FROM rail_track')[0], 5)
        self.assertEqual(self.one("SELECT state FROM rail_track WHERE way_id=5005")[0], 'disused')
        self.assertIsNone(self.one('SELECT 1 FROM rail_track WHERE way_id=5900'), 'out-of-scope track excluded')
        t = self.one('SELECT gauge_mm, voltage, frequency, maxspeed, train_protection FROM rail_track WHERE way_id=5003')
        self.assertEqual(t, (1067, 25000, 50.0, 100.0, 'etcs:2'))
        self.assertEqual(self.one('SELECT category, direction FROM rail_signal WHERE ref="BP12"'), ('main', 'forward'))
        self.assertEqual(self.one('SELECT count(*) FROM rail_switch')[0], 2)
        self.assertEqual(self.one("SELECT station_osm_id FROM rail_platform WHERE osm_id=5101")[0],
                         self.one("SELECT osm_id FROM rail_station WHERE name='Petrie'")[0])
        kinds = {r[0] for r in self.con.execute('SELECT kind FROM rail_feature')}
        self.assertTrue({'milestone', 'level_crossing', 'buffer_stop', 'signal_box', 'stop_position', 'traction_substation'} <= kinds)

    def test_scope_matching(self):
        row = self.one("SELECT match_status, round(lat,3) FROM scope_station WHERE name='Petrie'")
        self.assertEqual(row, ('matched', -27.267))  # the same-name halt near Townsville is not chosen
        self.assertEqual(self.one("SELECT match_status FROM scope_station WHERE name='Nambour'")[0], 'unmatched')
        self.assertEqual(self.one('SELECT count(*) FROM scope_station')[0], 143)

    def test_topology(self):
        self.assertEqual(self.one('SELECT count(*) FROM topo_edge')[0], 5)
        legs = dict(self.con.execute('SELECT leg, branch_edge FROM topo_switch_leg WHERE switch_node=1013'))
        straight_way = self.one('SELECT way_id FROM topo_edge WHERE edge_id=?', legs['straight'])[0]
        diverging_way = self.one('SELECT way_id FROM topo_edge WHERE edge_id=?', legs['diverging'])[0]
        self.assertEqual((straight_way, diverging_way), (5002, 5003))
        facing = self.one("SELECT f.facing, f.snap_m FROM topo_edge_feature f WHERE f.osm_id=1025 AND feature_kind='signal'")
        self.assertEqual(facing, ('backward', 0.0))
        self.assertEqual(self.one("SELECT value FROM json_each((SELECT stats_json FROM ingest_run ORDER BY run_id DESC LIMIT 1), '$.topology.components')")[0], 1)

    def test_routes(self):
        rows = dict(self.con.execute('SELECT relation_id, path_status FROM rail_route'))
        self.assertEqual(rows, {8001: 'ok', 8002: 'ok', 8003: 'gaps'})
        self.assertEqual(self.one('SELECT master_id FROM rail_route WHERE relation_id=8001')[0], 8100)
        lines = {r[0] for r in self.con.execute('SELECT l.name FROM scope_line_route JOIN scope_line l USING(line_id)')}
        self.assertIn('Caboolture Line', lines)

    def test_coverage_report(self):
        cov = dict(self.con.execute("SELECT metric, numerator FROM coverage"))
        self.assertEqual(cov['way_nodes_missing'], 0)
        self.assertEqual(cov['signals_on_track'], 3)
        self.assertIn('Coverage:', self.out.stderr)


class IdempotencyTests(unittest.TestCase):
    def test_rerun_upserts_without_duplicates_and_keeps_hand_made_rows(self):
        with tempfile.TemporaryDirectory() as d:
            db = Path(d) / 'w.sqlite'
            ingest(db, FIXTURE)
            con = sqlite3.connect(db)
            tables = ['osm_node', 'osm_way', 'osm_relation', 'rail_track', 'rail_signal', 'topo_edge', 'topo_edge_feature', 'scope_station']
            before = {t: con.execute(f'SELECT count(*) FROM {t}').fetchone()[0] for t in tables}
            con.execute("INSERT INTO rail_signal(node_id, ref, lat, lon) VALUES (-1, 'MANUAL1', -27.27, 152.98)")
            con.execute("UPDATE scope_station SET lat=-26.9, lon=152.95, match_status='manual' WHERE name='Elimbah'")
            con.commit()
            con.close()
            ingest(db, FIXTURE)
            con = sqlite3.connect(db)
            after = {t: con.execute(f'SELECT count(*) FROM {t}').fetchone()[0] for t in tables}
            before['rail_signal'] += 1
            before['topo_edge_feature'] += 1  # the hand-made signal is snapped onto the track graph too
            self.assertEqual(before, after)
            self.assertEqual(con.execute("SELECT ref FROM rail_signal WHERE node_id=-1").fetchone()[0], 'MANUAL1')
            self.assertEqual(con.execute("SELECT match_status FROM scope_station WHERE name='Elimbah'").fetchone()[0], 'manual')
            self.assertEqual(con.execute("SELECT count(*), sum(status='ok') FROM ingest_run").fetchone(), (2, 2))
            self.assertEqual(con.execute('SELECT count(*) FROM source_snapshot').fetchone()[0], 1)
            con.close()

    def test_prune_removes_elements_deleted_upstream(self):
        with tempfile.TemporaryDirectory() as d:
            db = Path(d) / 'w.sqlite'
            ingest(db, FIXTURE)
            smaller = Path(d) / 'smaller.osm'
            text = FIXTURE.read_text()
            text = re.sub(r'  <way id="5004".*?</way>\n', '', text, flags=re.S)  # siding removed upstream
            smaller.write_text(text)
            ingest(db, smaller)
            con = sqlite3.connect(db)
            self.assertIsNone(con.execute('SELECT 1 FROM osm_way WHERE id=5004').fetchone())
            self.assertIsNone(con.execute('SELECT 1 FROM rail_track WHERE way_id=5004').fetchone())
            self.assertEqual(con.execute('SELECT count(*) FROM topo_switch_leg WHERE switch_node=1017').fetchone()[0], 0)
            con.close()

    def test_lines_filter(self):
        with tempfile.TemporaryDirectory() as d:
            db = Path(d) / 'w.sqlite'
            ingest(db, FIXTURE, extra=['--lines', 'Caboolture Line'])
            con = sqlite3.connect(db)
            self.assertEqual(con.execute('SELECT count(*) FROM scope_station').fetchone()[0], 25)
            con.close()


if __name__ == '__main__':
    unittest.main()
