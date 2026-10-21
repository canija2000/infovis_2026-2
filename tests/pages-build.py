#!/usr/bin/env python3
"""Check published files against Git blobs, including every historical asset."""

import hashlib
import json
from pathlib import Path
import subprocess


ROOT = Path(__file__).resolve().parents[1]
SITE = ROOT / "_site"


def verify_tree(commit: str, directory: Path, excluded: set[str]) -> None:
    entries = subprocess.check_output(
        ["git", "ls-tree", "-rz", f"{commit}:web"], cwd=ROOT
    ).split(b"\0")
    expected = {}
    for entry in filter(None, entries):
        metadata, filename = entry.split(b"\t", 1)
        mode, kind, digest = metadata.split()
        assert kind == b"blob" and mode in (b"100644", b"100755"), entry
        expected[filename.decode()] = digest.decode()
    actual = {
        file.relative_to(directory).as_posix(): file
        for file in directory.rglob("*")
        if file.is_file() and file.relative_to(directory).parts[0] not in excluded
    }
    assert actual.keys() == expected.keys(), f"Archivos faltantes o adicionales: {directory}"
    for name, digest in expected.items():
        content = actual[name].read_bytes()
        header = f"blob {len(content)}\0".encode()
        assert hashlib.sha1(header + content).hexdigest() == digest, str(actual[name])
        assert not actual[name].is_symlink(), str(actual[name])
    print(f"{directory.relative_to(SITE) or '.'}: {len(actual)} archivos idénticos a {commit[:7]}")


if __name__ == "__main__":
    versions = json.loads((ROOT / "scripts/pages-versions.json").read_text())
    for version in versions:
        reference = version.get("commit", version.get("ref"))
        version["commit"] = subprocess.check_output(
            ["git", "rev-parse", "--verify", reference + "^{commit}"], cwd=ROOT
        ).decode().strip()
    published = json.loads((SITE / "versions.json").read_text())
    current = subprocess.check_output(["git", "rev-parse", "HEAD"], cwd=ROOT).decode().strip()
    assert published["current"] == current
    assert next(v["commit"] for v in published["versions"] if v["path"] == "v4/") == current
    assert [(v["path"], v["commit"]) for v in published["versions"]] == [
        (v["path"] + "/", v["commit"]) for v in versions
    ]
    assert (SITE / ".nojekyll").is_file()
    verify_tree(current, SITE, {v["path"] for v in versions} | {"versions.json", ".nojekyll"})
    for version in versions:
        verify_tree(version["commit"], SITE / version["path"], set())
