// Binoculares del Aviario (modo Mirador): el Leonardo se hace pasar por un teclado USB.
//
// Se conecta al teléfono con un cable OTG: el teléfono le da energía y recibe las teclas como
// si fueran de un teclado cualquiera (Android e iPhone). La página no necesita nada especial.
//
// Conexiones:
//   botón FOTO  → D2 y GND   → toque corto: Espacio (fotografiar / elegir en el menú)
//                              mantener:    Esc     (volver al menú de zonas)
//   botón INFO  → D3 y GND   → toque corto: Enter   (abrir o cerrar la ficha del ave)
//                              mantener:    M       (pasar al mes siguiente)
//   rueda de enfoque (potenciómetro 10 kΩ): extremos a 5V y GND, centro a A0
//                            → teclas Z (acercar) y X (alejar), una por cada paso de giro;
//                              en el menú, las mismas teclas mueven la selección
//
// Solo funciona en placas con ATmega32u4 (Leonardo, Micro, Pro Micro). Un Uno no puede ser teclado.
// Para depurar sin teléfono: abre un editor de texto en el computador y aprieta los botones.

#include <Keyboard.h>

const int PIN_FOTO = 2;
const int PIN_INFO = 3;
const int PIN_RUEDA = A0;

// Cada cuántas cuentas de la rueda (0–1023) se manda una tecla de zoom. Más chico = más sensible.
const int PASO_RUEDA = 40;
// Si al girar a la derecha la vista se aleja en vez de acercarse, cambia esto a true.
const bool RUEDA_INVERTIDA = false;
// Tiempo mínimo entre dos lecturas distintas de un botón (evita rebotes del contacto).
const unsigned long REBOTE_MS = 30;
// Cuánto hay que mantener apretado un botón para que cuente como «mantener».
const unsigned long LARGO_MS = 700;

struct Boton {
  int pin;
  uint8_t teclaCorta, teclaLarga;
  bool apretado;
  bool largoEnviado;
  unsigned long t; // momento del último cambio
};

Boton foto = { PIN_FOTO, ' ', KEY_ESC, false, false, 0 };
Boton info = { PIN_INFO, KEY_RETURN, 'm', false, false, 0 };
int ruedaBase = 0;

int leerRueda() {
  long suma = 0;
  for (int i = 0; i < 8; i++) suma += analogRead(PIN_RUEDA);
  return suma / 8;
}

// Toque corto: manda la tecla al soltar. Mantener: manda la otra tecla apenas se cumple el tiempo
// (y al soltar ya no manda nada).
void revisar(Boton &b) {
  bool ahora = digitalRead(b.pin) == LOW; // INPUT_PULLUP: apretado = LOW
  unsigned long ms = millis();
  if (ahora != b.apretado && ms - b.t > REBOTE_MS) {
    if (!ahora && !b.largoEnviado) Keyboard.write(b.teclaCorta);
    b.apretado = ahora;
    b.largoEnviado = false;
    b.t = ms;
  } else if (b.apretado && !b.largoEnviado && ms - b.t > LARGO_MS) {
    Keyboard.write(b.teclaLarga);
    b.largoEnviado = true;
  }
}

void setup() {
  pinMode(PIN_FOTO, INPUT_PULLUP);
  pinMode(PIN_INFO, INPUT_PULLUP);
  ruedaBase = leerRueda();
  Keyboard.begin();
}

void loop() {
  revisar(foto);
  revisar(info);

  // La rueda funciona como una rueda de enfoque: lo que importa es cuánto se giró, no dónde está.
  int r = leerRueda();
  while (r - ruedaBase >= PASO_RUEDA) { Keyboard.write(RUEDA_INVERTIDA ? 'x' : 'z'); ruedaBase += PASO_RUEDA; }
  while (ruedaBase - r >= PASO_RUEDA) { Keyboard.write(RUEDA_INVERTIDA ? 'z' : 'x'); ruedaBase -= PASO_RUEDA; }

  delay(5);
}
