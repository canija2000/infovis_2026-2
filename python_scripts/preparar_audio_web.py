"""Compatibility entrypoint; implementation: media/preparar_audio_web.py."""
if __package__:
    from ._compat import export_script
else:
    from _compat import export_script

export_script(globals(), "media/preparar_audio_web.py")
