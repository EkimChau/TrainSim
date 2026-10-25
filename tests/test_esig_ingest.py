"""ESIG ingestion contract tests; test fixtures do not represent railway compliance."""
import importlib.util
import json
from pathlib import Path
import sqlite3
import tempfile
import unittest
from unittest import mock

ROOT=Path(__file__).resolve().parents[1]
MODULE=ROOT/"scripts/esig/ingest.py"
spec=importlib.util.spec_from_file_location("esig_ingest",MODULE)
ingest=importlib.util.module_from_spec(spec)
spec.loader.exec_module(ingest)

class EsigIngestTests(unittest.TestCase):
    def test_catalog_has_exact_nine_volumes_and_all_defined_levels(self):
        manifest=json.loads((ROOT/"data/esig/catalog/subset-026-4.0.0.json").read_text())
        self.assertEqual([v["chapter"] for v in manifest["volumes"]],list(range(1,10)))
        self.assertEqual(sum(v["pages"] for v in manifest["volumes"]),848)
        levels=json.loads((ROOT/"data/esig/catalog/application-levels.json").read_text())
        self.assertEqual({x["id"] for x in levels["defined_application_levels"]},{"0","NTC","1","2"})
        self.assertNotIn("4",{x["id"] for x in levels["defined_application_levels"]})

    def test_classification_column_positions_use_page_headers(self):
        wide=[
            "Clause number             ETCS on-            ETCS",
            "                          board               trackside         Definition   Informative   Others",
        ]
        narrow=[
            "Clause number       ETCS on-      ETCS",
            "                    board         trackside     Definition     Informative    Others",
        ]
        for lines in (wide,narrow):
            cols=ingest.header_centres(lines)
            self.assertEqual(set(cols),{"onboard_requirement","trackside_requirement",
                                        "definition","informative","other"})
            self.assertLess(cols["onboard_requirement"],cols["trackside_requirement"])
            self.assertLess(cols["definition"],cols["informative"])

    def test_all_volumes_staged_without_authorising_rules(self):
        with tempfile.TemporaryDirectory() as directory:
            home=Path(directory)
            source=home/"sources"; source.mkdir()
            manifest={"issue":"4.0.0","publication_date":"2023-07-05","volumes":[]}
            page_data={}
            for n in range(1,10):
                name=f"SUBSET-026-{n} v400.pdf"
                path=source/name
                path.write_bytes(f"synthetic PDF {n}".encode())
                manifest["volumes"].append({"chapter":n,"filename":name,
                    "sha256":ingest.sha256(path.read_bytes()),"pages":1})
                if n==9:
                    page_data[name]=(
                      "Clause number ETCS on- ETCS\n"
                      "              board trackside Definition Informative Others\n"
                      " 5.10.3.2.3                 x\n")
                else:
                    page_data[name]=f"{n}.3 Test section\n{n}.3.1.1 A draft example shall remain unverified.\n"
            # Put fixture bodies beyond the official chapter's front matter.
            synthetic={}
            for entry in manifest["volumes"]:
                n=entry["chapter"]
                body=page_data[entry["filename"]]
                synthetic[entry["filename"]]=["\n"]*(ingest.BODY_START[n]-1)+[body]
                entry["pages"]=len(synthetic[entry["filename"]])
            def pages_for(path):
                return synthetic[path.name]
            db=home/"esig.sqlite"; report=home/"report.json"
            schema=ROOT/"db/esig/schema.sql"
            with mock.patch.object(ingest,"poppler_pages",side_effect=pages_for),\
                 mock.patch.object(ingest,"page_count",side_effect=lambda p:len(synthetic[p.name])),\
                 mock.patch.object(ingest.shutil,"which",return_value="/usr/bin/mock"):
                stats=ingest.ingest(manifest,source,db,report,schema)
            self.assertEqual(stats["source_documents"],9)
            self.assertEqual(stats["pages"],sum(x["pages"] for x in manifest["volumes"]))
            with sqlite3.connect(db) as connection:
                self.assertEqual(connection.execute("SELECT count(*) FROM source_page").fetchone()[0],
                                 stats["pages"])
                self.assertEqual(connection.execute("SELECT count(*) FROM rule").fetchone()[0],0)
                self.assertGreater(connection.execute("SELECT count(*) FROM clause").fetchone()[0],0)
                self.assertEqual(connection.execute("PRAGMA foreign_key_check").fetchall(),[])

if __name__=="__main__":
    unittest.main()
