// Los que llegan y los que se quedan — la perilla mueve los dos brazos.
//
// Recorrido lineal: la perilla de tope a tope lleva cada servo de un extremo al otro.
// Verano gira hacia un lado e invierno hacia el otro. Al devolver la perilla, vuelven.
//
// Conexiones: servo verano → pin 5, servo invierno → pin 6, centro de la perilla → A0.
// Monitor serie a 9600 baudios para ver la lectura de la perilla y los ángulos.

#include <Servo.h>

Servo verano;
Servo invierno;

// Lectura de la perilla en sus dos topes (mírala en el monitor y ajústala si cambia).
const int PERILLA_MIN = 40;
const int PERILLA_MAX = 985;

// Ángulo de cada brazo con la perilla al inicio y al final de su giro. Si un brazo gira para
// el lado equivocado, intercambia sus dos números. No usar 0 ni 180: muchos micro servos tienen
// el tope físico antes y se quedan empujando contra él (se calientan y se queman).
const int VERANO_INICIO = 20;
const int VERANO_FIN = 160;
const int INVIERNO_INICIO = 160;
const int INVIERNO_FIN = 20;

// Si la perilla no se mueve en este tiempo, se sueltan los servos: dejan de hacer fuerza.
const unsigned long SOLTAR_TRAS_MS = 1500;

int ultimaLectura = -100;
unsigned long ultimoMovimiento = 0;

void setup() {
  Serial.begin(9600);
}

void loop() {
  // 1. Leer la perilla: promedio de 8 lecturas para que no tiemble.
  long suma = 0;
  for (int i = 0; i < 8; i++) suma += analogRead(A0);
  int lectura = suma / 8;

  // Si casi no se movió, no mover nada (evita que los servos vibren); si lleva rato quieta,
  // soltarlos para que no se calienten.
  if (abs(lectura - ultimaLectura) < 4) {
    if (verano.attached() && millis() - ultimoMovimiento > SOLTAR_TRAS_MS) {
      verano.detach();
      invierno.detach();
      Serial.println("(servos sueltos: la perilla está quieta)");
    }
    return;
  }
  ultimaLectura = lectura;
  ultimoMovimiento = millis();
  if (!verano.attached()) {
    verano.attach(5);
    invierno.attach(6);
  }

  // 2. Pasarla a grados de giro de la perilla: 0 a 300.
  int giro = map(constrain(lectura, PERILLA_MIN, PERILLA_MAX), PERILLA_MIN, PERILLA_MAX, 0, 300);

  // 3. Giro de la perilla → ángulo de cada servo, en línea recta (invierno en sentido contrario).
  int anguloVerano = map(giro, 0, 300, VERANO_INICIO, VERANO_FIN);
  int anguloInvierno = map(giro, 0, 300, INVIERNO_INICIO, INVIERNO_FIN);
  verano.write(anguloVerano);
  invierno.write(anguloInvierno);

  // 4. Mostrar lo que pasa.
  Serial.print("A0 = ");
  Serial.print(lectura);
  Serial.print("   giro = ");
  Serial.print(giro);
  Serial.print("°   verano = ");
  Serial.print(anguloVerano);
  Serial.print("°   invierno = ");
  Serial.print(anguloInvierno);
  Serial.println("°");

  delay(20);
}
