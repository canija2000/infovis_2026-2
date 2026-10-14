"""Compatibility entrypoint; implementation: media/analizar_audio_loop.py."""
if __package__:
    from ._compat import export_script
else:
    from _compat import export_script

export_script(globals(), "media/analizar_audio_loop.py")
