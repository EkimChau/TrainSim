#!/usr/bin/env python3
"""Fetch pinned public standards into a local, untracked TrainSim cache.

Usage:
  python3 public/internet-specs/fetch_specs.py --list
  python3 public/internet-specs/fetch_specs.py --priority core
  python3 public/internet-specs/fetch_specs.py --all
  python3 public/internet-specs/fetch_specs.py --id SUBSET-040 --id SUBSET-076-7

Never equate a downloaded source with a certified implementation.
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
import time
import urllib.error
import urllib.parse
import urllib.request
import zipfile

ROOT = Path(__file__).resolve().parent
CATALOG = ROOT / "catalog.json"
DOWNLOADS = ROOT / "downloads"
LOCK = ROOT / "download-lock.json"
ALLOWED_HOSTS = {
    "www.era.europa.eu",
    "era.europa.eu",
    "eur-lex.europa.eu",
    "rdso.indianrailways.gov.in",
    "www.tmr.qld.gov.au",
    "www.era.europa.eu",
}
USER_AGENT = "TrainSim-Reference-Archiver/1.0 (research use; follow source terms)"
CHUNK_BYTES = 1024 * 1024


def digest(path: Path) -> str:
    value = hashlib.sha256()
    with path.open("rb") as handle:
        for block in iter(lambda: handle.read(CHUNK_BYTES), b""):
            value.update(block)
    return value.hexdigest()


def validate(path: Path, fmt: str) -> None:
    if path.stat().st_size == 0:
        raise ValueError("empty file")
    if fmt == "pdf" and path.open("rb").read(5) != b"%PDF-":
        raise ValueError("not a PDF signature")
    if fmt == "zip":
        if not zipfile.is_zipfile(path):
            raise ValueError("not a ZIP archive")
        with zipfile.ZipFile(path) as archive:
            bad = archive.testzip()
            if bad:
                raise ValueError("ZIP member failed CRC: " + bad)


def dest_for(item: dict) -> Path:
    parsed = urllib.parse.urlsplit(item["download_url"])
    original_suffix = ".zip" if item["format"] == "zip" else ".pdf"
    safe_id = "".join(ch if ch.isalnum() or ch in "._-" else "_" for ch in item["id"])
    safe_version = "".join(ch if ch.isalnum() or ch in "._-" else "_" for ch in item["version"])
    return DOWNLOADS / item["component"] / f"{safe_id}__{safe_version}{original_suffix}"


def fetch(item: dict, attempts: int = 4) -> dict:
    url = item["download_url"]
    if not url:
        raise ValueError("no direct download (reference only)")
    parsed = urllib.parse.urlsplit(url)
    if parsed.scheme != "https" or parsed.hostname not in ALLOWED_HOSTS:
        raise ValueError(f"download host not allowlisted: {parsed.hostname}")
    output = dest_for(item)
    output.parent.mkdir(parents=True, exist_ok=True)
    if output.exists():
        validate(output, item["format"])
        return result_for(item, output, "existing")
    tmp = output.with_suffix(output.suffix + ".partial")
    for attempt in range(attempts):
        try:
            request = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
            with urllib.request.urlopen(request, timeout=90) as response, tmp.open("wb") as target:
                final = urllib.parse.urlsplit(response.geturl())
                if final.scheme != "https" or final.hostname not in ALLOWED_HOSTS:
                    raise ValueError("unexpected redirect destination: " + str(final.hostname))
                content_type = response.headers.get("Content-Type", "").lower()
                if "text/html" in content_type:
                    raise ValueError("server returned HTML rather than downloadable content")
                shutil.copyfileobj(response, target, length=CHUNK_BYTES)
            validate(tmp, item["format"])
            os.replace(tmp, output)
            return result_for(item, output, "downloaded")
        except (urllib.error.HTTPError, urllib.error.URLError, TimeoutError, OSError) as error:
            tmp.unlink(missing_ok=True)
            if attempt + 1 == attempts:
                raise
            if isinstance(error, urllib.error.HTTPError) and error.code not in (408, 429, 500, 502, 503, 504):
                raise
            wait = min(30, 2 ** (attempt + 1))
            print(f"  retry {attempt+1}/{attempts} after {wait}s: {error}", file=sys.stderr)
            time.sleep(wait)
        except Exception:
            tmp.unlink(missing_ok=True)
            raise
    raise RuntimeError("unreachable")


def result_for(item: dict, path: Path, status: str) -> dict:
    return {
        "id": item["id"], "version": item["version"], "status": status,
        "sha256": digest(path), "bytes": path.stat().st_size,
        "relative_path": str(path.relative_to(ROOT)),
        "source_url": item["download_url"],
        "checked_utc": dt.datetime.now(dt.timezone.utc).isoformat(),
        "licence": "redistribution_not_assessed",
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    selection = parser.add_mutually_exclusive_group()
    selection.add_argument("--all", action="store_true", help="Fetch every direct-linked item, including all 13 large test archives")
    selection.add_argument("--priority", choices=["core", "extended", "context"], help="Fetch all items with specified priority (default: core)")
    selection.add_argument("--id", action="append", dest="ids", help="Fetch selected document ID; repeatable")
    parser.add_argument("--list", action="store_true", help="Show source catalogue without downloading")
    parser.add_argument("--seed-local", type=Path, help="Copy locally supplied SUBSET-026-1 ... -9 v400.pdf into local cache (untracked)")
    args = parser.parse_args()
    items = json.loads(CATALOG.read_text(encoding="utf-8"))["items"]
    if args.list:
        for item in items:
            print(f'{item["id"]:29s}  {item["version"]:24s}  {item["priority"]:8s}  {item["component"]}')
        return 0
    selected = [item for item in items if (args.all or
        (item["id"] in args.ids if args.ids else item["priority"] == (args.priority or "core")))]
    if args.ids:
        unknown = set(args.ids) - {i["id"] for i in items}
        if unknown:
            parser.error("unknown IDs: " + ", ".join(sorted(unknown)))
    lock = json.loads(LOCK.read_text()) if LOCK.exists() else {"schema_version": 1, "items": {}}
    errors = []
    for item in selected:
        if not item["download_url"]:
            print(f'SKIP {item["id"]}: official reference link only')
            continue
        try:
            record = fetch(item)
            lock["items"][item["id"]] = record
            print(f'{record["status"].upper():10s} {item["id"]}: {record["bytes"]} bytes sha256={record["sha256"][:16]}…')
        except Exception as error:
            errors.append((item["id"], str(error)))
            print(f'ERROR {item["id"]}: {error}', file=sys.stderr)
    if args.seed_local:
        for n in range(1, 10):
            source = args.seed_local / f"SUBSET-026-{n} v400.pdf"
            if not source.is_file():
                print(f"SKIP local seed: {source}", file=sys.stderr)
                continue
            target = DOWNLOADS / "obu-rbc" / f"SUBSET-026-{n}__4.0.0.pdf"
            target.parent.mkdir(parents=True, exist_ok=True)
            shutil.copyfile(source, target)
            validate(target, "pdf")
            lock["items"][f"SUBSET-026-{n}"] = {
                "id": f"SUBSET-026-{n}", "version": "4.0.0", "status": "user_supplied",
                "relative_path": str(target.relative_to(ROOT)), "sha256": digest(target),
                "bytes": target.stat().st_size,
                "checked_utc": dt.datetime.now(dt.timezone.utc).isoformat(),
                "licence": "redistribution_not_assessed",
            }
    LOCK.write_text(json.dumps(lock, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    print(f"Lock recorded: {LOCK.relative_to(ROOT)} (untracked; hashes are evidence of bytes, not approval)")
    if errors:
        print("Failed IDs: " + ", ".join(key for key, _ in errors), file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
