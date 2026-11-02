"""Montaje final: animación + voz + títulos, subtítulos y el panel de código.

    python3 docs/proceso/video_arduino/montaje.py   ->  render/video_arduino.mp4

Lee tiempos.json y subtitulos.srt (de narracion.py) y escribe video.ass: el título de cada escena,
los subtítulos y, en la escena del programa, el código que se ilumina línea por línea en el momento
en que la voz dice «lee», «convierte» y «escribe». Después lo quema sobre render/animacion.mp4.
"""
import json
import os
import re
import subprocess
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
T = json.load(open(os.path.join(HERE, "tiempos.json")))
ESC = {e["id"]: e for e in T["escenas"]}


def ass_t(s):
    s = max(0.0, s)
    return f"{int(s // 3600)}:{int(s % 3600 // 60):02d}:{s % 60:05.2f}"


def ev(a, b, estilo, texto):
    return f"Dialogue: 0,{ass_t(a)},{ass_t(b)},{estilo},,0,0,0,,{texto}"


CODIGO = [  # (línea, marca en la que se ilumina)
    ("int lectura = analogRead(A0);", "lee"),
    ("int angulo = map(lectura, 40, 985, 20, 160);", "convierte"),
    ("verano.write(angulo);", "escribe"),
    ("invierno.write(180 - angulo);", "escribe"),
]
APAGADO, ENCENDIDO = r"{\1c&H8C8C8C&}", r"{\1c&H5ECFFF&}"  # gris / amarillo (BGR)


def main():
    ev_list = []
    # títulos de escena (el primero es el título del video)
    ev_list.append(ev(0.2, 4.2, "Titulo", r"{\fad(300,300)}Cómo se conecta\N{\fs26}Arduino · protoboard · servos · perilla"))
    for e in T["escenas"][1:]:
        ev_list.append(ev(e["inicio"] + 0.3, e["inicio"] + 3.6, "Escena", r"{\fad(250,250)}" + e["titulo"]))
    # subtítulos
    srt = open(os.path.join(HERE, "subtitulos.srt")).read().strip().split("\n\n")
    for bloque in srt:
        _, tiempos, *texto = bloque.split("\n")
        a, b = [sum(float(x) * f for x, f in zip(re.split("[:,]", t)[:3], (3600, 60, 1))) +
                int(re.split("[:,]", t)[3]) / 1000 for t in tiempos.split(" --> ")]
        ev_list.append(ev(a, b, "Sub", " ".join(texto)))
    # leyenda de colores de la escena «ida, vuelta y colores»: aparece cuando la voz nombra cada uno
    c = ESC["circuito"]
    fin_c = c["inicio"] + c["duracion"]
    for i, (marca, txt) in enumerate((("rojo", r"{\1c&H3B3BE8&}■ {\1c&HEFF3F4&}rojo = 5 volts"),
                                      ("negro", r"{\1c&H22406B&}■ {\1c&HEFF3F4&}negro / café = tierra"),
                                      ("senal", r"{\1c&H248AF0&}■ {\1c&HEFF3F4&}naranjo / amarillo = señal"))):
        ev_list.append(ev(c["marcas"][marca], fin_c, "Leyenda",
                          r"{\an7\pos(36," + str(96 + i * 44) + r")\fad(200,250)}" + txt))
    # panel de código en la escena del programa
    p = ESC["programa"]
    cortes = [p["inicio"] + 0.8, p["marcas"]["lee"], p["marcas"]["convierte"], p["marcas"]["escribe"],
              p["inicio"] + p["duracion"]]
    activas = [set(), {"lee"}, {"convierte"}, {"escribe"}]
    for (a, b), act in zip(zip(cortes, cortes[1:]), activas):
        lineas = [(ENCENDIDO if marca in act else APAGADO) + txt for txt, marca in CODIGO]
        fade = r"{\fad(250,0)}" if not act else r"{\fad(0,250)}" if "escribe" in act else ""
        # \an7 + \pos: bloque arriba a la derecha, pero con las líneas alineadas a la izquierda
        ev_list.append(ev(a, b, "Codigo", r"{\an7\pos(745,34)}" + fade + r"\N".join(lineas)))

    cabecera = """[Script Info]
ScriptType: v4.00+
PlayResX: 1280
PlayResY: 720
WrapStyle: 0

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Sub,Helvetica Neue,28,&H00F4F3EF,&H00F4F3EF,&H9E141413,&H9E141413,0,0,0,0,100,100,0,0,3,9,0,2,90,90,30,1
Style: Titulo,Helvetica Neue,46,&H00F4F3EF,&H00F4F3EF,&H9E141413,&H9E141413,1,0,0,0,100,100,0,0,3,16,0,8,80,80,46,1
Style: Escena,Helvetica Neue,30,&H00F4F3EF,&H00F4F3EF,&HA0141413,&HA0141413,1,0,0,0,100,100,0,0,3,11,0,7,36,36,30,1
Style: Leyenda,Helvetica Neue,28,&H00F4F3EF,&H00F4F3EF,&HA0141413,&HA0141413,1,0,0,0,100,100,0,0,3,10,0,7,36,36,30,1
Style: Codigo,Menlo,21,&H00F4F3EF,&H00F4F3EF,&HB0141413,&HB0141413,0,0,0,0,100,100,0,0,3,14,0,9,36,36,36,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
"""
    ass = os.path.join(HERE, "video.ass")
    open(ass, "w").write(cabecera + "\n".join(ev_list) + "\n")
    if "--solo-ass" in sys.argv:
        return
    anim = os.path.join(HERE, "render", "animacion.mp4")
    voz = os.path.join(HERE, "audio", "voz.wav")
    out = os.path.join(HERE, "render", "video_arduino.mp4")
    # render/parche_<escena>.mp4 (escenas re-renderizadas solas) reemplazan su tramo de la animación
    parches = sorted((ESC[e]["inicio"], e) for e in ESC
                     if os.path.exists(os.path.join(HERE, "render", f"parche_{e}.mp4")))
    entradas, tramos, cursor = ["-i", anim], [], 0
    for n, (_, e) in enumerate(parches, 1):
        a = round(ESC[e]["inicio"] * 24)  # primer cuadro de la escena (desde 0)
        b = round((ESC[e]["inicio"] + ESC[e]["duracion"]) * 24)
        entradas += ["-i", os.path.join(HERE, "render", f"parche_{e}.mp4")]
        tramos += [f"[0:v]trim=start_frame={cursor}:end_frame={a},setpts=PTS-STARTPTS[v{n}a]",
                   f"[{n}:v]setpts=PTS-STARTPTS[v{n}b]"]
        cursor = b
    k = len(parches)
    tramos.append(f"[0:v]trim=start_frame={cursor},setpts=PTS-STARTPTS[vfin]")
    orden = "".join(f"[v{n}a][v{n}b]" for n in range(1, k + 1)) + "[vfin]"
    filtro = ";".join(tramos) + f";{orden}concat=n={2 * k + 1}:v=1:a=0[anim];[anim]subtitles={ass}[v]"
    subprocess.run(["ffmpeg", "-v", "error", "-y", *entradas, "-i", voz, "-filter_complex", filtro,
                    "-map", "[v]", "-map", f"{k + 1}:a", "-c:v", "libx264", "-crf", "20", "-preset", "slow",
                    "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "160k", "-ar", "48000", "-shortest",
                    "-movflags", "+faststart", out], check=True)
    print(out)


if __name__ == "__main__":
    main()
