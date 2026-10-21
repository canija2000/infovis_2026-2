#!/usr/bin/env python3
"""Package historical web trees and the latest site for GitHub Pages."""

import io
import json
from pathlib import Path
import re
import shutil
import subprocess
import tarfile
import tempfile


ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "_site"
MANIFEST = ROOT / "scripts" / "pages-versions.json"


def git(*args: str) -> bytes:
    return subprocess.check_output(["git", *args], cwd=ROOT)


def extract_web(commit: str, target: Path) -> None:
    archive = git("archive", "--format=tar", f"{commit}:web")
    with tarfile.open(fileobj=io.BytesIO(archive)) as contents:
        if any(not (member.isfile() or member.isdir()) for member in contents):
            raise ValueError(f"{commit}: Pages no admite enlaces simbólicos ni duros")
        contents.extractall(target, filter="data")
    if not (target / "index.html").is_file():
        raise ValueError(f"{commit}: falta web/index.html")


def build() -> None:
    current = git("rev-parse", "HEAD").decode().strip()
    configured = json.loads(MANIFEST.read_text(encoding="utf-8"))
    versions = []
    paths = set()
    for version in configured:
        path = version["path"]
        reference = version.get("commit", version.get("ref"))
        commit = current if path == "v4" and reference == "HEAD" else reference
        if not re.fullmatch(r"v[1-9]\d*", path) or path in paths:
            raise ValueError(f"Ruta histórica inválida o repetida: {path}")
        if not re.fullmatch(r"[0-9a-f]{40}", commit):
            raise ValueError(f"{path}: se requiere un SHA completo e inmutable")
        git("cat-file", "-e", f"{commit}:web/index.html")
        paths.add(path)
        versions.append({"path": path, "commit": commit})

    # Only replace the directory created by this publisher, never source files.
    if OUTPUT.exists() and not (OUTPUT / "versions.json").is_file():
        raise ValueError("_site existe y no es una salida reconocida de este publicador")

    with tempfile.TemporaryDirectory(prefix=".pages-build-", dir=ROOT) as temp:
        staged = Path(temp) / "site"
        staged.mkdir()
        extract_web(current, staged)
        published = []
        for version in versions:
            path, commit = version["path"], version["commit"]
            target = staged / path
            if target.exists():
                raise ValueError(f"web/{path} ya existe: no se sobrescribirá")
            target.mkdir()
            extract_web(commit, target)
            published.append({
                "path": f"{path}/",
                "commit": commit,
                "commit_date": git("show", "-s", "--format=%cI", commit).decode().strip(),
            })
            print(f"/{path}/ = {commit}")

        (staged / ".nojekyll").touch()
        (staged / "versions.json").write_text(
            json.dumps({"current": current, "versions": published}, indent=2) + "\n",
            encoding="utf-8",
        )
        total = sum(file.stat().st_size for file in staged.rglob("*") if file.is_file())
        if OUTPUT.exists():
            shutil.rmtree(OUTPUT)
        staged.rename(OUTPUT)
    print(f"Sitio preparado en _site: {total / 1024 / 1024:.1f} MiB")


if __name__ == "__main__":
    build()
