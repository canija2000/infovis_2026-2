"""Compatibility entrypoint; implementation: aviary/build_game_data.py."""
if __package__:
    from ._compat import export_script
else:
    from _compat import export_script

export_script(globals(), "aviary/build_game_data.py")
