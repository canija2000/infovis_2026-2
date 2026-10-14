"""Compatibility entrypoint; implementation: overview/build_overview_data.py."""
if __package__:
    from ._compat import export_script
else:
    from _compat import export_script

export_script(globals(), "overview/build_overview_data.py")
