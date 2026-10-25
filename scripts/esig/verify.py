#!/usr/bin/env python3
"""Validate ESIG source coverage and database integrity (not ETCS conformance)."""
import argparse
import json
from pathlib import Path
import sqlite3

ROOT=Path(__file__).resolve().parents[2]

def validate(db, manifest):
    expected=json.loads(Path(manifest).read_text())
    report={"database":str(db),"checks":{},"warnings":[]}
    con=sqlite3.connect(db)
    con.execute("PRAGMA foreign_keys=ON")
    def record(name,found,required):
        report["checks"][name]={"observed":found,"expected":required,"pass":found==required}
    try:
        record("sqlite_integrity",con.execute("PRAGMA integrity_check").fetchone()[0],"ok")
        record("foreign_key_errors",len(con.execute("PRAGMA foreign_key_check").fetchall()),0)
        record("registered_volumes",con.execute("SELECT count(*) FROM document").fetchone()[0],9)
        record("source_pages",con.execute("SELECT count(*) FROM source_page").fetchone()[0],
               sum(x["pages"] for x in expected["volumes"]))
        for v in expected["volumes"]:
            doc=f"SUBSET-026-{v['chapter']}@{expected['issue']}"
            found=con.execute("SELECT count(*) FROM source_page WHERE document_id=?",(doc,)).fetchone()[0]
            record(f"chapter_{v['chapter']}_pages",found,v["pages"])
            row=con.execute("SELECT sha256 FROM document WHERE id=?",(doc,)).fetchone()
            record(f"chapter_{v['chapter']}_sha256",row[0] if row else None,v["sha256"])
        clauses=con.execute("SELECT count(*) FROM clause").fetchone()[0]
        classified=con.execute("SELECT count(*) FROM classification_row").fetchone()[0]
        artifacts=con.execute("SELECT count(*) FROM source_artifact").fetchone()[0]
        report["counts"]={"clause_candidates":clauses,"classification_rows":classified,
                          "artifact_candidates":artifacts}
        if clauses==0 or classified==0:
            report["warnings"].append("Clause/classification staging incomplete")
        outstanding=con.execute(
            "SELECT count(*) FROM clause WHERE review_state!='verified'").fetchone()[0]
        report["warnings"].append(f"{outstanding} clause candidates are not verified")
        report["warnings"].append("Source pages contain tables/figures/equations requiring visual review")
        report["warnings"].append("No automatic equivalence between source extraction and executable rule conformance")
        report["ok"]=all(x["pass"] for x in report["checks"].values()) and clauses>0 and classified>0
    finally:
        con.close()
    return report

def main():
    p=argparse.ArgumentParser()
    p.add_argument("--db",type=Path,default=ROOT/"data/esig/esig.sqlite")
    p.add_argument("--manifest",type=Path,default=ROOT/"data/esig/catalog/subset-026-4.0.0.json")
    args=p.parse_args()
    report=validate(args.db,args.manifest)
    print(json.dumps(report,indent=2))
    if not report["ok"]:
        raise SystemExit(1)

if __name__=="__main__":
    main()
