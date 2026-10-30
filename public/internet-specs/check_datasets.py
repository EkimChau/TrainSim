#!/usr/bin/env python3
"""Validate scenario catalogue and exact provenance of included upstream GPL fixtures."""
import hashlib
import json
from pathlib import Path
from urllib.parse import urlsplit

root = Path(__file__).resolve().parent
catalogue = json.loads((root / "scenario-datasets.json").read_text(encoding="utf-8"))
assert catalogue["schema_version"] == "1.0.0"
entries = catalogue["datasources"]
assert len(entries) >= 10
ids = set()
for d in entries:
    assert d["id"] not in ids, "duplicate scenario ID: " + d["id"]
    ids.add(d["id"])
    for key in ("title", "region", "kind", "source_url", "source_version", "licence",
                "coverage", "missing_for_complete_etcs_l2", "confidence", "scale"):
        assert d.get(key), f'{d["id"]}: missing {key}'
    assert d["status"] == "published_example_not_certified"
    assert urlsplit(d["source_url"]).scheme == "https"
    if d["download_url"]:
        assert urlsplit(d["download_url"]).scheme == "https"
    assert d["missing_for_complete_etcs_l2"], d["id"] + ": missing gaps"
for id_ in ("OSMHPI-LOCKTABLE", "OSMHPI-GEO", "OSRD-SMALL-INFRA",
            "SBB-UC1", "SBB-UC2", "SBB-UC3", "DISPLIB-NOR", "RAILML-SIMPLE31"):
    assert id_ in ids, "missing primary candidate " + id_

expected = {
    "locking_table.json": ("1194ada7ff6c99a7101b355677ec93f6cf632cd4",
                           {"Route": 2, "Point": 2, "Zone": 5, "Transit": 14, "Signal": 3}),
    "geographical.json": ("50cd91a2b01f10dde836caca03650c95c365fb73",
                          {"Route": 2, "Point": 2, "Zone": 5, "Transit": 14, "Signal": 3}),
}
seed_dir = root / "dataset-seeds" / "osmhpi"
for filename, (sha, counts) in expected.items():
    data = (seed_dir / filename).read_bytes()
    computed = hashlib.sha1(f"blob {len(data)}\\0".encode().replace(b"\\0", b"\x00") + data).hexdigest()
    assert computed == sha, f"{filename}: source Git blob SHA changed"
    obj = json.loads(data)
    for k, value in counts.items():
        assert len(obj[k]) == value, f"{filename}: {k} changed"
assert "GNU GENERAL PUBLIC LICENSE" in (seed_dir / "LICENSE.md").read_text()
print(f"PASS: {len(entries)} candidate scenario records and two exact GPL-3.0 sample configurations.")
print("NOT VERIFIED: network downloads, test execution, operational conformance, and any certification.")
