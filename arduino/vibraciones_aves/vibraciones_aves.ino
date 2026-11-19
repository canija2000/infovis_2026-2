// Vibraciones de las bandadas (vista inmersiva del Mirador) — Arduino Leonardo como dispositivo MIDI USB.
//
// Mismos pines y cableado que la prueba (vibraciones.ino): 4 motores en las filas 4, 6, 8 y 10 de la
// protoboard, pines 10, 8, 6 y 4. Cada motor queda bajo una zona de la maqueta, en el orden en que el Mirador
// las dibuja (motor 1 = primera zona, arriba a la izquierda; motor 2 = arriba a la derecha; motor 3 = abajo a
// la izquierda; motor 4 = abajo a la derecha). Así la vibración sale de donde se posa o despega la bandada.
//
// El Mirador manda una nota MIDI (Web MIDI, en Chrome de computador o de Android con cable OTG; Safari en
// iPhone no tiene Web MIDI) cuando una bandada aterriza o despega:
//
//   nota 81–95  = 80 + máscara de motores → una bandada LLEGA a esa zona
//   nota 97–111 = 96 + máscara de motores → una bandada SE VA de esa zona (el pulso se apaga de a poco)
//   nota 79     → pasa un mes: un toque corto en los 4 motores (el pulso del año)
//   velocidad   → intensidad (32 = suave … 112 = máxima), según cuántos días del mes se registró la especie
//   canal MIDI  → clase, y con ella el ritmo:
//       canal 2 = residente: un pulso corto
//       canal 3 = verano: tres pulsos rápidos
//       canal 4 = invierno: un pulso largo que crece y baja
//   canal 1     → la prueba anterior, sin cambios (ráfaga de 0,5 s; notas 60, 62 y 64 de Loica, Chucao y Siete
//                 colores), para seguir usando la página de prueba.
//
// Cada motor lleva su propio patrón, así dos zonas pueden vibrar a la vez con ritmos distintos.
#include <MIDIUSB.h>

constexpr uint8_t motorPins[] = {10, 8, 6, 4};
constexpr uint8_t N = sizeof(motorPins);
constexpr unsigned long PWM_US = 2000;   // período del PWM por software (los pines 4 y 8 no tienen PWM por hardware)
constexpr unsigned long KICK_MS = 60;    // arranque a plena potencia para vencer la inercia del motor

enum Kind : uint8_t { NONE, LEGACY, RESIDENTE, VERANO, INVIERNO, TICK };
constexpr unsigned int DURATION_MS[] = {0, 500, 180, 480, 700, 45};

struct Motor {
  Kind kind = NONE;
  bool leaving = false;
  unsigned long startMs = 0;
  unsigned long onUs = 0;  // ancho del pulso PWM a intensidad máxima del patrón
};
Motor motors[N];
uint8_t energized = 0;

// Intensidad del patrón (0 a 1000) a los `ms` de empezar; -1 = terminó.
int level(const Motor& m, unsigned long ms) {
  const unsigned int dur = DURATION_MS[m.kind];
  if (ms >= dur) return -1;
  int v = 0;
  switch (m.kind) {
    case LEGACY:
    case RESIDENTE:
    case TICK: v = 1000; break;
    case VERANO: v = (ms % 160) < 90 ? 1000 : 0; break;                              // tres pulsos rápidos
    case INVIERNO: v = ms < 350 ? 400 + ms * 600 / 350 : 1000 - (ms - 350) * 600 / 350; break;  // crece y baja
    default: return -1;
  }
  if (m.leaving) v = v * (long)(dur - ms) / dur;  // al irse, el pulso se apaga de a poco
  return v;
}

void start(uint8_t mask, Kind kind, bool leaving, uint8_t velocity, unsigned long nowMs) {
  const int vel = constrain(velocity, 32, 112);
  const unsigned long onUs = map(vel, 32, 112, 800, PWM_US);
  for (uint8_t i = 0; i < N; ++i) {
    if (!(mask & (1U << i))) continue;
    motors[i].kind = kind; motors[i].leaving = leaving; motors[i].startMs = nowMs; motors[i].onUs = onUs;
  }
}

void readMidi(unsigned long nowMs) {
  for (midiEventPacket_t p = MidiUSB.read(); p.header != 0; p = MidiUSB.read()) {
    if ((p.byte1 & 0xF0) != 0x90 || p.byte3 == 0) continue;  // solo note on
    const uint8_t channel = (p.byte1 & 0x0F) + 1, note = p.byte2, vel = p.byte3;
    if (note == 79) { start(0b1111, TICK, false, 48, nowMs); continue; }
    if (channel == 1) {  // prueba anterior
      uint8_t mask = 0;
      if (note > 80 && note <= 95) mask = note - 80;
      else if (note == 60) mask = 0b0001;  // Loica
      else if (note == 62) mask = 0b0011;  // Chucao
      else if (note == 64) mask = 0b1111;  // Siete colores
      if (mask) start(mask, LEGACY, false, vel, nowMs);
      continue;
    }
    const Kind kind = channel == 2 ? RESIDENTE : channel == 3 ? VERANO : channel == 4 ? INVIERNO : NONE;
    if (kind == NONE) continue;
    if (note > 80 && note <= 95) start(note - 80, kind, false, vel, nowMs);
    else if (note > 96 && note <= 111) start(note - 96, kind, true, vel, nowMs);
  }
}

void setup() {
  for (const uint8_t pin : motorPins) { pinMode(pin, OUTPUT); digitalWrite(pin, LOW); }
  pinMode(LED_BUILTIN, OUTPUT);
  digitalWrite(LED_BUILTIN, LOW);
}

void loop() {
  const unsigned long nowMs = millis(), phase = micros() % PWM_US;
  readMidi(nowMs);
  uint8_t want = 0;
  for (uint8_t i = 0; i < N; ++i) {
    Motor& m = motors[i];
    if (m.kind == NONE) continue;
    const unsigned long t = nowMs - m.startMs;
    const int v = level(m, t);
    if (v < 0) { m.kind = NONE; continue; }
    const bool on = v > 0 && (t < KICK_MS || phase < m.onUs * (unsigned long)v / 1000);
    if (on) want |= 1U << i;
  }
  if (want != energized) {
    for (uint8_t i = 0; i < N; ++i) digitalWrite(motorPins[i], (want & (1U << i)) ? HIGH : LOW);
    energized = want;
  }
  digitalWrite(LED_BUILTIN, want ? HIGH : LOW);
}
