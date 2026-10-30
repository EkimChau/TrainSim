#!/usr/bin/env python3
"""Fetch published scenario datasets into an untracked, integrity-checked local cache.

Examples:
  python3 public/internet-specs/fetch_datasets.py --list
  python3 public/internet-specs/fetch_datasets.py --id OSRD-SMALL-INFRA
  python3 public/internet-specs/fetch_datasets.py --id OSMHPI-LOCKTABLE --id SBB-UC2
  python3 public/internet-specs/fetch_datasets.py --all --include-large

No software execution, zip extraction or interpretation of signalling logic occurs.
"""
from __future__ import annotations

import argparse
import datetime as dt
import hashlib
import json
import os
from pathlib import Path
import shutil
import sys
import urllib.error
import urllib.parse
import urllib.request
import zipfile

ROOT = Path(__file__).resolve().parent
INDEX = ROOT / "scenario-datasets.json"
OUT = ROOT / "downloads" / "scenario-datasets"
LOCK = ROOT / "scenario-download-lock.json"
GITHUB_REPOS = "github.com"
ALLOWED = {
    "github.com", "codeload.github.com", "raw.githubusercontent.com",
    "displib.github.io", "static.openrails.org", "ts-files.com",
    "development.railml.org"
}
MAX_AUTO = 32 * 1024 * 1024  # Larger than this needs --include-large
BUF = 1024 * 1024


def approved_url(url: str) -> bool:
    p = urllib.parse.urlsplit(url)
    return p.scheme == "https" and p.hostname in ALLOWED and not p.username and not p.password


def checksum(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as fp:
        while b := fp.read(BUF):
            h.update(b)
    return h.hexdigest()


def check_content(path: Path, url: str) -> None:
    suffix = urllib.parse.urlsplit(url).path.lower()
    if path.stat().st_size == 0:
        raise ValueError("empty source file")
    if suffix.endswith(".zip"):
        if not zipfile.is_zipfile(path):
            raise ValueError("server did not send a zip archive")
        # Do not extract untrusted third-party archives.
        with zipfile.ZipFile(path) as z:
            failed = z.testzip()
            if failed:
                raise ValueError("bad CRC: " + failed)
    elif suffix.endswith(".json"):
        with path.open(encoding="utf-8-sig") as fp:
            json.load(fp)
    elif suffix.endswith(".xml"):
        import xml.etree.ElementTree as ET
        ET.parse(path)
    else:
        raise ValueError("unsupported downloadable extension " + suffix)


def get(item: dict, *, include_large: bool) -> dict:
    url = item["download_url"]
    if not url or not approved_url(url):
        raise ValueError("download URL absent/not in allowlist")
    extension = Path(urllib.parse.urlsplit(url).path).suffix.lower()
    if extension not in (".zip", ".json", ".xml"):
        raise ValueError("unexpected extension: " + extension)
    dst = OUT / (item["id"] + extension)
    dst.parent.mkdir(parents=True, exist_ok=True)
    if dst.is_file():
        check_content(dst, url)
        status = "cached"
    else:
        tmp = dst.with_suffix(dst.suffix + ".partial")
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "TrainSim-Scenario-Archiver/1.0"})
            with urllib.request.urlopen(req, timeout=120) as response, tmp.open("wb") as fp:
                final_url = response.geturl()
                if not approved_url(final_url):
                    raise ValueError("redirect to unapproved host: " + final_url)
                declared = response.headers.get("Content-Length")
                if not include_large and declared and int(declared) > MAX_AUTO:
                    raise ValueError("large dataset; pass --include-large")
                if "text/html" in response.headers.get("Content-Type", "").lower():
                    raise ValueError("server returned an HTML page")
                total = 0
                while block := response.read(BUF):
                    total += len(block)
                    if not include_large and total > MAX_AUTO:
                        raise ValueError("large dataset; pass --include-large")
                    fp.write(block)
            check_content(tmp, url)
            os.replace(tmp, dst)
            status = "downloaded"
        except Exception:
            tmp.unlink(missing_ok=True)
            raise
    return {
        "id": item["id"], "source_version": item["source_version"], "status": status,
        "download_url": url, "path": str(dst.relative_to(ROOT)),
        "sha256": checksum(dst), "bytes": dst.stat().st_size,
        "download_checked_utc": dt.datetime.now(dt.timezone.utc).isoformat(),
        "redistributable": False,
        "fidelity": "source_data_only_not_simulator_certification"
    }


def main() -> int:
    p = argparse.ArgumentParser(description=__doc__)
    mode = p.add_mutually_exclusive_group()
    mode.add_argument("--id", dest="ids", action="append", help="Repeat to select IDs")
    mode.add_argument("--all", action="store_true", help="Download all directly linked datasets")
    p.add_argument("--list", action="store_true", help="Print catalogue; no network")
    p.add_argument("--include-large", action="store_true", help="Permit archives larger than 32 MiB")
    a = p.parse_args()
    records = json.loads(INDEX.read_text(encoding="utf-8"))["datasources"]
    by_id = {r["id"]: r for r in records}
    if a.list:
        for r in records:
            print(f'{r["id"]:25s} {r["kind"]:24s} {r["confidence"]:27s} ' + ("direct" if r["download_url"] else "reference-only"))
        return 0
    if a.ids:
        unknown = set(a.ids) - set(by_id)
        if unknown:
            p.error("Unknown IDs: " + ", ".join(sorted(unknown)))
        selected = [by_id[i] for i in dict.fromkeys(a.ids)]
    elif a.all:
        selected = records
    else:
        p.error("Select --id, --all or --list; no implicit bulk download")
    lock = json.loads(LOCK.read_text()) if LOCK.exists() else {"schema_version": 1, "datasets": {}}
    failed = []
    seen_urls = {}
    for item in selected:
        id_ = item["id"]
        if not item["download_url"]:
            print(f"REFERENCE {id_}: download manually from {item['source_url']}")
            continue
        if item["download_url"] in seen_urls:
            print(f"REUSE {id_}: same upstream archive as {seen_urls[item['download_url']]}")
            lock["datasets"][id_] = dict(lock["datasets"][seen_urls[item["download_url"]]], id=id_, reused_from=seen_urls[item["download_url"]])
            continue
        try:
            record = get(item, include_large=a.include_large)
            lock["datasets"][id_] = record
            seen_urls[item["download_url"]] = id_
            print(f'{record["status"].upper()} {id_} ({record["bytes"]} bytes, SHA256 {record["sha256"][:16]}...)')
        except Exception as exc:
            failed.append(id_)
            print(f"FAILED {id_}: {exc}", file=sys.stderr)
    LOCK.write_text(json.dumps(lock, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    print(f"Provenance: {LOCK} (local only; sources are not certified)")
    return int(bool(failed))


if __name__ == "__main__":
    raise SystemExit(main())
