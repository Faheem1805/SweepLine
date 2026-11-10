import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { ASSUMPTIONS } from '../../config/assumptions';
import { SITE, seabedDepth } from '../../config/site';
import { pointOnNet, type NetLine } from '../../simulation/geometry';
import {
  BUCKET_FILL,
  BUCKETS,
  CHUTE,
  CREST_DECK,
  ELEVATOR_Z,
  HANG,
  HEAD,
  HEAD_TANK,
  HOPPER,
  LOOP,
  MOUTH,
  NORMAL,
  PITCH,
  pivotAt,
  SHEET_PILE_Z,
  TAIL,
  TIP_AT,
  tipAt,
  UP,
  type Vec3,
} from '../../simulation/lift';
import type { TransferState } from '../../simulation/transfer';
import type { ModuleStatus } from '../../simulation/types';
import { mediumMaterial, SHARED } from '../environment/shaderChunks';

const STATUS: Record<ModuleStatus, number> = {
  ONLINE: 0x2dd4bf,
  STANDBY: 0x7992a0,
  ACTIVATING: 0xf5b94c,
  FAULT: 0xf87171,
  DISABLED: 0x33414a,
  OFF: 0x33414a,
};

const K = ASSUMPTIONS.lift;
const BK = K.bucket;

function box(mat: THREE.Material, w: number, h: number, d: number, x: number, y: number, z: number): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

/** A box between two corners. */
function block(mat: THREE.Material, x0: number, x1: number, y0: number, y1: number, z0: number, z1: number): THREE.Mesh {
  return box(mat, Math.abs(x1 - x0), Math.abs(y1 - y0), Math.abs(z1 - z0), (x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
}

/** A beam from a to b with a square section. */
function beam(mat: THREE.Material, a: Vec3, b: Vec3, size: number): THREE.Mesh {
  const A = new THREE.Vector3(a.x, a.y, a.z);
  const B = new THREE.Vector3(b.x, b.y, b.z);
  const len = A.distanceTo(B);
  const m = new THREE.Mesh(new THREE.BoxGeometry(size, len, size), mat);
  m.position.copy(A).add(B).multiplyScalar(0.5);
  m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), B.sub(A).normalize());
  m.castShadow = true;
  return m;
}

/** A pipe along a polyline, with an additive pulse tube inside it that shows the flow. */
function pipeAlong(points: THREE.Vector3[], radius: number, material: THREE.Material, pulse: THREE.Material, seg = 80): THREE.Group {
  const curve = new THREE.CatmullRomCurve3(points, false, 'catmullrom', 0.12);
  const g = new THREE.Group();
  const shell = new THREE.Mesh(new THREE.TubeGeometry(curve, seg, radius, 12), material);
  shell.castShadow = true;
  g.add(shell);
  const glow = new THREE.Mesh(new THREE.TubeGeometry(curve, seg, radius * 1.18, 8), pulse);
  glow.renderOrder = 24;
  g.add(glow);
  return g;
}

/**
 * An open-top bucket, centred on its middle: a floor, two end walls, a rim and hanger lugs. Length
 * along x, width along z. The side walls are drawn apart, see-through, so the water and the animals
 * inside can be seen from the side.
 */
function bucketGeometry(): THREE.BufferGeometry {
  const t = 0.04;
  const L = BK.length;
  const W = BK.width;
  const D = BK.depth;
  const parts = [
    new THREE.BoxGeometry(L, t, W).translate(0, -D / 2, 0),
    new THREE.BoxGeometry(t, D, W).translate(-L / 2, 0, 0),
    new THREE.BoxGeometry(t, D, W).translate(L / 2, 0, 0),
    // Rim and hanger lugs at the pivot.
    new THREE.BoxGeometry(L + 0.06, 0.05, 0.06).translate(0, D / 2, -W / 2),
    new THREE.BoxGeometry(L + 0.06, 0.05, 0.06).translate(0, D / 2, W / 2),
    new THREE.BoxGeometry(0.08, HANG - D / 2 + 0.06, 0.06).translate(0, D / 2 + (HANG - D / 2) / 2, -W / 2 - 0.04),
    new THREE.BoxGeometry(0.08, HANG - D / 2 + 0.06, 0.06).translate(0, D / 2 + (HANG - D / 2) / 2, W / 2 + 0.04),
  ];
  const g = mergeGeometries(parts)!;
  g.computeVertexNormals();
  return g;
}

/** The bucket's two side walls, facing out, so only the near one is drawn. */
function bucketSidesGeometry(): THREE.BufferGeometry {
  const near = new THREE.PlaneGeometry(BK.length, BK.depth).translate(0, 0, BK.width / 2);
  const far = new THREE.PlaneGeometry(BK.length, BK.depth).rotateY(Math.PI).translate(0, 0, -BK.width / 2);
  return mergeGeometries([near, far])!;
}

/**
 * The collector at net B's end, the one lift for both nets: the funnel between net B and the west
 * breakwater, a funnel sensor, a hopper, and a bucket elevator that climbs over the breakwater's
 * crest. Each bucket hangs level, scoops water and jellyfish from the hopper, and is tipped at the
 * head into a chute to the head tank on the crest; a clean-water feed pump tops the tank up, and the
 * release line runs from it down the seaward side and along the seabed. The buckets move with the
 * simulation's chain, so a drawn animal is in the bucket the model has it in.
 */
export class CollectorSystem {
  readonly group = new THREE.Group();
  /** Where labels and cameras look. */
  readonly anchor = new THREE.Vector3();
  /** Label anchors for the lift, section by section. */
  readonly sections = {
    funnel: new THREE.Vector3(),
    hopper: new THREE.Vector3(),
    screw: new THREE.Vector3(),
    launder: new THREE.Vector3(),
    tank: new THREE.Vector3(),
  };
  private readonly pulseMat: THREE.ShaderMaterial;
  private readonly waterMat: THREE.ShaderMaterial;
  private readonly buckets: THREE.InstancedMesh;
  private readonly bucketSides: THREE.InstancedMesh;
  private readonly bucketWater: THREE.InstancedMesh;
  private readonly sprockets: THREE.Mesh[] = [];
  private readonly lamps: THREE.MeshBasicMaterial[] = [];
  private readonly beam: THREE.MeshBasicMaterial;
  private readonly m = new THREE.Matrix4();
  private readonly q = new THREE.Quaternion();
  private readonly v = new THREE.Vector3();
  private readonly sc = new THREE.Vector3(1, 1, 1);
  private readonly zAxis = new THREE.Vector3(0, 0, 1);
  private readonly p: Vec3 = { x: 0, y: 0, z: 0 };
  private lastChain = 0;

  constructor(nets: readonly NetLine[]) {
    this.group.name = 'collector';
    const steel = mediumMaterial({ color: 0x4a5a63, roughness: 0.55, metalness: 0.55 });
    const frame = mediumMaterial({ color: 0x8a9aa3, roughness: 0.45, metalness: 0.6 });
    const deck = mediumMaterial({ color: 0xb9c1c2, roughness: 0.8, metalness: 0.1 }, false);
    const teal = mediumMaterial({ color: 0x18a999, roughness: 0.5, metalness: 0.2, emissive: 0x06302c, emissiveIntensity: 0.6, side: THREE.DoubleSide }, false);
    const yellow = mediumMaterial({ color: 0xe8b23a, roughness: 0.5, metalness: 0.2 }, false);
    const drive = mediumMaterial({ color: 0x1f6f8b, roughness: 0.45, metalness: 0.4 }, false);
    const pipe = mediumMaterial({ color: 0x23323a, roughness: 0.5, metalness: 0.25 });
    const concrete = mediumMaterial({ color: 0x9aa39f, roughness: 0.9 });
    const bucketMat = mediumMaterial({ color: 0xd8dee0, roughness: 0.35, metalness: 0.7, side: THREE.DoubleSide });
    this.pulseMat = new THREE.ShaderMaterial({
      uniforms: { uTime: SHARED.uTime, uFlow: { value: 0 } },
      vertexShader: /* glsl */ `
        varying vec2 vUv;
        void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
      `,
      fragmentShader: /* glsl */ `
        uniform float uTime;
        uniform float uFlow;
        varying vec2 vUv;
        void main() {
          float p = fract(vUv.x * 9.0 - uTime * 0.6);
          float a = smoothstep(0.0, 0.35, p) * smoothstep(0.9, 0.4, p) * uFlow;
          gl_FragColor = vec4(vec3(0.2, 0.85, 0.78) * a * 0.42, 1.0);
        }
      `,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    // Water in the buckets, the chute and the tank: ripples that move while the elevator runs.
    this.waterMat = new THREE.ShaderMaterial({
      uniforms: { uTime: SHARED.uTime, uFlow: { value: 0 } },
      vertexShader: /* glsl */ `
        varying vec3 vW;
        void main() { vec4 w = modelMatrix * instanceMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }
      `,
      fragmentShader: /* glsl */ `
        uniform float uTime;
        uniform float uFlow;
        varying vec3 vW;
        void main() {
          float w = 0.5 + 0.5 * sin(vW.x * 5.0 + vW.z * 3.0 - uTime * (1.0 + 4.0 * uFlow));
          vec3 c = mix(vec3(0.08, 0.42, 0.55), vec3(0.42, 0.8, 0.9), 0.25 + 0.35 * w);
          gl_FragColor = vec4(c, 0.62);
        }
      `,
      transparent: true,
      depthWrite: false,
    });
    const plainWater = new THREE.ShaderMaterial({
      uniforms: this.waterMat.uniforms,
      vertexShader: /* glsl */ `
        varying vec3 vW;
        void main() { vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }
      `,
      fragmentShader: this.waterMat.fragmentShader,
      transparent: true,
      depthWrite: false,
    });

    const L = nets[1];
    const hw = SITE.channel.halfWidth;
    const g = new THREE.Group();
    const H = HOPPER;
    const wallTop = 0.8;
    const zc = ELEVATOR_Z;

    // Sheet-pile face along the west breakwater, from below the hopper to the funnel's mouth: the funnel's outer side.
    g.add(block(concrete, hw, hw + 0.6, -SITE.channel.depth - 1.5, wallTop - 0.2, SHEET_PILE_Z[0], SHEET_PILE_Z[1]));
    // Hopper: an open box against the wall, its mouth toward the funnel.
    const t = 0.35;
    g.add(block(concrete, H.x0, H.x1, H.floor - 0.4, H.floor, H.z0, H.z1));
    g.add(block(concrete, H.x0, H.x0 + t, H.floor, wallTop, H.z0, H.z1));
    g.add(block(concrete, H.x0, H.x1, H.floor, wallTop, H.z0, H.z0 + t));
    g.add(block(concrete, H.x0, MOUTH.x - 1.8, H.floor, wallTop, H.z1 - t, H.z1));
    g.add(block(concrete, MOUTH.x - 1.8, H.x1, -0.6, wallTop, H.z1 - t, H.z1));
    g.add(block(steel, H.x0 - 0.9, H.x0, wallTop, wallTop + 0.12, H.z0, H.z1));

    // Funnel sensor: an imaging sonar on a post at the funnel's mouth, looking down the funnel into the hopper.
    const s0 = pointOnNet(L, L.length - SITE.collector.pocketLength + 1);
    const head = new THREE.Vector3(hw - 0.8, -2.2, s0.z);
    g.add(block(steel, hw - 1.0, hw - 0.6, -2, 1.8, s0.z - 0.2, s0.z + 0.2));
    g.add(box(yellow, 0.7, 0.55, 0.7, head.x, head.y, head.z));
    g.add(box(yellow, 0.5, 0.4, 0.4, head.x, 2.0, head.z));
    this.beam = new THREE.MeshBasicMaterial({ color: 0x2dd4bf, toneMapped: false });
    // Status light on the sensor's junction box: green while it sees jellyfish.
    const light = new THREE.Mesh(new THREE.SphereGeometry(0.16, 10, 8), this.beam);
    light.position.set(head.x, 2.35, head.z);
    g.add(light);

    // ---------------------------------------------------------- the elevator
    const r = K.sprocketRadius;
    const half = BK.width / 2 + 0.22;
    // Side frames: a rail under each strand on both sides, braced across.
    for (const side of [-1, 1]) {
      const z = zc + side * half;
      for (const strand of [1, -1]) {
        const off = strand * (r + 0.05);
        const a = { x: TAIL.x + NORMAL.x * off, y: TAIL.y + NORMAL.y * off, z };
        const b = { x: HEAD.x + NORMAL.x * off, y: HEAD.y + NORMAL.y * off, z };
        g.add(beam(frame, a, b, 0.16));
      }
      for (let s = 0; s <= K.length; s += 2.1) {
        const a = { x: TAIL.x + UP.x * s + NORMAL.x * (r + 0.05), y: TAIL.y + UP.y * s + NORMAL.y * (r + 0.05), z };
        const b = { x: TAIL.x + UP.x * s - NORMAL.x * (r + 0.05), y: TAIL.y + UP.y * s - NORMAL.y * (r + 0.05), z };
        g.add(beam(frame, a, b, 0.1));
      }
    }
    // Cross ties over the top, every few metres, clear of the buckets.
    for (let s = 1; s <= K.length - 1; s += 4.2) {
      const c = { x: TAIL.x + UP.x * s + NORMAL.x * (r + 0.4), y: TAIL.y + UP.y * s + NORMAL.y * (r + 0.4) };
      g.add(beam(frame, { x: c.x, y: c.y, z: zc - half }, { x: c.x, y: c.y, z: zc + half }, 0.09));
    }
    // Chains: a loop on each side.
    const loopPts: THREE.Vector3[] = [];
    for (let i = 0; i < 160; i++) {
      pivotAt((i / 160) * LOOP, this.p);
      loopPts.push(new THREE.Vector3(this.p.x, this.p.y, 0));
    }
    const chainCurve = new THREE.CatmullRomCurve3(loopPts, true);
    const chainGeo = new THREE.TubeGeometry(chainCurve, 240, 0.045, 6, true);
    const chainMat = mediumMaterial({ color: 0x2a3237, roughness: 0.5, metalness: 0.7 });
    for (const side of [-1, 1]) {
      const c = new THREE.Mesh(chainGeo, chainMat);
      c.position.z = zc + side * (BK.width / 2 + 0.08);
      g.add(c);
    }
    // Sprockets at the tail (in the hopper) and the head (over the crest).
    const sprocketGeo = new THREE.CylinderGeometry(r, r, BK.width + 0.35, 20).rotateX(Math.PI / 2);
    for (const c of [TAIL, HEAD]) {
      const s = new THREE.Mesh(sprocketGeo, steel);
      s.position.set(c.x, c.y, c.z);
      g.add(s);
      this.sprockets.push(s);
    }
    // Head: twin drives on the head shaft, duty and standby, each with a lamp.
    for (const side of [-1, 1]) {
      const z = zc + side * (half + 0.75);
      g.add(box(drive, 1.0, 0.9, 1.2, HEAD.x, HEAD.y, z));
      const motor = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.34, 1.1, 18), drive);
      motor.rotation.x = Math.PI / 2;
      motor.position.set(HEAD.x - 0.2, HEAD.y + 0.75, z + side * 0.2);
      g.add(motor);
      const lamp = new THREE.MeshBasicMaterial({ color: STATUS.STANDBY, toneMapped: false });
      const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.2, 12, 10), lamp);
      bulb.position.set(HEAD.x, HEAD.y + 0.75, z);
      g.add(bulb);
      this.lamps.push(lamp);
    }
    // Hood over the head, open on the chute side.
    g.add(block(frame, HEAD.x - 1.1, HEAD.x + 0.9, HEAD.y + 1.1, HEAD.y + 1.2, zc - half, zc + half));
    // Supports: posts outside the buckets, from the sheet-pile wall's cap and from the crest deck up to the lower rails.
    for (const xs of [hw + 0.3, CREST_DECK.x0 + 0.4]) {
      const off = -(r + 0.05);
      const s = (xs - TAIL.x - NORMAL.x * off) / UP.x;
      const yRail = TAIL.y + NORMAL.y * off + UP.y * s;
      const base = xs > hw + 1 ? CREST_DECK.top : wallTop + 0.4;
      for (const side of [-1, 1]) g.add(block(frame, xs - 0.12, xs + 0.12, base, yRail, zc + side * half - 0.12, zc + side * half + 0.12));
    }
    // Legs from the tail frame to the hopper floor.
    for (const side of [-1, 1]) g.add(block(frame, TAIL.x - 0.12, TAIL.x + 0.12, H.floor, TAIL.y, zc + side * half - 0.12, zc + side * half + 0.12));

    // Buckets, and the water in each full one.
    this.buckets = new THREE.InstancedMesh(bucketGeometry(), bucketMat, BUCKETS);
    this.buckets.castShadow = true;
    this.buckets.frustumCulled = false;
    g.add(this.buckets);
    const sideMat = new THREE.MeshStandardMaterial({ color: 0xdfeef3, roughness: 0.1, metalness: 0.2, transparent: true, opacity: 0.22, depthWrite: false, side: THREE.FrontSide });
    this.bucketSides = new THREE.InstancedMesh(bucketSidesGeometry(), sideMat, BUCKETS);
    this.bucketSides.frustumCulled = false;
    this.bucketSides.renderOrder = 9;
    g.add(this.bucketSides);
    const fill = BUCKET_FILL;
    this.bucketWater = new THREE.InstancedMesh(new THREE.BoxGeometry(BK.length - 0.08, fill, BK.width - 0.08).translate(0, -BK.depth / 2 + fill / 2 + 0.02, 0), this.waterMat, BUCKETS);
    this.bucketWater.frustumCulled = false;
    this.bucketWater.renderOrder = 4;
    g.add(this.bucketWater);

    // Chute from the head into the tank: an open trough with water running down it.
    for (let k = 1; k < CHUTE.length; k++) {
      const a = CHUTE[k - 1];
      const b = CHUTE[k];
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const len = Math.hypot(dx, dy);
      const trough = new THREE.Group();
      trough.position.set((a.x + b.x) / 2, (a.y + b.y) / 2 - 0.2, zc);
      trough.rotation.z = Math.atan2(dy, dx);
      trough.add(box(steel, len + 0.2, 0.06, 1.2, 0, -0.25, 0));
      trough.add(box(steel, len + 0.2, 0.5, 0.06, 0, 0, 0.6));
      trough.add(box(steel, len + 0.2, 0.5, 0.06, 0, 0, -0.6));
      const w = new THREE.Mesh(new THREE.PlaneGeometry(len + 0.2, 1.1).rotateX(-Math.PI / 2), plainWater);
      w.position.y = -0.12;
      w.renderOrder = 3;
      trough.add(w);
      g.add(trough);
    }

    // ---------------------------------------------------------- on the crest
    const D = CREST_DECK;
    g.add(block(deck, D.x0, D.x1, D.top - 0.3, D.top, D.z0, D.z1));
    const rail = mediumMaterial({ color: 0xe8b23a, roughness: 0.6 }, false);
    g.add(block(rail, D.x0, D.x1, D.top + 1.05, D.top + 1.12, D.z0, D.z0 + 0.07));
    g.add(block(rail, D.x0, D.x1, D.top + 1.05, D.top + 1.12, D.z1 - 0.07, D.z1));
    // Head tank, open on top.
    const T = HEAD_TANK;
    const tankTop = ASSUMPTIONS.transfer.headTankLevel + 1.3;
    const tank = new THREE.Mesh(new THREE.CylinderGeometry(T.r, T.r, tankTop - D.top, 32, 1, true), teal);
    tank.position.set(T.x, (tankTop + D.top) / 2, T.z);
    tank.castShadow = true;
    g.add(tank);
    const tankWater = new THREE.Mesh(new THREE.CircleGeometry(T.r - 0.05, 32).rotateX(-Math.PI / 2), plainWater);
    tankWater.position.set(T.x, ASSUMPTIONS.transfer.headTankLevel, T.z);
    tankWater.renderOrder = 3;
    g.add(tankWater);
    const rim = new THREE.Mesh(new THREE.TorusGeometry(T.r, 0.1, 8, 40).rotateX(Math.PI / 2), steel);
    rim.position.set(T.x, tankTop, T.z);
    g.add(rim);
    // Feed pump: clean water from behind both nets, to carry the animals down the line.
    const fp = { x: T.x + 1.2, z: zc - 4.4 };
    g.add(block(drive, fp.x - 0.8, fp.x + 0.8, D.top, D.top + 1.1, fp.z - 0.6, fp.z + 0.6));
    const feed = [
      new THREE.Vector3(fp.x - 0.8, D.top + 0.5, fp.z),
      new THREE.Vector3(hw + 4, 2.4, fp.z - 2),
      new THREE.Vector3(hw - 1.2, 0.4, H.z0 - 6),
      new THREE.Vector3(hw - 1.6, -3.5, H.z0 - 9),
    ];
    g.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(feed), 30, 0.22, 10), pipe));
    g.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3([new THREE.Vector3(fp.x + 0.8, D.top + 0.5, fp.z), new THREE.Vector3(T.x + T.r * 0.6, tankTop - 0.3, T.z - T.r * 0.7)]), 8, 0.18, 10), pipe));
    // Control kiosk.
    g.add(block(mediumMaterial({ color: 0xdfe5e4, roughness: 0.7 }, false), D.x1 - 3.2, D.x1 - 0.4, D.top, D.top + 2.6, zc + 2.4, zc + 5.4));
    g.add(block(teal, D.x1 - 3.4, D.x1 - 0.2, D.top + 2.6, D.top + 2.95, zc + 2.2, zc + 5.6));
    g.traverse((o) => (o.userData.pick = 'collector'));
    this.group.add(g);

    // Release line: out of the tank, down the breakwater's seaward side and along the seabed to the outlet.
    const route = SITE.pipeRoute;
    const pts: THREE.Vector3[] = [new THREE.Vector3(T.x + T.r - 0.2, D.top + 0.6, T.z)];
    for (let i = 0; i < route.length; i++) {
      const [x, z] = route[i];
      const onMound = x < 120;
      pts.push(new THREE.Vector3(x, onMound ? D.top + 0.6 - Math.max(0, x - 96) * 0.15 : -seabedDepth(x, z) + 0.4, z));
    }
    const line = pipeAlong(pts, 0.55, pipe, this.pulseMat, 240);
    line.traverse((o) => (o.userData.pick = 'release'));
    this.group.add(line);

    this.anchor.set(HEAD.x, HEAD.y + 6, zc);
    const f = pointOnNet(L, L.length - 9);
    this.sections.funnel.set(f.x + 1.5, 0.6, f.z);
    this.sections.hopper.set((H.x0 + H.x1) / 2, 1.2, (H.z0 + H.z1) / 2);
    pivotAt(K.length * 0.55, this.p);
    this.sections.screw.set(this.p.x, this.p.y + 1.2, zc);
    this.sections.launder.set(HEAD.x + 1.2, HEAD.y + 1.6, zc);
    this.sections.tank.set(T.x, tankTop + 1.4, T.z);
    this.placeBuckets(0, false);
  }

  /** Buckets round the chain loop at `chain` metres of travel. */
  private placeBuckets(chain: number, wet: boolean): void {
    const off = ((chain % PITCH) + PITCH) % PITCH;
    let w = 0;
    for (let k = 0; k < BUCKETS; k++) {
      const s = off + k * PITCH;
      pivotAt(s, this.p);
      const tip = -tipAt(s);
      this.q.setFromAxisAngle(this.zAxis, tip);
      // The bucket hangs below its pivot and swings about it when tipped.
      this.v.set(0, -HANG, 0).applyQuaternion(this.q);
      this.v.x += this.p.x;
      this.v.y += this.p.y;
      this.v.z = this.p.z;
      this.m.compose(this.v, this.q, this.sc);
      this.buckets.setMatrixAt(k, this.m);
      this.bucketSides.setMatrixAt(k, this.m);
      if (wet && s < TIP_AT - 0.05) this.bucketWater.setMatrixAt(w++, this.m);
    }
    this.buckets.instanceMatrix.needsUpdate = true;
    this.bucketSides.instanceMatrix.needsUpdate = true;
    this.bucketWater.count = w;
    this.bucketWater.instanceMatrix.needsUpdate = true;
  }

  update(tr: TransferState, flow: number, time: number): void {
    this.pulseMat.uniforms.uFlow.value = flow;
    const st = tr.lift;
    this.waterMat.uniforms.uFlow.value = st.speed;
    const chain = st.phase * PITCH;
    this.placeBuckets(chain, st.phase > 0);
    // Sprockets turn with the chain.
    const da = (chain - this.lastChain) / K.sprocketRadius;
    this.lastChain = chain;
    for (const s of this.sprockets) s.rotation.z -= da;
    const status: ModuleStatus[] = [tr.primaryStatus, tr.standbyStatus];
    this.lamps.forEach((l, i) => {
      l.color.setHex(STATUS[status[i]]);
      if (status[i] === 'FAULT' && Math.sin(time * 6) < 0) l.color.setHex(0x3a1414);
    });
    this.beam.color.setHex(st.seen ? (Math.sin(time * 5) > 0 ? 0x4ade80 : 0x22c55e) : 0x7992a0);
  }
}
