"""Preserve historical command and import paths while implementations move."""
import sys
from pathlib import Path


def export_script(namespace, relative_path):
    scripts = Path(__file__).resolve().parent
    target = scripts / relative_path
    # Existing imports use the historical module names; both direct commands
    # and imports keep finding these lightweight entrypoints.
    for directory in (str(scripts), str(target.parent)):
        if directory not in sys.path:
            sys.path.insert(0, directory)
    namespace["__file__"] = str(target)
    exec(compile(target.read_text(encoding="utf-8"), str(target), "exec"), namespace)
