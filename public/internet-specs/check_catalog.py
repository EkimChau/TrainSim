#!/usr/bin/env python3
"""Validate the curated catalogue without network access or external packages."""
import json
from pathlib import Path
from urllib.parse import urlsplit

root = Path(__file__).resolve().parent
data = json.loads((root / "catalog.json").read_text(encoding="utf-8"))
assert data["schema_version"] == "1.0.0"
ids = set()
for item in data["items"]:
    assert item["id"] not in ids, "duplicate ID: " + item["id"]
    ids.add(item["id"])
    for field in ("domain", "component", "document", "version", "source_url", "authority",
                  "format", "jurisdiction", "priority", "certification", "redistribution"):
        assert item.get(field), f'{item["id"]}: missing {field}'
    source = urlsplit(item["source_url"])
    assert source.scheme == "https" and source.netloc, item["id"] + ": unsafe source URL"
    url = item.get("download_url")
    if url:
        parsed = urlsplit(url)
        assert parsed.scheme == "https" and parsed.netloc, item["id"] + ": unsafe download URL"
        assert item["format"] in ("pdf", "zip"), item["id"] + ": wrong downloadable format"
    elif item["format"] in ("pdf", "zip"):
        raise AssertionError(item["id"] + ": binary format without direct URL")
for i in range(1, 14):
    assert f"SUBSET-076-6-3-P{i:02d}" in ids
assert "OPE-TSI-APP-A-V6" in ids
assert "TEL-TSI-2026" in ids
assert "IND-CAMTECH-INTERLOCKING" in ids
assert all(data[k] for k in ("license_policy", "verification_policy", "selected_reference_profile"))
print(f"OK: {len(ids)} uniquely versioned references; 13 SUBSET-076 test sequence parts; source URLs syntactically valid")
print("NOTE: This local check DOES NOT verify HTTP availability, contents, versions, licences or certification.")
