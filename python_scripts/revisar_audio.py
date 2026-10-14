"""Compatibility entrypoint; implementation: media/revisar_audio.py."""
if __package__:
    from ._compat import export_script
else:
    from _compat import export_script

export_script(globals(), "media/revisar_audio.py")
