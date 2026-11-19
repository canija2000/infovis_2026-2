// Vibraciones de las bandadas (vista inmersiva del Mirador) — Arduino Leonardo como dispositivo MIDI USB.
//
// Mismos pines y cableado que la prueba (arduino/vibraciones_prueba): 4 motores en las filas 4, 6, 8 y 10 de la
// protoboard, pines 10, 8, 6 y 4. Cada motor queda bajo una zona de la maqueta, en el orden en que el Mirador
// las dibuja (1 arriba a la izquierda, 2 arriba a la derecha, 3 abajo a la izquierda, 4 abajo a la derecha).
//
// Versión 2 (la primera apenas se sentía: pulsos cortos y suaves). Ahora cada motor vibra todo el tiempo según
// lo que pasa en su zona, y los eventos se marcan encima con pulsos fuertes:
//
//   Control change 20–23 (motor 1–4), valor 0–127 → nivel continuo de esa zona. El Mirador lo manda ~8 veces
//       por segundo: sube con las aves que hay posadas y, sobre todo, con las que vuelan por la zona. 0 = quieto.
//   nota 81–95  = 80 + máscara de motores → una bandada LLEGA a esa zona (pulso fuerte con el ritmo de su clase)
//   nota 97–111 = 96 + máscara de motores → una bandada SE VA (el pulso se apaga de a poco)
//   nota 79     → empieza un mes: tres golpes fuertes en los 4 motores
//   canal MIDI de las notas → clase y ritmo: 2 residente (un pulso), 3 verano (tres pulsos rápidos),
//       4 invierno (pulso largo que crece y baja). El canal 1 hace lo de la prueba (ráfaga de 0,5 s).
//
// Los motores de vibración no giran bajo ~40 % de potencia: todo nivel mayor que 0 parte en MIN_DUTY, y cada vez
// que un motor arranca desde quieto recibe un golpe a plena potencia (KICK_MS) para vencer la inercia.
// Si el Mirador deja de mandar niveles (se cerró la página), los motores se apagan solos a los 1,5 s.
#include <MIDIUSB.h>

constexpr uint8_t motorPins[] = {10, 8, 6, 4};
constexpr uint8_t N = sizeof(motorPins);
constexpr unsigned long PWM_US = 2000;     // PWM por software (los pines 4 y 8 no tienen PWM por hardware)
constexpr unsigned long KICK_MS = 70;      // arranque a plena potencia
constexpr int MIN_DUTY = 450;              // ‰ mínimo para que el motor gire
constexpr int EVENT_MIN_DUTY = 800;        // ‰ mínimo de los pulsos de eventos: tienen que sentirse
constexpr unsigned long LEVEL_TIMEOUT_MS = 1500;

enum Kind : uint8_t { NONE, LEGACY, RESIDENTE, VERANO, INVIERNO, MES };
constexpr unsigned int DURATION_MS[] = {0, 500, 350, 700, 1100, 700};

struct Motor {
  uint8_t level = 0;          // nivel continuo 0–127 (control change)
  Kind kind = NONE;           // pulso de evento en curso
  bool leaving = false;
  unsigned long startMs = 0;
  int eventDuty = 1000;       // ‰ máximo del pulso, según la velocidad de la nota
  bool spinning = false;
  unsigned long spinSince = 0;
};
Motor motors[N];
unsigned long lastLevelMs = 0;
uint8_t energized = 0;

// Forma del pulso de evento (0 a 1000) a los `ms` de empezar; -1 = terminó.
int shape(const Motor& m, unsigned long ms) {
  const unsigned int dur = DURATION_MS[m.kind];
  if (ms >= dur) return -1;
  int v;
  switch (m.kind) {
    case LEGACY: case RESIDENTE: v = 1000; break;
    case VERANO: v = (ms % 235) < 150 ? 1000 : 0; break;                                   // tres pulsos rápidos
    case INVIERNO: v = ms < 550 ? 600 + ms * 400 / 550 : 1000 - (ms - 550) * 400 / 550; break;  // crece y baja
    case MES: v = (ms % 240) < 170 ? 1000 : 0; break;                                      // tres golpes
    default: return -1;
  }
  if (m.leaving) v = v * (long)(dur - ms) / dur;
  return v;
}

void startEvent(uint8_t mask, Kind kind, bool leaving, uint8_t velocity, unsigned long nowMs) {
  const int duty = map(constrain(velocity, 32, 127), 32, 127, EVENT_MIN_DUTY, 1000);
  for (uint8_t i = 0; i < N; ++i) if (mask & (1U << i)) {
    motors[i].kind = kind; motors[i].leaving = leaving; motors[i].startMs = nowMs; motors[i].eventDuty = duty;
  }
}

void readMidi(unsigned long nowMs) {
  for (midiEventPacket_t p = MidiUSB.read(); p.header != 0; p = MidiUSB.read()) {
    const uint8_t type = p.byte1 & 0xF0, channel = (p.byte1 & 0x0F) + 1, a = p.byte2, b = p.byte3;
    if (type == 0xB0 && a >= 20 && a < 20 + N) { motors[a - 20].level = b; lastLevelMs = nowMs; continue; }
    if (type != 0x90 || b == 0) continue;
    if (a == 79) { startEvent(0b1111, MES, false, 127, nowMs); continue; }
    if (channel == 1) {  // prueba anterior
      uint8_t mask = 0;
      if (a > 80 && a <= 95) mask = a - 80;
      else if (a == 60) mask = 0b0001;  // Loica
      else if (a == 62) mask = 0b0011;  // Chucao
      else if (a == 64) mask = 0b1111;  // Siete colores
      if (mask) startEvent(mask, LEGACY, false, b, nowMs);
      continue;
    }
    const Kind kind = channel == 2 ? RESIDENTE : channel == 3 ? VERANO : channel == 4 ? INVIERNO : NONE;
    if (kind == NONE) continue;
    if (a > 80 && a <= 95) startEvent(a - 80, kind, false, b, nowMs);
    else if (a > 96 && a <= 111) startEvent(a - 96, kind, true, b, nowMs);
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
  if (nowMs - lastLevelMs > LEVEL_TIMEOUT_MS) for (Motor& m : motors) m.level = 0;  // la página se cerró
  uint8_t want = 0;
  for (uint8_t i = 0; i < N; ++i) {
    Motor& m = motors[i];
    int duty = m.level ? MIN_DUTY + (1000 - MIN_DUTY) * (long)m.level / 127 : 0;  // nivel continuo de la zona
    if (m.kind != NONE) {                                                       // pulso de evento, encima
      const int v = shape(m, nowMs - m.startMs);
      if (v < 0) m.kind = NONE;
      else if (v > 0) duty = max(duty, (int)(m.eventDuty * (long)v / 1000));
    }
    if (duty > 0 && !m.spinning) { m.spinning = true; m.spinSince = nowMs; }
    if (duty == 0) m.spinning = false;
    const bool kick = m.spinning && nowMs - m.spinSince < KICK_MS;
    if (duty > 0 && (kick || duty >= 1000 || phase < PWM_US * (unsigned long)duty / 1000)) want |= 1U << i;
  }
  if (want != energized) {
    for (uint8_t i = 0; i < N; ++i) digitalWrite(motorPins[i], (want & (1U << i)) ? HIGH : LOW);
    energized = want;
  }
  digitalWrite(LED_BUILTIN, want ? HIGH : LOW);
}
