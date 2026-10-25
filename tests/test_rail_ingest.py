"""Tests use completely synthetic OSM-format fixture, NEVER geodetic source truth."""
import importlib.util
import json
from pathlib import Path
import sqlite3
import subprocess
import sys
import tempfile
import unittest

ROOT=Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location('osm_etl',ROOT/'scripts/ingest_osm.py')
osm=importlib.util.module_from_spec(spec);spec.loader.exec_module(osm)

class OSMImportTests(unittest.TestCase):
  def test_reference_catalog_names_and_status(self):
    doc=json.loads((ROOT/'data/reference/diagram-catalog.json').read_text())
    train=[s for s in doc['stops'] if 'train' in s['modes']]
    self.assertGreaterEqual(len(train),140)
    self.assertTrue(all(s['wgs84'] is None and s['osm_id'] is None for s in train))
    self.assertIn('Richlands',[s['name'] for s in train])
    self.assertFalse(any('busway' in s['modes'] and 'train' not in s['modes'] for s in train))
  def test_native_keys_and_query_completeness(self):
    q=osm.overpass_query(osm.REGIONS['brisbane'])
    for phrase in ['way["railway"','node["railway"','relation["route"="train"]','(._;>;);out body;']:
      self.assertIn(phrase,q)
    self.assertEqual(osm.normalized('Roma Street Railway Station'),osm.normalized('Roma Street'))
  def test_ingest_native_osm_and_connected_route(self):
    fixture=ROOT/'data/fixtures/osm-synthetic-test.json'
    with tempfile.TemporaryDirectory() as d:
      dest=Path(d)/'world'
      subprocess.run([sys.executable,str(ROOT/'scripts/ingest_osm.py'),'--osm-json',str(fixture),'--out',str(dest)],check=True,capture_output=True,text=True)
      self.assertEqual((dest/'raw'/fixture.name).read_bytes(),fixture.read_bytes())
      world=json.loads((dest/'world.json').read_text());manifest=json.loads((dest/'manifest.json').read_text())
      self.assertEqual(world['source'],'OSM-derived')
      self.assertEqual(world['dataset_status'],'synthetic-fixture')
      self.assertEqual(world['coverage']['track_ways'],2)
      self.assertEqual(world['coverage']['connected_service_routes'],1)
      self.assertEqual(world['routes'][0]['id'],'doomben')
      self.assertEqual(len(world['routes'][0]['coords']),11)
      self.assertTrue(all(c in world['tracks'][0]['coords'] or c in world['tracks'][1]['coords'] for c in world['routes'][0]['coords']))
      self.assertEqual(len(manifest['raw_snapshots']),1)
      with sqlite3.connect(dest/'rail.sqlite3') as db:
        self.assertEqual(db.execute('SELECT count(*) FROM osm_objects').fetchone()[0],len(json.loads(fixture.read_text())['elements']))
        self.assertEqual(db.execute('SELECT count(*) FROM osm_ways').fetchone()[0],2)
        self.assertEqual(db.execute('SELECT count(*) FROM graph_edges').fetchone()[0],10)
        self.assertEqual(db.execute("SELECT match_status FROM diagram_stops WHERE name='Doomben'").fetchone()[0],'matched')
        self.assertEqual(db.execute("SELECT match_status FROM diagram_stops WHERE name='Nambour'").fetchone()[0],'unmatched')
  def test_fail_closed_on_incomplete_upstream(self):
    with tempfile.TemporaryDirectory() as d:
      p=Path(d)/'incomplete.json'
      p.write_text(json.dumps({'remark':'runtime error: timeout','elements':[]}))
      with self.assertRaisesRegex(ValueError,'Incomplete'):
        osm.load_sources([p])
  def test_nearest_and_distance(self):
    self.assertEqual(osm.distance((-27,153),(-27,153)),0)
    self.assertGreater(osm.distance((-27,153),(-27.001,153)),100)

if __name__=='__main__':unittest.main()
