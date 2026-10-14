"""Compatibility entrypoint; implementation: atlas/build_web_data.py."""
if __package__:
    from ._compat import export_script
else:
    from _compat import export_script

export_script(globals(), "atlas/build_web_data.py")
