#!/usr/bin/env python3
"""Reproducible, evidence-only ingestion of ALL nine ETCS SUBSET-026 v4.0.0 PDFs.

Requires poppler utilities: pdftotext, pdfinfo. No runtime pip dependencies.
Retains every page verbatim in source_page, stages clause candidates (including
cross-page continuations), preserves Ch9 rows, and flags visual/table review.
NEVER promotes staged text to an executable or verified rule.
"""
from __future__ import annotations
import argparse
import datetime as dt
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import sqlite3
import subprocess
import tempfile

ROOT = Path(__file__).resolve().parents[2]
DEFAULT_SOURCE = ROOT / "data/esig/sources/subset-026/4.0.0"
DEFAULT_MANIFEST = ROOT / "data/esig/catalog/subset-026-4.0.0.json"
DEFAULT_DB = ROOT / "data/esig/esig.sqlite"
DEFAULT_REPORT = ROOT / "data/esig/reports/ingestion.json"
DEFAULT_SCHEMA = ROOT / "db/esig/schema.sql"
TITLES = ("", "Introduction", "Basic System Description", "Principles",
          "Modes and Transitions", "Procedures", "Management of older System Versions",
          "ERTMS/ETCS language", "Messages", "Classification of clauses")
BODY_START = {1:6, 2:6, 3:10, 4:8, 5:10, 6:5, 7:7, 8:8, 9:5}
CLAUSE = re.compile(r"^\s*([1-9](?:\.\d+){1,10})\s+(.+?)\s*$")
CLASS_REF = re.compile(r"^\s*([1-8](?:\.\d+)*)(?=\s|$)")
ARTIFACT = re.compile(r"^\s*(Figure\s+\d+|Table\s+\d+|Appendix\s+[A-Z]|Equation\s+\d+)", re.I)
PROTO = re.compile(r"^\s*([78](?:\.\d+)+)\s+((?:Packet Number|Message)\s+\d+[^\n]*)", re.I)
HEADER = re.compile(r"^\s*(?:ERA\s*\*\s*UNISIG|SUBSET-026-\d\s+|05/07/2023\s*$|4\.0\.0\s*$|System Requirements Specification\s+|Chapter\s+\d+\b)")

def sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()

def poppler_pages(path: Path) -> list[str]:
    output = subprocess.check_output(["pdftotext", "-layout", str(path), "-"])
    # A form-feed marks an original PDF page; keep every page, even blank ones.
    pages = output.decode("utf-8", "replace").split("\f")
    if pages and pages[-1] == "":
        pages.pop()
    return pages

def page_count(path: Path) -> int:
    info = subprocess.check_output(["pdfinfo", str(path)], text=True)
    m = re.search(r"^Pages:\s*(\d+)", info, re.M)
    if not m:
        raise RuntimeError("Cannot read page count: " + str(path))
    return int(m.group(1))

def clean(line: str) -> str:
    return "" if HEADER.match(line) else line.rstrip()

def extract_clauses(conn: sqlite3.Connection, doc_id: str, ch: int,
                    pages: list[str]) -> int:
    current_no, current_lines, start, end = None, [], 0, 0
    occurrences: dict[str,int] = {}
    count = 0

    def flush() -> None:
        nonlocal count
        if current_no is None or not "\n".join(current_lines).strip():
            return
        occurrences[current_no] = occurrences.get(current_no, 0) + 1
        occurrence = occurrences[current_no]
        cid = f"{doc_id}:{current_no}:{occurrence}"
        conn.execute(
            "INSERT INTO clause(id,document_id,clause_no,occurrence,start_page,end_page,source_text) "
            "VALUES(?,?,?,?,?,?,?)",
            (cid, doc_id, current_no, occurrence, start, end,
             "\n".join(current_lines).strip()))
        count += 1

    for page_num, text in enumerate(pages, 1):
        if page_num < BODY_START[ch]:
            continue
        for line in text.splitlines():
            m = CLAUSE.match(line)
            valid = (m and not HEADER.match(line) and m.group(1).split(".")[0] == str(ch)
                     and "...." not in m.group(2) and not re.search(r"\.{4,}\s*\d+$", line))
            if valid:
                flush()
                current_no, current_lines, start, end = m.group(1), [m.group(2)], page_num, page_num
            elif current_no is not None:
                sanitized = clean(line)
                if sanitized:
                    current_lines.append(sanitized)
                    end = page_num
    flush()
    return count

def header_centres(lines: list[str]) -> dict[str,int] | None:
    # Coordinates are pdftotext -layout character columns, NOT fixed across pages.
    combined = "\n".join(lines[:15])
    on = re.search(r"ETCS on-", combined)
    if on is None:
        return None
    first_line = next((x for x in lines[:15] if "ETCS on-" in x), "")
    other = first_line.find("ETCS", first_line.find("ETCS on-") + len("ETCS on-"))
    fields = {"onboard_requirement": first_line.find("ETCS on-") + 5}
    if other >= 0:
        fields["trackside_requirement"] = other + 5
    detail_line = next((x for x in lines[:15] if "Definition" in x and "Informative" in x), "")
    for label, key in (("Definition","definition"), ("Informative","informative"), ("Others","other")):
        i = detail_line.find(label)
        if i >= 0:
            fields[key] = i + 5
    return fields if len(fields) == 5 else None

def extract_classification(conn: sqlite3.Connection, doc_id: str,
                           pages: list[str], warnings: list[str]) -> int:
    total = 0
    for page_num, page in enumerate(pages, 1):
        if page_num < 6:
            continue
        lines = page.splitlines()
        cols = header_centres(lines)
        pending_ref, pending_lines = None, []

        def flush() -> None:
            nonlocal total
            if pending_ref is None:
                return
            raw = "\n".join(pending_lines).rstrip()
            marks = [(i, match.start()) for i, line in enumerate(pending_lines)
                     for match in re.finditer(r"(?<!\S)x(?!\S)", line)]
            if not marks:
                return
            first = pending_lines[0]
            start = CLASS_REF.match(first)
            qualifier = first[start.end():].strip() if start else ""
            qualifier = re.sub(r"\s+x(?:\s+x)*\s*$", "", qualifier).strip()
            row_id = f"{doc_id}:{page_num}:{total+1}"
            state = "parsed_unverified" if cols else "needs_column_review"
            conn.execute("INSERT INTO classification_row VALUES(?,?,?,?,?,?,?)",
                         (row_id,doc_id,page_num,pending_ref,qualifier,raw,state))
            total += 1
            if not cols:
                return
            parsed = set()
            for _,pos in marks:
                nearest,delta = min(((name,abs(pos - x)) for name,x in cols.items()),
                                     key=lambda x: x[1])
                if delta > 8:
                    warnings.append(f"Ambiguous classification mark {page_num}:{pending_ref} at {pos}")
                    continue
                parsed.add(nearest)
            for category in sorted(parsed):
                conn.execute("INSERT OR IGNORE INTO clause_classification VALUES(?,?)",
                             (row_id,category))

        for line in lines:
            match = CLASS_REF.match(line)
            if match:
                flush()
                pending_ref, pending_lines = match.group(1), [line]
            elif pending_ref is not None:
                if HEADER.match(line):
                    continue
                pending_lines.append(line)
        flush()
        if not cols and any(CLASS_REF.match(line) for line in lines):
            warnings.append(f"Classification headers not resolved on PDF page {page_num}")
    return total

def extract_artifacts(conn: sqlite3.Connection, doc_id: str, ch: int,
                      pages: list[str]) -> int:
    count=0
    for pn, page in enumerate(pages, 1):
        if pn < BODY_START[ch]:
            continue
        for line in page.splitlines():
            m = ARTIFACT.match(line)
            proto = PROTO.match(line)
            if m:
                kind = ("figure" if m.group(1).lower().startswith("figure") else
                        "table" if m.group(1).lower().startswith("table") else
                        "appendix" if m.group(1).lower().startswith("appendix") else "equation")
                anchor = line.strip()
            elif proto:
                kind, anchor = "protocol_element", line.strip()
            else:
                continue
            count+=1
            conn.execute("INSERT INTO source_artifact VALUES(?,?,?,?,?,?,?)",
                         (f"{doc_id}:{pn}:{count}", doc_id, pn, kind, anchor, "needs_review"))
            if proto:
                conn.execute("INSERT INTO protocol_element(id,document_id,element_kind,official_name,raw_definition) "
                             "VALUES(?,?,?,?,?)", (f"{doc_id}:{pn}:proto:{count}",doc_id,
                              "packet" if "packet" in proto.group(2).lower() else "message",
                              proto.group(2), anchor))
    return count


def extract_semantic_catalog(conn: sqlite3.Connection, doc_id: str, ch: int) -> int:
    """Stage ALL detected protocol definitions and mode/procedure headings as candidates.

    The full raw variable/packet/message clause is retained, including length
    and conditional-field text, but it is NOT a validated binary schema.
    """
    count = 0
    rows = conn.execute("SELECT id,clause_no,source_text FROM clause WHERE document_id=?",
                        (doc_id,)).fetchall()
    for cid,no,body in rows:
        heading = body.splitlines()[0].strip() if body else ""
        kind, official, number = None, None, None
        if ch == 7 and no.startswith("7.5.") and re.fullmatch(r"[A-Z][A-Z0-9_]+",heading):
            kind, official = "variable",heading
        elif ch == 7 and no.startswith("7.4."):
            match = re.search(r"Packet Number\s+(\d+)",heading,re.I)
            if match:
                kind,number,official = "packet",int(match.group(1)),heading
        elif ch == 8 and (no.startswith("8.6.") or no.startswith("8.7.")):
            match = re.search(r"Message\s+(\d+)",heading,re.I)
            if match:
                kind,number,official = "radio_message",int(match.group(1)),heading
        if kind:
            conn.execute(
                "INSERT OR IGNORE INTO protocol_element(id,document_id,clause_id,element_kind,"
                "official_name,element_no,raw_definition,review_state) VALUES(?,?,?,?,?,?,?,?)",
                (f"{cid}:structured",doc_id,cid,kind,official,number,body,"extracted_unverified"))
            count += 1
        # Named semantic concepts do not become executable transitions or
        # procedures until their complete rules and dependencies are reviewed.
        if ch in (4,5):
            bits=no.split(".")
            if len(bits)==3 and ((ch==4 and bits[:2]==["4","4"] and 3<=int(bits[2])<=21)
                                 or (ch==5 and bits[0]=="5" and int(bits[1])>=4)):
                term=heading.strip()
                if term:
                    conn.execute("INSERT OR IGNORE INTO terminology VALUES(?,?,?,?,?,?,?)",
                                 (f"{doc_id}:{no}",term,None,
                                  "etcs_mode" if ch==4 else "etcs_procedure",body[:400],cid,
                                  "draft"))
    return count

def ingest(manifest: dict, source_dir: Path, db: Path, report: Path,
           schema: Path, allow_modified: bool = False) -> dict:
    for executable in ("pdftotext","pdfinfo"):
        if not shutil.which(executable):
            raise RuntimeError(f"Install poppler: missing {executable}")
    specs = manifest["volumes"]
    if sorted(int(x["chapter"]) for x in specs) != list(range(1,10)):
        raise ValueError("Manifest must enumerate exactly chapters 1..9")
    prepared = []
    warnings = []
    for spec in sorted(specs, key=lambda x: int(x["chapter"])):
        ch = int(spec["chapter"])
        path = source_dir / spec["filename"]
        if not path.is_file():
            raise FileNotFoundError(f"Missing source PDF: {path}")
        digest = sha256(path.read_bytes())
        if digest != spec["sha256"]:
            if not allow_modified:
                raise ValueError(f"Checksum mismatch: {path} (use --allow-modified-sources to stage explicitly)")
            warnings.append(f"Source differs from pinned reference: {path.name}")
        pages = poppler_pages(path)
        if len(pages) != spec["pages"] or page_count(path) != spec["pages"]:
            raise ValueError(f"Page mismatch for {path}: expected {spec['pages']}, got {len(pages)}")
        prepared.append((spec,path,digest,pages))

    db.parent.mkdir(parents=True,exist_ok=True)
    report.parent.mkdir(parents=True,exist_ok=True)
    tmp = tempfile.NamedTemporaryFile(prefix="esig-",suffix=".sqlite",dir=str(db.parent),delete=False)
    tmp.close()
    totals={"pages":0,"clause_candidates":0,"classification_rows":0,"artifact_candidates":0,"protocol_candidates":0}
    try:
        with sqlite3.connect(tmp.name) as con:
            con.execute("PRAGMA foreign_keys=ON")
            con.executescript(schema.read_text(encoding="utf-8"))
            for spec,path,digest,pages in prepared:
                ch=int(spec["chapter"])
                doc=f"SUBSET-026-{ch}@{manifest['issue']}"
                con.execute("INSERT INTO document VALUES(?,?,?,?,?,?,?,?,?,?)",
                           (doc,f"SUBSET-026-{ch}",manifest["issue"],ch,TITLES[ch],
                            manifest["publication_date"],path.name,digest,len(pages),
                            "pdftotext -layout; candidate-only"))
                for pn,page in enumerate(pages,1):
                    con.execute("INSERT INTO source_page VALUES(?,?,?,?,?)",
                                (doc,pn,page,sha256(page.encode()),1))
                totals["pages"] += len(pages)
                if ch != 9:
                    totals["clause_candidates"] += extract_clauses(con,doc,ch,pages)
                else:
                    totals["classification_rows"] += extract_classification(con,doc,pages,warnings)
                totals["artifact_candidates"] += extract_artifacts(con,doc,ch,pages)
                totals["protocol_candidates"] += extract_semantic_catalog(con,doc,ch)
            con.execute("INSERT INTO ingestion_audit(imported_utc,manifest_sha256,page_count,"
                        "clause_candidates,classification_rows,artifact_candidates,warnings_json)"
                        " VALUES(?,?,?,?,?,?,?)",
                        (dt.datetime.now(dt.timezone.utc).isoformat(),
                         sha256(json.dumps(manifest,sort_keys=True).encode()),totals["pages"],
                         totals["clause_candidates"],totals["classification_rows"],
                         totals["artifact_candidates"],json.dumps(warnings)))
            if con.execute("PRAGMA foreign_key_check").fetchall():
                raise ValueError("Foreign-key integrity failed")
            integrity = con.execute("PRAGMA integrity_check").fetchone()[0]
            if integrity != "ok":
                raise ValueError("SQLite integrity: " + integrity)
            con.commit()
        os.replace(tmp.name,db)
    finally:
        if Path(tmp.name).exists():
            Path(tmp.name).unlink()
    result = {
        "baseline": manifest["issue"], "source_documents": len(prepared),
        **totals, "warnings":warnings, "database":str(db),
        "source_scope":"entire 9-volume SUBSET-026 text, not proven semantic rule coverage",
        "assurance":"unverified source staging; visual tables, diagrams and equations need review"
    }
    report.write_text(json.dumps(result,indent=2)+"\n",encoding="utf-8")
    return result

def main() -> None:
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument("--source-dir",type=Path,default=DEFAULT_SOURCE)
    p.add_argument("--manifest",type=Path,default=DEFAULT_MANIFEST)
    p.add_argument("--db",type=Path,default=DEFAULT_DB)
    p.add_argument("--report",type=Path,default=DEFAULT_REPORT)
    p.add_argument("--schema",type=Path,default=DEFAULT_SCHEMA)
    p.add_argument("--allow-modified-sources",action="store_true")
    args=p.parse_args()
    manifest=json.loads(args.manifest.read_text(encoding="utf-8"))
    if manifest.get("issue")!="4.0.0":
        raise ValueError("Expected pinned SUBSET-026 issue 4.0.0")
    print(json.dumps(ingest(manifest,args.source_dir,args.db,args.report,args.schema,
                            args.allow_modified_sources),indent=2))

if __name__=="__main__":
    main()
