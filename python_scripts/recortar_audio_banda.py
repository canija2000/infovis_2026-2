"""Compatibility entrypoint; implementation: media/recortar_audio_banda.py."""
if __package__:
    from ._compat import export_script
else:
    from _compat import export_script

export_script(globals(), "media/recortar_audio_banda.py")
