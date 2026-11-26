import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { GLTFLoader } from "../../web/vendor/three/GLTFLoader.js";
import { Box3 } from "../../web/vendor/three/three.module.js";

const read = (path) => fs.readFileSync(new URL(path, import.meta.url));
const bytes = read("../../web/models/visor-bandadas/ensamble.glb");
const { scene } = await new Promise((resolve, reject) => {
  new GLTFLoader().parse(
    bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
    "",
    resolve,
    reject,
  );
});
scene.updateMatrixWorld(true);
// Validate the floor and electronics after the same longitudinal half-turn
// used by the page, rather than mistaking the CAD's lower face for its floor.
const displayed = scene.clone(true);
displayed.rotation.z = Math.PI;
displayed.updateMatrixWorld(true);
const object = (name) => {
  const result = scene.getObjectByName(name.replaceAll(" ", "_"));
  assert.ok(result, `Missing ${name}`);
  return result;
};
const bounds = (name) => new Box3().setFromObject(object(name));
const displayedBounds = (name) => {
  const result = displayed.getObjectByName(name.replaceAll(" ", "_"));
  assert.ok(result, `Missing displayed ${name}`);
  return new Box3().setFromObject(result);
};
const close = (a, b) => assert.ok(Math.abs(a - b) < 0.001, `${a} ≠ ${b}`);

test("published prototype is identical to the reconstructed source", () => {
  assert.deepEqual(bytes, read("../../fisico/visor_integrado/ensamble.glb"));
  assert.deepEqual(
    read("../../web/models/visor-bandadas/ensamble.jpg"),
    read("../../fisico/visor_integrado/render_armado_frente.jpg"),
  );
});

test("inverted handle panels retain their cutting identity and enclose the motors", () => {
  for (const side of ["IZQ", "DER"]) {
    const opposite = side === "IZQ" ? "DER" : "IZQ";
    const lower = object(`ASA ${side} ABAJO`);
    const upper = object(`ASA ${side} ARRIBA`);
    assert.equal(lower.userData.pieza_plano, `ASA ${opposite} ARRIBA`);
    assert.equal(upper.userData.pieza_plano, `ASA ${opposite} ABAJO`);
    const bottom = bounds(`ASA ${side} ABAJO`);
    const top = bounds(`ASA ${side} ARRIBA`);
    close(bottom.min.y, 6);
    close(top.max.y, 84);
    for (const position of ["adelante", "atrás"]) {
      const prefix = `Motor ${side.toLowerCase()} ${position}`;
      const pcb = bounds(prefix + " PCB");
      assert.ok(pcb.min.y > bottom.max.y && pcb.max.y < top.min.y);
      assert.ok(pcb.min.z > bottom.min.z && pcb.max.z < bottom.max.z);
      assert.ok(
        bounds(prefix + " conector 1").max.y < (pcb.min.y + pcb.max.y) / 2,
      );
    }
  }
});

test("displayed backpack has a straight Leonardo and a breadboard resting on its floor", () => {
  const board = displayedBounds("Arduino Leonardo placa vertical");
  close(board.max.x - board.min.x, 70);
  close(board.max.y - board.min.y, 55);
  close(board.max.z - board.min.z, 2);
  const floor = displayedBounds("MOCHILA ARRIBA");
  const breadboard = displayedBounds("Protoboard base");
  close(breadboard.min.y, floor.max.y);
  close((breadboard.min.x + breadboard.max.x) / 2, -70);
  const contacts = displayedBounds("Protoboard matriz de contactos");
  assert.ok(contacts.min.y >= breadboard.max.y - 0.001);
  for (let i = 1; i <= 8; i++) {
    const header = displayedBounds(`Protoboard conector ${i}`);
    close(header.min.y, breadboard.max.y);
    assert.ok(header.max.y > header.min.y);
  }
  assert.ok(breadboard.max.z < board.min.z);
  assert.equal(
    object("Teléfono (referencia opcional)").userData.referenceOnly,
    true,
  );
});

test("Leonardo USB faces the cable's side opening and there is no tape over the board", () => {
  const board = displayedBounds("Arduino Leonardo placa vertical");
  const port = displayedBounds("Arduino Leonardo puerto USB");
  const side = displayedBounds("MOCHILA DER");
  const boardCenter = (board.min.x + board.max.x) / 2;
  assert.ok(port.max.x < boardCenter);
  assert.ok(side.max.x < port.min.x);
  const lead = displayedBounds("USB cable del Leonardo");
  assert.ok(lead.max.x < boardCenter);
  assert.ok(lead.min.x < side.min.x);
  assert.equal(
    scene.getObjectByName("Arduino_Leonardo_cinta_de_sujeción"),
    undefined,
  );
});
