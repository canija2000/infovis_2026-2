"""Guion del video educativo «Cómo se conecta: Arduino, protoboard, servos y perilla».

Cada escena tiene la narración (la lee la voz de Gemini) y las marcas: palabras de la narración
donde ocurre algo en pantalla. El tiempo de cada marca se estima por su posición en el texto
(narracion.py lo calcula con la duración real del audio) y escena_blender.py anima ahí.

Tono: didáctico y concreto, sin sobreexplicar. Siempre: qué es, qué pin usa y por qué.
"""

VOZ = "Charon"  # voz «informativa» de Gemini TTS
ESTILO = ("Lee en español latinoamericano neutro, con voz de profesor cercano: clara y cálida, "
          "a ritmo de conversación ágil, sin pausas largas y sin exagerar. Texto: ")

ESCENAS = [
    {
        "id": "intro",
        "titulo": "Una perilla, dos brazos",
        "texto": "En este prototipo, una perilla mueve dos brazos: uno para las aves que llegan "
                 "en verano y otro para las de invierno. Veamos qué hace cada pieza, cómo se "
                 "conecta y por qué se conecta así.",
        "marcas": {"perilla": "perilla", "brazos": "dos brazos", "pieza": "cada pieza"},
    },
    {
        "id": "leonardo",
        "titulo": "El Arduino Leonardo",
        "texto": "Este es el Arduino Leonardo: un pequeño computador que lee sensores y controla "
                 "motores. Por el cable USB recibe energía y el programa. Alrededor tiene filas "
                 "de pines: cada pin es una puerta por donde entra o sale una señal eléctrica.",
        "marcas": {"usb": "cable USB", "pines": "filas de pines", "puerta": "cada pin"},
    },
    {
        "id": "tipos",
        "titulo": "Tres grupos de pines",
        "texto": "Los pines se ordenan en tres grupos. Arriba, los digitales: solo conocen dos "
                 "estados, encendido o apagado. Los que llevan una virgulilla, como el cinco y el "
                 "seis, además pueden emitir pulsos muy rápidos, que es justo lo que entienden los "
                 "servos. Abajo a la derecha, los analógicos, de A cero a A cinco: miden voltajes "
                 "intermedios. Y abajo a la izquierda, los de energía: cinco volts y tierra.",
        "marcas": {"digitales": "los digitales", "pwm": "virgulilla", "analogicos": "los analógicos",
                   "energia": "los de energía"},
    },
    {
        "id": "cinco",
        "titulo": "Los cinco pines que usamos",
        "texto": "De todos ellos usaremos solo cinco: cinco volts y tierra para dar energía, "
                 "A cero para leer la perilla, y los pines cinco y seis para darle órdenes a cada "
                 "servo.",
        "marcas": {"energia": "para dar energía", "a0": "A cero para", "pines56": "los pines cinco y seis"},
    },
    {
        "id": "circuito",
        "titulo": "Ida, vuelta y colores",
        "texto": "La electricidad necesita un camino de ida y uno de vuelta: sale por cinco volts, "
                 "pasa por el aparato y regresa por tierra. Por convención, el rojo marca los cinco "
                 "volts, el negro o el café marcan la tierra, y un tercer color, naranjo o amarillo, "
                 "lleva la señal. Gracias a esa convención podemos conectar piezas de distintos "
                 "fabricantes sin adivinar.",
        "marcas": {"ida": "camino de ida", "vuelta": "regresa por tierra", "rojo": "el rojo",
                   "negro": "el negro", "senal": "tercer color"},
    },
    {
        "id": "protoboard",
        "titulo": "La protoboard reparte la energía",
        "texto": "El Leonardo tiene un solo pin de cinco volts, pero hay tres piezas que lo "
                 "necesitan. Para repartirlo usamos la protoboard. Por dentro, cada fila tiene una "
                 "lámina de metal que une sus cinco agujeros: lo que entra por uno sale por los "
                 "otros cuatro. Así, la fila uno se vuelve nuestra línea de cinco volts, y la fila "
                 "tres, nuestra tierra.",
        "marcas": {"tres": "tres piezas", "laminas": "lámina de metal", "fila1": "la fila uno",
                   "fila3": "la fila tres"},
    },
    {
        "id": "servo",
        "titulo": "El servo: el ancho del pulso es el ángulo",
        "texto": "El servo trae tres cables: café a tierra, rojo a cinco volts, y naranjo, la "
                 "señal, directo al pin cinco. El Arduino le manda un pulso cada veinte "
                 "milisegundos, y lo que importa es cuánto dura. Un pulso corto lo lleva a un "
                 "extremo, uno largo al otro, y uno de un milisegundo y medio lo deja al centro. "
                 "El servo gira hasta ese ángulo y se queda ahí.",
        "marcas": {"cafe": "café a tierra", "rojo": "rojo a cinco", "naranjo": "naranjo, la",
                   "pulso": "un pulso cada", "corto": "pulso corto", "largo": "uno largo",
                   "centro": "milisegundo y medio", "queda": "se queda ahí"},
    },
    {
        "id": "servo2",
        "titulo": "El segundo servo",
        "texto": "El segundo servo se conecta igual, pero su señal va al pin seis. Así cada brazo "
                 "recibe su propia orden.",
        "marcas": {"pin6": "pin seis", "orden": "propia orden"},
    },
    {
        "id": "perilla",
        "titulo": "La perilla: un divisor de voltaje",
        "texto": "La perilla es un potenciómetro: una resistencia con un cursor que se desliza al "
                 "girarla. Sus patas de los extremos van a cinco volts y a tierra, y la del centro "
                 "entrega un voltaje entre cero y cinco, según cuánto la giremos. Ese voltaje entra "
                 "por A cero, y el Arduino lo convierte en un número entre cero y mil veintitrés.",
        "marcas": {"extremos": "patas de los extremos", "centro": "la del centro",
                   "giremos": "cuánto la giremos", "a0": "entra por A cero", "numero": "un número"},
    },
    {
        "id": "programa",
        "titulo": "El programa: leer, convertir, mover",
        "texto": "El programa repite tres pasos muchas veces por segundo: lee A cero, convierte "
                 "ese número en un ángulo con la función map, y le escribe ese ángulo a cada servo. "
                 "El de verano va de veinte a ciento sesenta grados, y el de invierno, al revés.",
        "marcas": {"lee": "lee A cero", "convierte": "convierte", "escribe": "le escribe",
                   "rango": "de veinte a ciento"},
    },
    {
        "id": "cierre",
        "titulo": "El camino completo",
        "texto": "Ese es el camino completo: la mano gira la perilla, el voltaje viaja hasta A "
                 "cero, el programa decide, y los pulsos de los pines cinco y seis mueven los "
                 "brazos. Un último consejo: conecta siempre con el USB desenchufado, y revisa dos "
                 "veces el rojo y el café.",
        "marcas": {"mano": "la mano", "viaja": "el voltaje viaja", "decide": "el programa decide",
                   "pulsos": "los pulsos", "consejo": "último consejo"},
    },
]
