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


# Version menu injected into every published page that lacks one, so visitors
# can jump between versions from any copy. Historical trees stay untouched in
# Git; the injected blocks are delimited so tests can strip them back out.
NAV_START = b"<!-- versiones:inicio -->"
NAV_END = b"<!-- versiones:fin -->"
NAV_CLASS = b'class="project-versions"'


def version_label(path: str, final: str) -> str:
    if path == "prueba-antes-pr27":
        return "Vista previa <span>· antes del PR #27</span>"
    number = path[1:]
    return f"Versión {number} <span>· final</span>" if path == final else f"Versión {number}"


def version_nav(current: str, prefix: str, numbered: list[str], final: str) -> bytes:
    """Menu for a page in version `current`; `prefix` leads back to the site root."""
    links = []
    for path in numbered:
        href = (prefix or "./") if path == final else f"{prefix}{path}/"
        active = ' aria-current="true"' if path == current else ""
        links.append(f'      <a href="{href}"{active}>{version_label(path, final)}</a>')
    html = "\n".join([
        '  <nav class="project-versions" aria-label="Versiones del proyecto">',
        f'    <p class="version-current">{version_label(current, final)}</p>',
        '    <div class="version-links">',
        '      <span class="version-links-label">Versiones:</span>',
        *links,
        "    </div>",
        "  </nav>",
    ])
    return f"\n{html}\n".encode()


def inject_nav(directory: Path, current: str, prefix: str, numbered: list[str], final: str) -> int:
    """Add the version menu (and its stylesheet) to every HTML page in `directory`."""
    injected = 0
    for page in sorted(directory.glob("*.html")):
        content = page.read_bytes()
        if NAV_START in content or NAV_END in content:
            raise ValueError(f"{page}: ya contiene marcadores del menú de versiones")
        if NAV_CLASS in content:
            continue  # the page ships its own menu (the current index.html)
        body = re.search(rb"<body\b[^>]*>", content, re.IGNORECASE)
        head_end = content.lower().find(b"</head>")
        if not body or head_end == -1 or head_end > body.start():
            raise ValueError(f"{page}: no se encontró <head>/<body> para insertar el menú")
        stylesheet = f'\n  <link rel="stylesheet" href="{prefix}css/versions.css">\n'.encode()
        content = b"".join([
            content[:head_end],
            NAV_START, stylesheet, NAV_END,
            content[head_end:body.end()],
            NAV_START, version_nav(current, prefix, numbered, final), NAV_END,
            content[body.end():],
        ])
        page.write_bytes(content)
        injected += 1
    return injected


def build() -> None:
    current = git("rev-parse", "HEAD").decode().strip()
    configured = json.loads(MANIFEST.read_text(encoding="utf-8"))
    versions = []
    paths = set()
    for version in configured:
        path = version["path"]
        reference = version.get("commit", version.get("ref"))
        commit = current if path == "v4" and reference == "HEAD" else reference
        if not re.fullmatch(r"(?:v[1-9]\d*|prueba-antes-pr27)", path) or path in paths:
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

        numbered = sorted(
            (v["path"] for v in versions if re.fullmatch(r"v\d+", v["path"])),
            key=lambda path: int(path[1:]),
        )
        final = numbered[-1]
        count = inject_nav(staged, final, "", numbered, final)
        for version in versions:
            path = version["path"]
            count += inject_nav(staged / path, path, "../", numbered, final)
        print(f"Menú de versiones insertado en {count} páginas")

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
