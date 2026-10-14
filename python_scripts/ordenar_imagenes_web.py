"""Compatibility entrypoint; implementation: media/ordenar_imagenes_web.py."""
if __package__:
    from ._compat import export_script
else:
    from _compat import export_script

export_script(globals(), "media/ordenar_imagenes_web.py")
