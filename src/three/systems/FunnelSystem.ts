import * as THREE from 'three';
import { ASSUMPTIONS, SPECIES } from '../../config/assumptions';
import { SITE } from '../../config/site';
import { F_SNAGGED, S_FUNNEL, S_GUIDED, S_INACTIVE, S_TRANSFERRED, S_TRANSFER_QUEUE } from '../../simulation/Agent';
import { FUNNELS, funnelWidth, netArc, netDistance, wallGap, type Funnel } from '../../simulation/geometry';
import type { SimulationEngine } from '../../simulation/SimulationEngine';
import { mediumMaterial } from '../environment/shaderChunks';

const DEPTH = SITE.channel.depth;
const TRAIL_MAX = 360;
const ARROW_STEP_S = 1.5;
const ARROW_STEP_W = 1.0;

/** Phase colours along the trail: on the net, in the funnel, in the pocket. */
const PHASE = [new THREE.Color(0.85, 0.95, 1.0), new THREE.Color(0.45, 0.62, 1.0), new THREE.Color(0.3, 0.95, 0.5)];

const at = (L: Funnel['line'], s: number, w: number, y: number) => new THREE.Vector3(L.ax + L.tx * s + L.nx * w, y, L.az + L.tz * s + L.nz * w);

/** A vertical panel between two plan points, from just above the water to the seabed. */
function panel(a: { x: number; z: number }, b: { x: number; z: number }, mat: THREE.Material, top = 0.7): THREE.Mesh {
  const len = Math.hypot(b.x - a.x, b.z - a.z);
  const m = new THREE.Mesh(new THREE.PlaneGeometry(len, DEPTH + top), mat);
  m.position.set((a.x + b.x) / 2, (top - DEPTH) / 2, (a.z + b.z) / 2);
  m.rotation.y = -Math.atan2(b.z - a.z, b.x - a.x);
  m.renderOrder = 6;
  return m;
}

/** A thin flat strip on the water between two plan points: the mouth and throat lines. */
function strip(a: { x: number; z: number }, b: { x: number; z: number }, mat: THREE.Material, width = 0.42): THREE.Mesh {
  const len = Math.hypot(b.x - a.x, b.z - a.z);
  const m = new THREE.Mesh(new THREE.PlaneGeometry(len, width), mat);
  m.rotation.order = 'YXZ';
  m.rotation.y = -Math.atan2(b.z - a.z, b.x - a.x);
  m.rotation.x = -Math.PI / 2;
  m.position.set((a.x + b.x) / 2, 0.55, (a.z + b.z) / 2);
  m.renderOrder = 22;
  return m;
}

/**
 * The funnel at the end of each net, drawn from the same geometry the engine moves animals through
 * (`FUNNELS`): translucent wings, the pocket, the mouth and throat lines, the bar rack across the
 * mouth, and the experimental spray bar. In the close-up it also draws the water's velocity from the
 * engine's own field (assist included) and a trail behind one real simulated jellyfish.
 */
export class FunnelSystem {
  readonly group = new THREE.Group();
  readonly rackAnchor = new THREE.Vector3();
  readonly throatAnchor = new THREE.Vector3();
  readonly barAnchor = new THREE.Vector3();
  readonly trackAnchor = new THREE.Vector3();
  /** Distance from the camera to net A's funnel (m), for the close-up only features. */
  closeness = Infinity;
  private readonly barMats: THREE.MeshStandardMaterial[] = [];
  private readonly jets: THREE.Mesh[][] = [[], []];
  private readonly arrows: THREE.InstancedMesh;
  private readonly arrowPts: Array<{ x: number; z: number }> = [];
  private arrowTimer = 0;
  private readonly trail: THREE.Line;
  private readonly trailPos = new Float32Array(TRAIL_MAX * 3);
  private readonly trailCol = new Float32Array(TRAIL_MAX * 3);
  private readonly trailPhase = new Uint8Array(TRAIL_MAX);
  private trailN = 0;
  private readonly ring: THREE.Mesh;
  private trackId = -1;
  private trackSlot = -1;
  private trackGone = 0;
  private trackPhase = 0;
  private trackMouthT = -1;
  /** What the tracked animal is doing, for its label. */
  trackInfo: { phase: string; since: number | null } | null = null;
  private readonly tmp = { x: 0, z: 0 };
  private readonly flowOnly = { x: 0, z: 0 };
  private readonly m4 = new THREE.Matrix4();
  private readonly q = new THREE.Quaternion();
  private readonly p = new THREE.Vector3();
  private readonly sc = new THREE.Vector3();
  private readonly col = new THREE.Color();
  private readonly up = new THREE.Vector3(0, 1, 0);

  constructor() {
    this.group.name = 'funnels';
    const wing = mediumMaterial({ color: 0xcfe3ea, roughness: 0.6, metalness: 0.1, transparent: true, opacity: 0.26, side: THREE.DoubleSide, depthWrite: false }, false);
    const plate = mediumMaterial({ color: 0x9fb4bc, roughness: 0.7, metalness: 0.2, transparent: true, opacity: 0.45, side: THREE.DoubleSide, depthWrite: false }, false);
    const rail = new THREE.MeshBasicMaterial({ color: 0xe6f4f8, toneMapped: false });
    const steel = mediumMaterial({ color: 0x4a5a63, roughness: 0.55, metalness: 0.55 });
    const mouthMat = new THREE.MeshBasicMaterial({ color: 0x67e8f9, transparent: true, opacity: 0.85, toneMapped: false, depthWrite: false });
    const throatMat = new THREE.MeshBasicMaterial({ color: 0x2dd4bf, transparent: true, opacity: 0.9, toneMapped: false, depthWrite: false });
    const K = SITE.collector;

    for (const F of FUNNELS) {
      const L = F.line;
      const g = new THREE.Group();
      g.name = `funnel-${F.index}`;
      // Wing: mouth (at the wall) to throat. Perforated: water passes, animals do not.
      g.add(panel(F.mouthOut, F.throatOut, wing));
      // Pocket: solid sides and the end plate with the lift's suction in it.
      g.add(panel(at(L, F.throatS, 0.05, 0), at(L, F.entryS, 0.05, 0), plate));
      g.add(panel(F.throatOut, F.entryOut, plate));
      g.add(panel(F.entryIn, F.entryOut, plate));
      // Top rails so the shape reads from above.
      for (const [a, b] of [
        [F.mouthOut, F.throatOut],
        [F.throatOut, F.entryOut],
        [F.entryIn, F.entryOut],
      ] as const) {
        const len = Math.hypot(b.x - a.x, b.z - a.z);
        const r = new THREE.Mesh(new THREE.BoxGeometry(len, 0.18, 0.18), rail);
        r.position.set((a.x + b.x) / 2, 0.8, (a.z + b.z) / 2);
        r.rotation.y = -Math.atan2(b.z - a.z, b.x - a.x);
        g.add(r);
      }
      g.add(strip(F.mouthIn, F.mouthOut, mouthMat));
      g.add(strip(F.throatIn, F.throatOut, throatMat));

      // Bar rack across the mouth at the design gap.
      const bars = Math.floor(F.mouthWidth / K.rackGap);
      const rack = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.035, 0.035, DEPTH + 1.2, 6), steel, bars);
      for (let i = 0; i < bars; i++) {
        const w = (F.mouthWidth * (i + 0.5)) / bars;
        this.m4.makeTranslation(L.ax + L.tx * F.mouthS + L.nx * w, (1.2 - DEPTH) / 2, L.az + L.tz * F.mouthS + L.nz * w);
        rack.setMatrixAt(i, this.m4);
      }
      g.add(rack);

      // Spray bar: a header along the bloom face ahead of the mouth, droppers, and nozzles aimed along the mesh.
      const barMat = mediumMaterial({ color: 0xb8c4ca, roughness: 0.45, metalness: 0.4, emissive: 0xf59e0b, emissiveIntensity: 0 }, false);
      this.barMats.push(barMat);
      const w0 = 1.1;
      const a0 = at(L, F.barS0, w0, 0.55);
      const a1 = at(L, F.barS1 - 0.3, w0, 0.55);
      const header = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.13, a0.distanceTo(a1), 10), barMat);
      header.position.copy(a0).add(a1).multiplyScalar(0.5);
      header.quaternion.setFromUnitVectors(this.up, a1.clone().sub(a0).normalize());
      g.add(header);
      const jetGeo = new THREE.ConeGeometry(0.16, 1.4, 8).rotateZ(-Math.PI / 2).translate(0.7, 0, 0);
      const jetMat = new THREE.MeshBasicMaterial({ color: 0xfbbf24, transparent: true, opacity: 0, toneMapped: false, depthWrite: false });
      for (let k = 0; k <= 4; k++) {
        const s = F.barS0 + ((F.barS1 - 0.3 - F.barS0) * k) / 4;
        const top = at(L, s, w0, 0.55);
        const drop = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 10, 6), barMat);
        drop.position.set(top.x, 0.55 - 5, top.z);
        g.add(drop);
        for (const y of [-2, -5, -8]) {
          const jet = new THREE.Mesh(jetGeo, jetMat.clone());
          jet.position.set(top.x, y, top.z);
          jet.rotation.y = -Math.atan2(L.tz, L.tx);
          jet.renderOrder = 23;
          g.add(jet);
          this.jets[F.index].push(jet);
        }
      }
      g.traverse((o) => (o.userData.pick = 'collector'));
      this.group.add(g);

      // Arrow grid around this funnel: ahead of the bar, along it, through the mouth to the pocket.
      for (let s = F.barS0 - 8; s <= F.entryS - 0.6; s += ARROW_STEP_S) {
        const wmax = Math.min(s < F.mouthS ? Math.min(wallGap(L, s), 7) : funnelWidth(F, Math.min(s, F.throatS)), 7) - 0.35;
        for (let w = 0.9; w <= wmax; w += ARROW_STEP_W) {
          if (s > F.throatS && w > F.throatWidth - 0.3) continue;
          this.arrowPts.push({ x: L.ax + L.tx * s + L.nx * w, z: L.az + L.tz * s + L.nz * w });
        }
      }
    }

    const A = FUNNELS[0];
    this.rackAnchor.set((A.mouthIn.x + A.mouthOut.x) / 2, 1.4, (A.mouthIn.z + A.mouthOut.z) / 2);
    this.throatAnchor.set((A.throatIn.x + A.throatOut.x) / 2, 1.2, (A.throatIn.z + A.throatOut.z) / 2);
    const b = at(A.line, (A.barS0 + A.barS1) / 2, 1.1, 1.2);
    this.barAnchor.copy(b);

    const shape = new THREE.Shape();
    shape.moveTo(0.5, 0);
    shape.lineTo(-0.2, 0.3);
    shape.lineTo(-0.05, 0);
    shape.lineTo(-0.2, -0.3);
    shape.closePath();
    const arrowGeo = new THREE.ShapeGeometry(shape).rotateX(-Math.PI / 2);
    this.arrows = new THREE.InstancedMesh(arrowGeo, new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.9, depthWrite: false, side: THREE.DoubleSide, toneMapped: false }), this.arrowPts.length);
    this.arrows.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.arrows.frustumCulled = false;
    this.arrows.renderOrder = 24;
    this.arrows.visible = false;
    this.col.set(0x67e8f9);
    for (let i = 0; i < this.arrowPts.length; i++) this.arrows.setColorAt(i, this.col);
    this.group.add(this.arrows);

    const tg = new THREE.BufferGeometry();
    tg.setAttribute('position', new THREE.BufferAttribute(this.trailPos, 3).setUsage(THREE.DynamicDrawUsage));
    tg.setAttribute('color', new THREE.BufferAttribute(this.trailCol, 3).setUsage(THREE.DynamicDrawUsage));
    tg.setDrawRange(0, 0);
    this.trail = new THREE.Line(tg, new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.95, depthWrite: false, depthTest: false, toneMapped: false }));
    this.trail.frustumCulled = false;
    this.trail.renderOrder = 30;
    this.group.add(this.trail);
    this.ring = new THREE.Mesh(new THREE.TorusGeometry(0.55, 0.06, 6, 28).rotateX(Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.9, depthTest: false, toneMapped: false }));
    this.ring.renderOrder = 31;
    this.ring.visible = false;
    this.group.add(this.ring);
  }

  update(engine: SimulationEngine, camera: THREE.Camera, dtReal: number, time: number, alpha = 1): void {
    this.closeness = camera.position.distanceTo(this.throatAnchor);
    const close = this.closeness < 150;

    // Spray bar glow and jets follow the pump's actual speed.
    engine.assist.forEach((a, i) => {
      this.barMats[i].emissiveIntensity = 0.15 + 1.4 * a.speed;
      const pulse = 0.75 + 0.25 * Math.sin(time * 7 + i);
      for (const j of this.jets[i]) {
        (j.material as THREE.MeshBasicMaterial).opacity = 0.75 * a.speed * pulse;
        j.scale.set(0.4 + 0.8 * a.speed, 1, 1);
        j.visible = a.speed > 0.01;
      }
    });

    // Water velocity from the engine's own field, the assist included.
    this.arrows.visible = close;
    if (close) {
      this.arrowTimer -= dtReal;
      if (this.arrowTimer <= 0) {
        this.arrowTimer = 0.25;
        for (let i = 0; i < this.arrowPts.length; i++) {
          const { x, z } = this.arrowPts[i];
          engine.sampleWater(x, z, 2, this.tmp);
          engine.flow.sample(x, z, 2, this.flowOnly);
          const sp = Math.hypot(this.tmp.x, this.tmp.z);
          const extra = Math.hypot(this.tmp.x - this.flowOnly.x, this.tmp.z - this.flowOnly.z);
          // Square root so the slow water of a weak sweep still shows a difference.
          const len = 0.3 + Math.sqrt(Math.min(sp, 0.45)) * 2.6;
          this.q.setFromAxisAngle(this.up, -Math.atan2(this.tmp.z, this.tmp.x));
          this.p.set(x, 0.3, z);
          this.sc.set(len, 1, 0.55 + len * 0.35);
          this.m4.compose(this.p, this.q, this.sc);
          this.arrows.setMatrixAt(i, this.m4);
          // Amber where the jets add to the water, by the share they add.
          const k = sp > 1e-4 ? Math.min(1, (2.2 * extra) / sp) : 0;
          this.col.setRGB(0.55 + 0.45 * k, 0.92 - 0.25 * k, 0.98 - 0.85 * k);
          this.arrows.setColorAt(i, this.col);
        }
        this.arrows.instanceMatrix.needsUpdate = true;
        if (this.arrows.instanceColor) this.arrows.instanceColor.needsUpdate = true;
      }
    }

    // One real jellyfish, followed from the net through the mouth and throat into the pocket.
    const p = engine.pool;
    const valid = this.trackSlot >= 0 && p.state[this.trackSlot] !== S_INACTIVE && p.id[this.trackSlot] === this.trackId;
    if (!valid || p.state[this.trackSlot] === S_TRANSFERRED) {
      if (this.trackId >= 0) this.trackGone += dtReal;
      if (this.trackId < 0 || this.trackGone > 3) {
        this.pickTrack(engine);
        this.trailN = 0;
        this.trackGone = 0;
      }
    }
    const tracking = this.trackSlot >= 0 && p.id[this.trackSlot] === this.trackId && p.state[this.trackSlot] !== S_INACTIVE && p.state[this.trackSlot] !== S_TRANSFERRED;
    if (tracking) {
      const i = this.trackSlot;
      const st = p.state[i];
      const phase = st === S_TRANSFER_QUEUE ? 2 : st === S_FUNNEL ? 1 : 0;
      if (phase === 1 && this.trackPhase === 0) this.trackMouthT = engine.time;
      this.trackPhase = Math.max(this.trackPhase, phase);
      const x = p.ox[i] + (p.px[i] - p.ox[i]) * alpha;
      const y = Math.min(p.oy[i] + (p.py[i] - p.oy[i]) * alpha, -0.3);
      const z = p.oz[i] + (p.pz[i] - p.oz[i]) * alpha;
      const n = this.trailN;
      const lx = n > 0 ? this.trailPos[(n - 1) * 3] : Infinity;
      const lz = n > 0 ? this.trailPos[(n - 1) * 3 + 2] : Infinity;
      if (Math.hypot(x - lx, z - lz) > 0.12) {
        if (n >= TRAIL_MAX) {
          this.trailPos.copyWithin(0, 3);
          this.trailPhase.copyWithin(0, 1);
          this.trailN = TRAIL_MAX - 1;
        }
        const k = this.trailN++;
        this.trailPos[k * 3] = x;
        this.trailPos[k * 3 + 1] = y;
        this.trailPos[k * 3 + 2] = z;
        this.trailPhase[k] = phase;
      }
      this.ring.visible = close;
      this.ring.position.set(x, y, z);
      this.trackAnchor.set(x, 1.0, z);
      const snag = p.flags[i] & F_SNAGGED && (st === S_GUIDED || st === S_FUNNEL);
      const stalled = !snag && p.slow[i] >= ASSUMPTIONS.collector.stallAfter;
      (this.ring.material as THREE.MeshBasicMaterial).color.setHex(snag ? 0xf472b6 : stalled ? 0xfbbf24 : 0xffffff);
      const since = this.trackMouthT >= 0 ? engine.time - this.trackMouthT : null;
      const where = st === S_TRANSFER_QUEUE ? 'in the pocket: collected' : st === S_FUNNEL ? 'in the funnel, not collected yet' : st === S_GUIDED ? 'on the net, sweeping to the mouth' : 'off the net';
      this.trackInfo = { phase: `${snag ? 'snagged, ' : stalled ? 'stalled, ' : ''}${where}`, since };
    } else {
      this.ring.visible = false;
      this.trackInfo = null;
    }
    const n = this.trailN;
    for (let k = 0; k < n; k++) {
      const age = (n - 1 - k) / Math.max(1, n - 1);
      const c = PHASE[this.trailPhase[k]];
      const f = 0.25 + 0.75 * (1 - age);
      this.trailCol[k * 3] = c.r * f;
      this.trailCol[k * 3 + 1] = c.g * f;
      this.trailCol[k * 3 + 2] = c.b * f;
    }
    const tg = this.trail.geometry;
    tg.setDrawRange(0, n);
    (tg.attributes.position as THREE.BufferAttribute).needsUpdate = true;
    (tg.attributes.color as THREE.BufferAttribute).needsUpdate = true;
    this.trail.visible = close && n > 1;
  }

  /** Pick a jellyfish on net A that is about to reach the mouth, near the surface so it shows from above. */
  private pickTrack(engine: SimulationEngine): void {
    const p = engine.pool;
    const F = FUNNELS[0];
    const L = F.line;
    let best = -1;
    let bestScore = Infinity;
    for (let i = 0; i < p.capacity; i++) {
      if (p.state[i] !== S_GUIDED || p.lane[i] !== 0) continue;
      const s = netArc(L, p.px[i], p.pz[i]);
      const ahead = F.mouthS - s;
      if (ahead < 3 || ahead > 14) continue;
      if (p.flags[i] & F_SNAGGED) continue;
      const score = Math.abs(ahead - 9) + Math.max(0, -p.py[i] - 3) * 3 + Math.abs(netDistance(L, p.px[i], p.pz[i]) - 0.8);
      if (score < bestScore) {
        bestScore = score;
        best = i;
      }
    }
    this.trackSlot = best;
    this.trackId = best >= 0 ? p.id[best] : -1;
    this.trackPhase = 0;
    this.trackMouthT = -1;
  }

  /** Rack gap against the species' bell, for the warning label. */
  static rackCheck(species: keyof typeof SPECIES): { gapCm: number; bellCm: [number, number]; blocks: boolean } {
    const sp = SPECIES[species];
    const gap = SITE.collector.rackGap;
    return { gapCm: Math.round(gap * 100), bellCm: [Math.round(sp.bellMin * 100), Math.round(sp.bellMax * 100)], blocks: gap < sp.bellMin };
  }
}
