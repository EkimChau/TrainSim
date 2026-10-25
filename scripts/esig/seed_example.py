#!/usr/bin/env python3
"""Install only a DRAFT example rule and synthetic GA/SA into an ingested ESIG DB."""
import argparse
import json
from pathlib import Path
import sqlite3

ROOT=Path(__file__).resolve().parents[2]

def seed(db:Path, example_path:Path)->None:
    payload=json.loads(example_path.read_text(encoding="utf-8"))
    ga=payload["ga"];sa=payload["sa"]
    with sqlite3.connect(db) as conn:
        conn.execute("PRAGMA foreign_keys=ON")
        needed=["5.10.3.2.1","5.10.3.2.2","5.10.3.2.3"]
        ids=[]
        for no in needed:
            cid=f"SUBSET-026-5@4.0.0:{no}:1"
            if not conn.execute("SELECT 1 FROM clause WHERE id=?",(cid,)).fetchone():
                raise ValueError(f"Cannot seed example: missing evidence {cid}")
            ids.append(cid)
        conn.execute("INSERT OR IGNORE INTO component_type VALUES(?,?,?,?,?)",
                     ("ETCS_OB","ETCS on-board","onboard","ETCS",None))
        conn.execute("INSERT OR IGNORE INTO component_type VALUES(?,?,?,?,?)",
                     ("RBC","Radio Block Centre","trackside","ETCS",None))
        conn.execute("INSERT OR IGNORE INTO component_type VALUES(?,?,?,?,?)",
                     ("TMS","Traffic Management System","external","operations",None))
        rid="ESIG-DEMO-L0-L2-ENTRY"
        conn.execute("INSERT OR REPLACE INTO rule VALUES(?,?,?,?,?,?,?,?,?,?,?)",(
            rid,1,"Level 0 to 2 entry without necessary MA/track description",
            "ETCS_OB","transition","official_interpretation",
            json.dumps({"from_level":"0","to_level":"2"}),
            json.dumps({"event":"cross_level_transition_border",
                        "any_missing":["valid_level_2_ma","level_2_track_description_received"]}),
            json.dumps({"event":"train_trip","mode":"TR"}),"4.0.0","draft"))
        for cid in ids:
            conn.execute("INSERT OR IGNORE INTO rule_evidence VALUES(?,?,?,?)",
                         (rid,1,cid,"normative_basis" if cid.endswith("5.10.3.2.3:1") else "dependency"))
        conn.execute("INSERT OR REPLACE INTO network_config VALUES(?,?,?,?,?,?)",
                     (ga["id"],"1","SUBSET-026:4.0.0",json.dumps(ga),
                      json.dumps({"kind":"synthetic_fixture"}),"draft"))
        conn.execute("INSERT OR REPLACE INTO scenario VALUES(?,?,?,?,?,?,?)",(
            payload["id"],ga["id"],"synthetic_example",
            json.dumps(sa["initial"]),json.dumps(sa["stimuli"]),
            json.dumps(sa["assertions"]),"draft"))
        if conn.execute("PRAGMA foreign_key_check").fetchall():
            raise ValueError("Bad foreign keys after seeding")
    print(f"Seeded DRAFT illustrative example in {db}; no rules marked verified.")

def main():
    p=argparse.ArgumentParser()
    p.add_argument("--db",type=Path,default=ROOT/"data/esig/esig.sqlite")
    p.add_argument("--example",type=Path,default=ROOT/"data/esig/examples/mixed-l0-l2-no-ma.json")
    a=p.parse_args()
    seed(a.db,a.example)

if __name__=="__main__":
    main()
