// Aves en escena: comportamiento (heredado del chucao: quieto, saltar, picotear, cantar, mirar),
// más vuelo de llegada/partida por los bordes, posarse en árboles y el vuelo suspendido del picaflor.
// El director elige qué especies hay cada mes (año típico o un año concreto) y quién canta (máx. 2 a la vez,
// con probabilidad proporcional a su frecuencia).
/* global THREE */
import { birdScale, BIRD_PICK_RADIUS } from './scale.js';
import { buildBird, planFor, PLANS } from './bird.js';
import { presenceIn, CLASS_COLORS } from './data.js';
import { loadClip, playAt, playSynth, audioReady } from './audio.js';

const rnd = (a, b) => a + Math.random() * (b - a);
const HOP = 0.3;

export class BirdAgent {
  constructor(sp, scene, regionId) {
    this.sp = sp;
    this.scene = scene;
    this.plan = planFor(sp);
    this.traits = PLANS[this.plan] || {};
    this.m = buildBird(sp, this.plan);
    this.s = birdScale(sp, this.plan); // tabla de escala: largo real × exageración (js/scale.js)
    this.m.group.scale.setScalar(this.s);
    this.cls = sp.regionalClass[String(regionId)] || sp.class;
    this.color = CLASS_COLORS[this.cls] || '#ffffff';
    const st = sp.morphology?.stratum;
    this.groundy = this.plan === 'picaflor' ? 0.1 : st ? (st[0] + st[1] * 0.5) / 100 : 0.6;
    this.pos = new THREE.Vector3(); this.heading = rnd(0, 6.28);
    this.state = 'idle'; this.t = 0; this.dur = 1;
    this.from = new THREE.Vector3(); this.to = new THREE.Vector3(); this.target = new THREE.Vector3();
    this.hops = 0; this.flick = 0; this.yaw = 0; this.pitch = 0; this.nextLook = 0.5;
    this.perch = null; this.leaving = false; this.gone = false; this.noteAmp = 0; this.k = 0;
    // esfera invisible para el hover/clic
    this.proxy = new THREE.Mesh(new THREE.SphereGeometry(1.6, 6, 4), new THREE.MeshBasicMaterial({ visible: false }));
    this.proxy.userData.agent = this;
    this.m.group.add(this.proxy); this.proxy.position.y = 1.3;
    this.proxy.scale.setScalar(Math.max(1, BIRD_PICK_RADIUS / (1.6 * this.s))); // aves chicas: igual se pueden clicar
  }

  groundY(x, z) { return this.scene.heightAt(x, z); }

  spot() {
    const sc = this.scene;
    for (let i = 0; i < 30; i++) {
      const a = rnd(0, 6.28), r = rnd(2, sc.half * 0.55);
      const x = Math.cos(a) * r, z = Math.sin(a) * r;
      const c = sc.coverAt(x, z);
      if (c === 7 || (c === 4 && Math.random() < 0.7)) continue; // agua / calle
      return new THREE.Vector3(x, this.groundY(x, z), z);
    }
    return new THREE.Vector3(0, this.groundY(0, 0), 0);
  }

  arrive() {
    const dest = this.choosePlace();
    const a = rnd(0, 6.28);
    if (this.traits.noFly) { // ñandú y pingüino llegan caminando desde el borde
      const x = Math.cos(a) * this.scene.half * 0.9, z = Math.sin(a) * this.scene.half * 0.9;
      this.pos.set(x, this.groundY(x, z), z);
      this.fly(dest, this.pos.distanceTo(dest) / 1.8);
      return;
    }
    this.pos.set(Math.cos(a) * this.scene.half, dest.y + 12, Math.sin(a) * this.scene.half);
    this.fly(dest, rnd(3, 4.5));
  }

  leave() {
    if (this.leaving) return;
    this.leaving = true; this.perch = null;
    const a = Math.atan2(this.pos.z, this.pos.x) + rnd(-0.6, 0.6);
    if (this.traits.noFly) {
      const x = Math.cos(a) * this.scene.half * 1.1, z = Math.sin(a) * this.scene.half * 1.1;
      this.fly(new THREE.Vector3(x, this.groundY(x, z), z), 8);
      return;
    }
    this.fly(new THREE.Vector3(Math.cos(a) * this.scene.half * 1.3, this.pos.y + 14, Math.sin(a) * this.scene.half * 1.3), rnd(3, 4));
  }

  choosePlace() {
    const sc = this.scene;
    this.swimming = false;
    if (this.traits.swim && sc.waterSpots.length && Math.random() < 0.5) { // nadar
      const w = sc.waterSpots[Math.random() * sc.waterSpots.length | 0].clone();
      w.x += rnd(-0.5, 0.5); w.z += rnd(-0.5, 0.5);
      this.perch = w; this.swimming = true;
      return w.clone();
    }
    if (this.traits.trunk && sc.trunks?.length && Math.random() < 0.75) { // carpintero: en el tronco
      const t = sc.trunks[Math.random() * sc.trunks.length | 0];
      this.onTrunk = t; this.perch = t.pos.clone();
      return t.pos.clone();
    }
    this.onTrunk = null;
    const pool = this.plan === 'picaflor' ? sc.flowers : sc.perches;
    if (pool.length && Math.random() > this.groundy) {
      const near = pool.filter(p => Math.hypot(p.x, p.z) < sc.half * 0.6);
      const p = (near.length ? near : pool)[Math.random() * (near.length || pool.length) | 0];
      this.perch = p.clone();
      if (this.plan === 'picaflor') this.perch.y += rnd(0.6, 1.2);
      return this.perch.clone();
    }
    this.perch = null;
    return this.spot();
  }

  fly(dest, dur) {
    this.from.copy(this.pos); this.to.copy(dest);
    const d = this.to.clone().sub(this.from);
    this.heading = Math.atan2(-d.z, d.x);
    this.setState('fly', dur);
  }

  setState(s, dur = 0) { this.state = s; this.t = 0; this.dur = dur; }

  // Planear en círculos sobre la escena (jotes, gaviotas, pelícanos) y luego bajar.
  startSoar() {
    this.perch = null; this.swimming = false;
    this.soar = { cx: rnd(-8, 8), cz: rnd(-8, 8), r: rnd(6, 11), y: this.groundY(0, 0) + rnd(9, 14), a: rnd(0, 6.28), dir: Math.random() < 0.5 ? 1 : -1 };
    const s = this.soar;
    this.fly(new THREE.Vector3(s.cx + Math.cos(s.a) * s.r, s.y, s.cz + Math.sin(s.a) * s.r), rnd(2, 3));
    this.afterFly = 'soar';
  }

  startHop() {
    this.from.copy(this.pos);
    const d = this.target.clone().sub(this.pos); d.y = 0;
    const len = d.length();
    if (len < 0.05) { this.setState('idle', rnd(1, 2.5)); return; }
    d.multiplyScalar(Math.min(0.5 * this.s * 2.2, len) / len);
    this.to.copy(this.pos).add(d);
    this.to.y = this.groundY(this.to.x, this.to.z);
    this.heading = Math.atan2(-d.z, d.x);
    this.yaw = 0; this.pitch = 0;
    this.setState('hop', HOP);
  }

  chooseNext() {
    const r = Math.random();
    if (this.traits.soar && r < 0.12) { this.startSoar(); return; }
    if (this.swimming) { // deriva lenta sobre el agua
      if (r < 0.15) this.fly(this.choosePlace(), rnd(1.5, 2.5));
      else { this.perch.x += rnd(-0.4, 0.4); this.perch.z += rnd(-0.4, 0.4); this.heading += rnd(-0.8, 0.8); this.setState('idle', rnd(1.5, 3.5)); }
      return;
    }
    if (this.perch && this.plan !== 'picaflor') {
      if (r < 0.2) this.fly(this.choosePlace(), rnd(1.2, 2.2));
      else this.setState('idle', rnd(1, 3));
      return;
    }
    if (this.plan === 'picaflor') {
      this.fly(this.choosePlace(), rnd(0.5, 0.9));
      return;
    }
    if (r < 0.1) { this.fly(this.choosePlace(), rnd(1.2, 2.2)); return; }
    if (r < 0.55) {
      const a = rnd(0, 6.28), rr = rnd(0.5, 3);
      this.target.set(this.pos.x + Math.cos(a) * rr, 0, this.pos.z + Math.sin(a) * rr);
      if (Math.hypot(this.target.x, this.target.z) > this.scene.half * 0.8) this.target.set(this.pos.x * 0.8, 0, this.pos.z * 0.8);
      this.hops = Math.min(7, Math.ceil(this.target.distanceTo(new THREE.Vector3(this.pos.x, 0, this.pos.z)) / 0.5));
      this.startHop();
    } else if (r < 0.8) this.setState('peck', 0.9);
    else this.setState('idle', rnd(0.8, 2.2));
  }

  sing(dur) {
    if (this.state === 'fly' || this.leaving) return false;
    this.yaw = 0;
    this.setState('sing', dur);
    this.singing = true;
    return true;
  }

  sim(dt) {
    this.t += dt;
    this.flick = Math.max(0, this.flick - dt * 4);
    this.nextLook -= dt;
    if (this.nextLook <= 0 && (this.state === 'idle' || this.state === 'peck' || this.state === 'hover')) {
      this.yaw = rnd(-0.75, 0.75); this.pitch = rnd(-0.12, 0.2); this.nextLook = rnd(0.35, 1.5);
      if (Math.random() < 0.45) this.flick = 1;
    }
    this.k = 0; this.noteAmp = 0;
    let y = this.perch ? this.perch.y : this.groundY(this.pos.x, this.pos.z);
    if (this.state === 'idle') { if (this.t > this.dur) this.chooseNext(); }
    else if (this.state === 'hop') {
      const k = this.t / HOP;
      if (k >= 1) { this.pos.copy(this.to); this.hops--; if (this.hops > 0) this.startHop(); else { this.setState('idle', rnd(1, 3)); this.flick = 1; } }
      else { this.pos.lerpVectors(this.from, this.to, k); y = this.groundY(this.pos.x, this.pos.z) + 0.28 * this.s * 2 * Math.sin(Math.PI * k); this.k = k; }
    } else if (this.state === 'peck') {
      this.k = this.t / this.dur;
      if (this.k >= 1) this.setState('idle', rnd(0.6, 2));
    } else if (this.state === 'sing') {
      this.noteAmp = Math.sin(this.t * 22) > 0 ? 1 : 0;
      if (this.t > this.dur) { this.singing = false; this.setState('idle', rnd(1.5, 3)); }
    } else if (this.state === 'fly') {
      const k = Math.min(1, this.t / this.dur);
      const e = k < 0.5 ? 2 * k * k : 1 - (-2 * k + 2) ** 2 / 2;
      this.pos.lerpVectors(this.from, this.to, e);
      y = this.traits.noFly ? this.groundY(this.pos.x, this.pos.z) : this.pos.y + Math.sin(Math.PI * k) * Math.min(3, this.from.distanceTo(this.to) * 0.25);
      this.k = k;
      if (this.traits.noFly) { const e2 = k; this.pos.lerpVectors(this.from, this.to, e2); }
      if (k >= 1) {
        this.pos.copy(this.to);
        if (this.leaving) { this.gone = true; return; }
        if (this.onTrunk) this.heading = this.onTrunk.face;
        if (this.afterFly === 'soar') { this.afterFly = null; this.setState('soar', rnd(8, 16)); }
        else if (this.plan === 'picaflor') this.setState('hover', rnd(1.2, 3));
        else this.setState('idle', rnd(0.8, 2));
      }
    } else if (this.state === 'hover') {
      if (this.t > this.dur) this.chooseNext();
    } else if (this.state === 'soar') {
      const s = this.soar;
      s.a += s.dir * dt * 0.35;
      this.pos.set(s.cx + Math.cos(s.a) * s.r, s.y + Math.sin(this.t * 0.7) * 0.4, s.cz + Math.sin(s.a) * s.r);
      this.heading = Math.atan2(-Math.cos(s.a) * s.dir, -Math.sin(s.a) * s.dir);
      y = this.pos.y;
      if (this.t > this.dur) this.fly(this.choosePlace(), rnd(3, 4.5));
    }
    if (this.swimming && this.state === 'idle') y = this.perch.y + Math.sin(performance.now() / 700 + this.pos.x) * 0.04;
    if (this.state !== 'fly' && this.state !== 'hop' && this.state !== 'soar') this.pos.y = y;
    this.pose(this.state === 'fly' || this.state === 'hop' ? y : this.pos.y);
  }

  pose(y) {
    const m = this.m;
    m.group.position.set(this.pos.x, y, this.pos.z);
    m.group.rotation.y = this.heading;
    const soaring = this.state === 'soar';
    const walking = this.state === 'fly' && this.traits.noFly;
    const flying = !walking && (this.state === 'fly' || this.state === 'hover' || soaring || this.plan === 'picaflor' && this.state !== 'idle');
    const hopK = this.state === 'hop' ? Math.sin(Math.PI * this.k) : 0;
    const stride = walking ? Math.sin(performance.now() / 110) : 0;
    m.legs.forEach((l, i) => { l.rotation.z = flying ? 0.9 : walking ? stride * (i ? 0.5 : -0.5) : -0.7 * hopK; });
    m.group.rotation.z = this.traits.waddle && (walking || this.state === 'hop') ? Math.sin(performance.now() / 90) * 0.18 : 0;
    const flap = soaring ? 0.05 * Math.sin(performance.now() / 400) : flying ? Math.sin(performance.now() / (this.plan === 'picaflor' ? 12 : 60)) : 0;
    for (const w of m.wings) { w.rotation.x = w.userData.side * (soaring ? 1.35 + flap : flying ? 0.3 + flap * 1.1 : this.traits.flippers ? Math.PI - 0.3 + Math.sin(performance.now() / 300) * 0.08 : 0); } // pingüino: aletas colgando
    for (const l of m.legs) l.visible = !(this.swimming && !flying);
    m.group.rotation.x = soaring ? 0.25 * (this.soar?.dir || 1) : 0;
    let bodyTilt = 0, headTilt = this.pitch, open = 0, puff = 1;
    if (this.state === 'peck') {
      const tri = this.k < 0.5 ? this.k * 2 : (1 - this.k) * 2;
      const jab = Math.abs(Math.sin(this.k * Math.PI * 3));
      bodyTilt = -0.4 * tri; headTilt = -0.9 * jab * tri - 0.2;
    } else if (this.state === 'sing') {
      bodyTilt = 0.12; headTilt = 0.5; open = 0.4 * this.noteAmp; puff = 1 + 0.08 * this.noteAmp;
    } else if ((this.state === 'fly' && !walking) || soaring) bodyTilt = -0.35;
    if (this.swimming && !flying) bodyTilt = this.plan === 'pinguino' ? -1.2 : -0.12; // el pingüino nada acostado
    if (this.onTrunk && this.state !== 'fly') bodyTilt = 0.55; // carpintero vertical contra el tronco
    m.bodyPivot.rotation.z = bodyTilt + 0.1 * hopK;
    m.head.rotation.y = this.yaw;
    m.head.rotation.z = headTilt;
    m.lower.rotation.z = m.beakRest[1] - open;
    m.upper.rotation.z = m.beakRest[0] + open * 0.3;
    m.torso.scale.setScalar(puff);
    m.tail.rotation.z = m.tailRest - 0.4 * this.flick + 0.35 * hopK + (flying ? 0.5 : 0);
  }
}

// ---------------------------------------------------------------------------------------
export class Director {
  constructor({ index, region, regionId, regionCode, root, onSing, year = null }) {
    this.index = index; this.region = region; this.regionId = regionId; this.regionCode = regionCode; this.root = root;
    this.year = year; // null = año típico
    this.agents = []; this.sceneKey = null; this.scene = null; this.onSing = onSing;
    this.nextSong = 2; this.acc = 0;
  }

  // Especies destacadas de la región que viven en esta escena y están presentes este mes.
  castFor(sceneKey, month) {
    const out = [];
    for (const [sid, feat] of Object.entries(this.region.featured || {})) {
      const sp = this.index.byId.get(+sid);
      if (!sp || feat.scene !== sceneKey || !sp.regionalClass[String(this.regionId)]) continue;
      const pr = presenceIn(this.region, sp, month, this.year);
      if (pr) out.push({ sp, ...pr });
    }
    return out;
  }

  setScene(sceneKey, scene, month, instant = true) {
    for (const a of this.agents) this.root.remove(a.m.group);
    this.agents = []; this.sceneKey = sceneKey; this.scene = scene;
    this.setMonth(month, instant);
  }

  setMonth(month, instant = false) {
    this.month = month;
    const cast = this.castFor(this.sceneKey, month);
    const want = new Map(cast.map(c => [c.sp.id, c]));
    // se van los que ya no están
    for (const a of this.agents) if (!want.has(a.sp.id) && !a.leaving) a.leave();
    // llegan los que faltan
    for (const c of cast) {
      const mine = this.agents.filter(a => a.sp.id === c.sp.id && !a.leaving);
      for (const a of mine) a.freq = c.freq;
      for (const a of mine.slice(c.n)) a.leave(); // ese año hubo menos
      for (let i = mine.length; i < c.n; i++) {
        const a = new BirdAgent(c.sp, this.scene, this.regionId);
        a.freq = c.freq;
        if (instant) { const p = a.choosePlace(); a.pos.copy(p); a.setState('idle', rnd(0, 2)); a.pose(p.y); }
        else {
          a.pos.set(0, -999, 0); a.setState('wait', 99); a.pose(-999);
          const sceneAtArrival = this.scene;
          setTimeout(() => { if (this.scene === sceneAtArrival && !a.gone) a.arrive(); }, rnd(0, 6000));
        }
        this.root.add(a.m.group);
        this.agents.push(a);
      }
    }
    // preparar audio de este elenco
    for (const c of cast) if (c.sp.clip) { loadClip(c.sp.clip.grain); loadClip(c.sp.clip.src); }
    return cast;
  }

  singingCount() { return this.agents.filter(a => a.singing).length; }

  async singNow(a, full = false) {
    if (!a) return;
    let dur = 0;
    if (a.sp.clip) {
      const buf = await loadClip(full ? a.sp.clip.src : (Math.random() < 0.75 ? a.sp.clip.grain : a.sp.clip.src));
      if (buf) dur = Math.min(full ? 12 : 6, buf.duration);
      if (dur && a.sing(dur)) playAt(buf, a.m.group.position, 1.0);
    } else {
      dur = playSynth(a.m.group.position, a.sp.id);
      if (dur) a.sing(dur); else a.sing(1.5);
    }
    if (dur && this.onSing) this.onSing(a, dur);
    return dur;
  }

  update(dt, paused) {
    // simulación a 15 Hz (estética PS1)
    this.acc += dt;
    const STEP = 1 / 15;
    let n = 0;
    while (this.acc >= STEP && n++ < 4) {
      for (const a of this.agents) if (a.state !== 'wait') a.sim(STEP);
      this.acc -= STEP;
    }
    for (const a of this.agents) if (a.gone) this.root.remove(a.m.group);
    this.agents = this.agents.filter(a => !a.gone);
    // director de coro
    if (paused || !audioReady()) return;
    this.nextSong -= dt;
    if (this.nextSong <= 0) {
      this.nextSong = rnd(1.5, 4);
      if (this.singingCount() >= 2) return;
      const pool = this.agents.filter(a => !a.singing && (a.state === 'idle' || a.state === 'peck' || a.state === 'hover'));
      if (!pool.length) return;
      const tot = pool.reduce((s, a) => s + a.freq, 0);
      let r = Math.random() * tot;
      const pick = pool.find(a => (r -= a.freq) <= 0) || pool[0];
      this.singNow(pick);
    }
  }
}
