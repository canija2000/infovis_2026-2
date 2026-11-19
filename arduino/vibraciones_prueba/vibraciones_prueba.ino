#include <MIDIUSB.h>

// Breadboard rows 4, 6, 8 and 10, in that order.
constexpr uint8_t motorPins[] = {10, 8, 6, 4};
constexpr unsigned long pwmPeriodUs = 2000;
constexpr unsigned long startDurationUs = 60000;
constexpr unsigned long burstDurationUs = 500000;

unsigned long burstStartedAt = 0;
unsigned long pwmOnTimeUs = 0;
uint8_t activeMotorMask = 0;
uint8_t energizedMotorMask = 0;

void setMotorOutputs(uint8_t motorMask) {
  if (motorMask == energizedMotorMask) return;
  for (uint8_t index = 0; index < sizeof(motorPins); ++index) {
    digitalWrite(motorPins[index], (motorMask & (1U << index)) != 0 ? HIGH : LOW);
  }
  energizedMotorMask = motorMask;
}

void setup() {
  for (const uint8_t pin : motorPins) {
    pinMode(pin, OUTPUT);
    digitalWrite(pin, LOW);
  }
  pinMode(LED_BUILTIN, OUTPUT);
  digitalWrite(LED_BUILTIN, LOW);
}

void loop() {
  const midiEventPacket_t packet = MidiUSB.read();
  const unsigned long now = micros();

  if ((packet.byte1 & 0xF0) == 0x90 && packet.byte3 > 0) {
    const uint8_t note = packet.byte2;
    uint8_t requestedMask = 0;
    if (note > 80 && note <= 95) {
      requestedMask = note - 80;
    } else if (note == 60) {
      requestedMask = 0b0001;  // Legacy Loica
    } else if (note == 62) {
      requestedMask = 0b0011;  // Legacy Chucao
    } else if (note == 64) {
      requestedMask = 0b1111;  // Legacy Siete colores
    }
    if (requestedMask != 0) {
      activeMotorMask = requestedMask;
      const int velocity = constrain(packet.byte3, 32, 112);
      pwmOnTimeUs = map(velocity, 32, 112, 800, pwmPeriodUs);
      burstStartedAt = now;
      digitalWrite(LED_BUILTIN, HIGH);
    }
  }

  if (activeMotorMask == 0) return;

  const unsigned long elapsed = now - burstStartedAt;
  if (elapsed >= burstDurationUs) {
    setMotorOutputs(0);
    digitalWrite(LED_BUILTIN, LOW);
    activeMotorMask = 0;
    return;
  }

  // Software PWM lets the same wiring work on pins without hardware PWM.
  const bool pulseOn = elapsed < startDurationUs ||
      (elapsed - startDurationUs) % pwmPeriodUs < pwmOnTimeUs;
  setMotorOutputs(pulseOn ? activeMotorMask : 0);
}
