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
  ELEVATOR,
  HANG,
  HEAD,
  HEAD_L,
  HEAD_TANK,
  HOPPER,
  LOOP,
  MOUTH,
  netBX,
  NORMAL_L,
  PITCH,
  pivotAt,
  pivotLocalAt,
  SHEET_PILE_Z,
  TAIL,
  TAIL_L,
  TIP_AT,
  tipAt,
  toWorld,
  UP_L,
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
/** Blur copies per bucket at fast time-lapse. */
const GHOSTS = 3;

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
 * A flat strip along a path, `width` wide, lying across the path's horizontal normal (so on a slope
 * it tilts with the slope, like the top of a conveyor). `uv.x` runs along it in metres.
 */
function ribbonAlong(curve: THREE.Curve<THREE.Vector3>, width: number, segments: number): THREE.BufferGeometry {
  const pos: number[] = [];
  const uv: number[] = [];
  const idx: number[] = [];
  const p = new THREE.Vector3();
  const t = new THREE.Vector3();
  const side = new THREE.Vector3();
  const up = new THREE.Vector3(0, 1, 0);
  const lengths = curve.getLengths(segments);
  for (let i = 0; i <= segments; i++) {
    const f = i / segments;
    curve.getPointAt(f, p);
    curve.getTangentAt(f, t);
    side.crossVectors(t, up);
    if (side.lengthSq() < 1e-6) side.set(1, 0, 0);
    side.normalize().multiplyScalar(width / 2);
    pos.push(p.x - side.x, p.y - side.y, p.z - side.z, p.x + side.x, p.y + side.y, p.z + side.z);
    const s = lengths[Math.min(i, lengths.length - 1)];
    uv.push(s, 0, s, 1);
    if (i < segments) {
      const a = i * 2;
      idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  return g;
}

/**
 * An open-top bucket, centred on its middle: a floor, two end walls, a rim and hanger lugs. Length
 * along x, width along z (in the elevator's frame). The side walls are drawn apart, see-through, so
 * the water and the animals inside can be seen from the side.
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

/** Height of the elevator's lower rail at distance `u` along the run (elevator frame). */
function lowerRailY(u: number): number {
  const off = -(K.sprocketRadius + 0.05);
  const a = (u - TAIL_L.x - NORMAL_L.x * off) / UP_L.x;
  return TAIL_L.y + NORMAL_L.y * off + UP_L.y * a;
}

/**
 * The collector at net B's end, the one lift for both nets: the funnel between net B and the west
 * breakwater, a funnel sensor, the barred mouth, the hopper at the funnel's tip, and a bucket
 * elevator that stands in the hopper and climbs along the wall, in the direction the bloom is
 * travelling, past the end of net B. Each bucket hangs level, scoops water and jellyfish at the
 * tail, and is tipped at the head into a chute across to the head tank on the breakwater; a
 * clean-water feed pump tops the tank up, and the release line runs from it down the seaward side
 * and along the seabed. The buckets move with the simulation's chain, so a drawn animal is in the
 * bucket the model has it in. A glowing path shows the way the bloom goes while the lift runs.
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
  private readonly pathMat: THREE.ShaderMaterial;
  private readonly waterMat: THREE.ShaderMaterial;
  private readonly buckets: THREE.InstancedMesh;
  private readonly bucketSides: THREE.InstancedMesh;
  /** Faint copies of the buckets along their path, for motion blur at fast time-lapse. */
  private readonly ghosts: THREE.InstancedMesh;
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
  private pathOn = 0;

  constructor(nets: readonly NetLine[]) {
    this.group.name = 'collector';
    const steel = mediumMaterial({ color: 0x4a5a63, roughness: 0.5, metalness: 0.6 });
    const frame = mediumMaterial({ color: 0x9fb0b8, roughness: 0.38, metalness: 0.7 });
    const accent = mediumMaterial({ color: 0x14b8a6, roughness: 0.35, metalness: 0.4, emissive: 0x0b5f57, emissiveIntensity: 0.55 }, false);
    const deck = mediumMaterial({ color: 0xc4cbcc, roughness: 0.8, metalness: 0.1 }, false);
    const teal = mediumMaterial({ color: 0x18a999, roughness: 0.45, metalness: 0.25, emissive: 0x06302c, emissiveIntensity: 0.6, side: THREE.DoubleSide }, false);
    const yellow = mediumMaterial({ color: 0xf2b53a, roughness: 0.45, metalness: 0.2 }, false);
    const drive = mediumMaterial({ color: 0x1f6f8b, roughness: 0.4, metalness: 0.45 }, false);
    const pipe = mediumMaterial({ color: 0x23323a, roughness: 0.5, metalness: 0.25 });
    const concrete = mediumMaterial({ color: 0x9aa39f, roughness: 0.9 });
    const bucketMat = mediumMaterial({ color: 0xe3e8ea, roughness: 0.3, metalness: 0.75, side: THREE.DoubleSide });
    // Clear glass: nearly invisible face-on, a bright edge where it turns away (Fresnel), so the
    // enclosure reads as glass and everything inside it stays in view.
    const glass = new THREE.ShaderMaterial({
      vertexShader: /* glsl */ `
        varying vec3 vN;
        varying vec3 vV;
        void main() {
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          vV = -mv.xyz;
          vN = normalMatrix * normal;
          gl_Position = projectionMatrix * mv;
        }
      `,
      fragmentShader: /* glsl */ `
        varying vec3 vN;
        varying vec3 vV;
        void main() {
          vec3 n = normalize(vN);
          if (!gl_FrontFacing) n = -n;
          float f = pow(1.0 - clamp(abs(dot(n, normalize(vV))), 0.0, 1.0), 2.6);
          vec3 c = mix(vec3(0.5, 0.82, 0.92), vec3(0.85, 1.0, 1.0), f);
          gl_FragColor = vec4(c * (0.4 + 0.9 * f), 0.06 + 0.42 * f);
        }
      `,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
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
    // The bloom's path, drawn as chevrons that run the way the jellyfish go: along the funnel, in at
    // the mouth, up the elevator and across the chute to the tank.
    this.pathMat = new THREE.ShaderMaterial({
      uniforms: { uTime: SHARED.uTime, uOn: { value: 0 }, uLength: { value: 1 } },
      vertexShader: /* glsl */ `
        varying vec2 vUv;
        void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
      `,
      fragmentShader: /* glsl */ `
        uniform float uTime;
        uniform float uOn;
        uniform float uLength;
        varying vec2 vUv;
        void main() {
          float across = abs(vUv.y - 0.5) * 2.0;
          // Chevrons pointing along the path, 2.4 m apart, moving at 1.6 m/s.
          float s = vUv.x - uTime * 1.6;
          // The tips lead at the middle of the strip, so each chevron points the way the bloom goes.
          float c = fract(s / 2.4 + across * 0.24);
          float chevron = smoothstep(0.0, 0.1, c) * smoothstep(0.4, 0.26, c);
          float edge = smoothstep(1.0, 0.8, across);
          float rim = smoothstep(0.72, 0.95, across) * edge * 0.3;
          float ends = smoothstep(0.0, 4.0, vUv.x) * smoothstep(uLength, uLength - 4.0, vUv.x);
          float a = (chevron * edge * 0.9 + rim) * ends * uOn;
          vec3 col = mix(vec3(0.12, 0.95, 0.42), vec3(0.1, 0.85, 0.75), smoothstep(0.0, 1.0, vUv.x / uLength));
          gl_FragColor = vec4(col * a * 0.95, a);
        }
      `,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
      toneMapped: false,
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
    const bed = -SITE.channel.depth;
    const g = new THREE.Group();
    const H = HOPPER;
    const wallTop = 0.8;
    const w3 = (u: number, y: number, w: number): Vec3 => toWorld(u, y, w, { x: 0, y: 0, z: 0 });

    // Sheet-pile face along the west breakwater, from past the elevator's head to beyond the funnel's
    // mouth, with a steel capping beam: the funnel's and the hopper's outer side.
    g.add(block(concrete, hw, hw + 0.6, bed - 1.5, wallTop - 0.2, SHEET_PILE_Z[0], SHEET_PILE_Z[1]));
    g.add(block(steel, hw - 0.05, hw + 0.75, wallTop - 0.2, wallTop + 0.05, SHEET_PILE_Z[0], SHEET_PILE_Z[1]));

    // Hopper: the funnel's tip past the mouth. Net B is its west side (drawn with the net), the wall its
    // east side, and a concrete floor under the elevator's tail.
    {
      const shape = new THREE.Shape();
      shape.moveTo(MOUTH.x0, H.z1);
      shape.lineTo(H.x1, H.z1);
      shape.lineTo(H.x1, H.z0);
      shape.lineTo(netBX(H.z0), H.z0);
      shape.closePath();
      const floor = new THREE.Mesh(new THREE.ExtrudeGeometry(shape, { depth: 0.4, bevelEnabled: false }).rotateX(Math.PI / 2), concrete);
      floor.position.y = H.floor;
      floor.receiveShadow = true;
      g.add(floor);
      // A walkway on top of net B's last stretch, from the mouth to the wall: the hopper's west rim.
      g.add(beam(steel, { x: MOUTH.x0, y: wallTop + 0.08, z: H.z1 }, { x: netBX(H.z0), y: wallTop + 0.08, z: H.z0 }, 0.22));
      g.add(beam(yellow, { x: MOUTH.x0, y: wallTop + 0.24, z: H.z1 }, { x: netBX(H.z0), y: wallTop + 0.24, z: H.z0 }, 0.07));
    }
    // The mouth: across the funnel from net B to the wall, with a bar screen that passes every target
    // bell and keeps turtles and big fish out, and a lip below the hopper floor.
    const bars = Math.round((MOUTH.x1 - MOUTH.x0) / (SITE.collector.barGap + 0.1));
    const barGeo = new THREE.CylinderGeometry(0.05, 0.05, wallTop - H.floor, 8);
    const barMesh = new THREE.InstancedMesh(barGeo, steel, bars);
    for (let i = 0; i < bars; i++) {
      const x = MOUTH.x0 + ((i + 0.5) * (MOUTH.x1 - MOUTH.x0)) / bars;
      barMesh.setMatrixAt(i, this.m.makeTranslation(x, (wallTop + H.floor) / 2, MOUTH.z));
    }
    g.add(barMesh);
    g.add(block(steel, MOUTH.x0, MOUTH.x1, wallTop, wallTop + 0.16, MOUTH.z - 0.11, MOUTH.z + 0.11));
    g.add(block(accent, MOUTH.x0, MOUTH.x1, wallTop + 0.16, wallTop + 0.24, MOUTH.z - 0.06, MOUTH.z + 0.06));
    g.add(block(concrete, MOUTH.x0, MOUTH.x1, bed, H.floor, MOUTH.z - 0.2, MOUTH.z + 0.2));

    // Funnel sensor: an imaging sonar on a post against the wall just up the funnel, looking into the mouth.
    const s0 = { z: MOUTH.z + 5 };
    const head = new THREE.Vector3(hw - 0.8, -2.2, s0.z);
    g.add(block(steel, hw - 1.0, hw - 0.6, -2, 1.8, s0.z - 0.2, s0.z + 0.2));
    g.add(box(yellow, 0.7, 0.55, 0.7, head.x, head.y, head.z));
    g.add(box(yellow, 0.5, 0.4, 0.4, head.x, 2.0, head.z));
    this.beam = new THREE.MeshBasicMaterial({ color: 0x2dd4bf, toneMapped: false });
    // Status light on the sensor's junction box: green while it sees jellyfish.
    const light = new THREE.Mesh(new THREE.SphereGeometry(0.16, 10, 8), this.beam);
    light.position.set(head.x, 2.35, head.z);
    g.add(light);

    // ---------------------------------------------------------- the elevator, in its own frame
    const lift = new THREE.Group();
    lift.position.set(ELEVATOR.x, 0, ELEVATOR.z);
    lift.rotation.y = ELEVATOR.rotY;
    const r = K.sprocketRadius;
    const half = BK.width / 2 + 0.22;
    // Side frames: a rail under each strand on both sides, braced across.
    for (const side of [-1, 1]) {
      const z = side * half;
      for (const strand of [1, -1]) {
        const off = strand * (r + 0.05);
        const a = { x: TAIL_L.x + NORMAL_L.x * off, y: TAIL_L.y + NORMAL_L.y * off, z };
        const b = { x: HEAD_L.x + NORMAL_L.x * off, y: HEAD_L.y + NORMAL_L.y * off, z };
        lift.add(beam(frame, a, b, 0.16));
      }
      // A teal edge strip along the top rail on each side.
      const ta = { x: TAIL_L.x + NORMAL_L.x * (r + 0.16), y: TAIL_L.y + NORMAL_L.y * (r + 0.16), z: z + side * 0.06 };
      const tb = { x: HEAD_L.x + NORMAL_L.x * (r + 0.16), y: HEAD_L.y + NORMAL_L.y * (r + 0.16), z: z + side * 0.06 };
      lift.add(beam(accent, ta, tb, 0.06));
      for (let s = 0; s <= K.length; s += 2.1) {
        const a = { x: TAIL_L.x + UP_L.x * s + NORMAL_L.x * (r + 0.05), y: TAIL_L.y + UP_L.y * s + NORMAL_L.y * (r + 0.05), z };
        const b = { x: TAIL_L.x + UP_L.x * s - NORMAL_L.x * (r + 0.05), y: TAIL_L.y + UP_L.y * s - NORMAL_L.y * (r + 0.05), z };
        lift.add(beam(frame, a, b, 0.1));
      }
    }
    // Cross ties over the top, every few metres, clear of the buckets.
    for (let s = 1; s <= K.length - 1; s += 4.2) {
      const c = { x: TAIL_L.x + UP_L.x * s + NORMAL_L.x * (r + 0.4), y: TAIL_L.y + UP_L.y * s + NORMAL_L.y * (r + 0.4) };
      lift.add(beam(frame, { x: c.x, y: c.y, z: -half }, { x: c.x, y: c.y, z: half }, 0.09));
    }
    // Chains: a loop on each side.
    const loopPts: THREE.Vector3[] = [];
    for (let i = 0; i < 160; i++) {
      pivotLocalAt((i / 160) * LOOP, this.p);
      loopPts.push(new THREE.Vector3(this.p.x, this.p.y, 0));
    }
    const chainCurve = new THREE.CatmullRomCurve3(loopPts, true);
    const chainGeo = new THREE.TubeGeometry(chainCurve, 240, 0.045, 6, true);
    const chainMat = mediumMaterial({ color: 0x2a3237, roughness: 0.5, metalness: 0.7 });
    for (const side of [-1, 1]) {
      const c = new THREE.Mesh(chainGeo, chainMat);
      c.position.z = side * (BK.width / 2 + 0.08);
      lift.add(c);
    }
    // Sprockets at the tail (in the hopper) and the head (past the end of net B).
    const sprocketGeo = new THREE.CylinderGeometry(r, r, BK.width + 0.35, 20).rotateX(Math.PI / 2);
    for (const c of [TAIL_L, HEAD_L]) {
      const s = new THREE.Mesh(sprocketGeo, steel);
      s.position.set(c.x, c.y, c.z);
      lift.add(s);
      this.sprockets.push(s);
    }
    // Head: a small platform with twin drives on the head shaft, duty and standby, each with a lamp.
    lift.add(block(steel, HEAD_L.x - 1.6, HEAD_L.x + 1.2, HEAD_L.y - 0.75, HEAD_L.y - 0.62, -half - 1.4, half + 1.4));
    for (const side of [-1, 1]) {
      const z = side * (half + 0.75);
      lift.add(box(drive, 1.0, 0.9, 1.2, HEAD_L.x, HEAD_L.y, z));
      const motor = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.34, 1.1, 18), drive);
      motor.rotation.x = Math.PI / 2;
      motor.position.set(HEAD_L.x - 0.2, HEAD_L.y + 0.75, z + side * 0.2);
      lift.add(motor);
      const lamp = new THREE.MeshBasicMaterial({ color: STATUS.STANDBY, toneMapped: false });
      const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.2, 12, 10), lamp);
      bulb.position.set(HEAD_L.x, HEAD_L.y + 0.75, z);
      lift.add(bulb);
      this.lamps.push(lamp);
    }
    // Hood over the head, open on the chute side.
    lift.add(block(frame, HEAD_L.x - 1.1, HEAD_L.x + 0.9, HEAD_L.y + 1.1, HEAD_L.y + 1.2, -half, half));
    lift.add(block(accent, HEAD_L.x - 1.1, HEAD_L.x + 0.9, HEAD_L.y + 1.2, HEAD_L.y + 1.27, -half, half));

    // Buckets, and the water in each full one.
    this.buckets = new THREE.InstancedMesh(bucketGeometry(), bucketMat, BUCKETS);
    this.buckets.castShadow = true;
    this.buckets.frustumCulled = false;
    lift.add(this.buckets);
    const sideMat = new THREE.MeshStandardMaterial({ color: 0xdfeef3, roughness: 0.1, metalness: 0.2, transparent: true, opacity: 0.22, depthWrite: false, side: THREE.FrontSide });
    this.ghosts = new THREE.InstancedMesh(bucketGeometry(), new THREE.MeshStandardMaterial({ color: 0xd8dee0, roughness: 0.4, metalness: 0.5, transparent: true, opacity: 0.22, depthWrite: false }), BUCKETS * GHOSTS);
    this.ghosts.frustumCulled = false;
    this.ghosts.count = 0;
    lift.add(this.ghosts);
    this.bucketSides = new THREE.InstancedMesh(bucketSidesGeometry(), sideMat, BUCKETS);
    this.bucketSides.frustumCulled = false;
    this.bucketSides.renderOrder = 9;
    lift.add(this.bucketSides);
    const fill = BUCKET_FILL;
    this.bucketWater = new THREE.InstancedMesh(new THREE.BoxGeometry(BK.length - 0.08, fill, BK.width - 0.08).translate(0, -BK.depth / 2 + fill / 2 + 0.02, 0), this.waterMat, BUCKETS);
    this.bucketWater.frustumCulled = false;
    this.bucketWater.renderOrder = 4;
    lift.add(this.bucketWater);
    lift.traverse((o) => {
      if ((o as THREE.Mesh).isMesh && o !== this.ghosts && o !== this.bucketSides && o !== this.bucketWater) o.castShadow = true;
    });
    // A clear enclosure round the whole lift: nothing can fall out of a bucket over the side, and
    // the buckets and the animals in them stay in view. An elliptical glass tunnel along the run,
    // ribbed every few metres, and a glass box over the head.
    {
      const s0 = -0.9;
      const s1 = K.length + 0.9;
      const len = s1 - s0;
      const mid = (s0 + s1) / 2;
      const tunnel = new THREE.Group();
      tunnel.position.set(TAIL_L.x + UP_L.x * mid - NORMAL_L.x * 0.25, TAIL_L.y + UP_L.y * mid - NORMAL_L.y * 0.25, 0);
      tunnel.rotation.z = -(Math.PI / 2 - (K.incline * Math.PI) / 180);
      const tube = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, len, 48, 1, true), glass);
      tube.scale.set(1.4, 1, 1.18);
      tube.renderOrder = 12;
      tunnel.add(tube);
      const ringGeo = new THREE.TorusGeometry(1, 0.035, 6, 48).rotateX(Math.PI / 2);
      for (let y = -len / 2 + 0.2; y <= len / 2; y += 3) {
        const ring = new THREE.Mesh(ringGeo, accent);
        ring.scale.set(1.4, 1, 1.18);
        ring.position.y = y;
        tunnel.add(ring);
      }
      lift.add(tunnel);
      const hood = new THREE.Mesh(new THREE.BoxGeometry(2.7, 2.6, 2.5), glass);
      hood.position.set(HEAD_L.x + 0.15, HEAD_L.y - 0.05, 0);
      hood.renderOrder = 12;
      lift.add(hood);
    }
    g.add(lift);

    // Supports: portal frames under the run, on piles to the hopper floor or the seabed, cross-braced,
    // and a taller one under the head.
    for (const u of [6.5, 10.5, 15.4]) {
      const top = u > 15 ? HEAD_L.y - 0.75 : lowerRailY(u);
      const legs: Vec3[] = [];
      for (const side of [-1, 1]) {
        const w = side * half;
        const p = w3(u, 0, w);
        const foot = p.z < H.z1 && p.z > H.z0 && p.x > netBX(p.z) ? H.floor : -seabedDepth(p.x, p.z);
        const a = { x: p.x, y: foot, z: p.z };
        const b = { x: p.x, y: top, z: p.z };
        g.add(beam(frame, a, b, 0.26));
        legs.push(a, b);
      }
      g.add(beam(frame, { ...legs[1], y: top - 0.2 }, { ...legs[3], y: top - 0.2 }, 0.18));
      const midY = Math.max(legs[0].y, -1.5);
      g.add(beam(steel, { ...legs[0], y: midY }, { ...legs[3], y: top - 0.4 }, 0.1));
      g.add(beam(steel, { ...legs[2], y: midY }, { ...legs[1], y: top - 0.4 }, 0.1));
    }

    // Chute from the head across to the tank: an open trough with water running down it.
    for (let k = 1; k < CHUTE.length; k++) {
      const a = CHUTE[k - 1];
      const b = CHUTE[k];
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const dz = b.z - a.z;
      const hl = Math.hypot(dx, dz);
      const len = Math.hypot(hl, dy);
      const trough = new THREE.Group();
      trough.position.set((a.x + b.x) / 2, (a.y + b.y) / 2 - 0.2, (a.z + b.z) / 2);
      trough.rotation.set(0, Math.atan2(-dz, dx), Math.atan2(dy, hl), 'YZX');
      trough.add(box(steel, len + 0.2, 0.06, 1.2, 0, -0.25, 0));
      trough.add(box(steel, len + 0.2, 0.5, 0.06, 0, 0, 0.6));
      trough.add(box(steel, len + 0.2, 0.5, 0.06, 0, 0, -0.6));
      trough.add(box(accent, len + 0.2, 0.05, 0.08, 0, 0.26, 0.6));
      trough.add(box(accent, len + 0.2, 0.05, 0.08, 0, 0.26, -0.6));
      const w = new THREE.Mesh(new THREE.PlaneGeometry(len + 0.2, 1.1).rotateX(-Math.PI / 2), plainWater);
      w.position.y = -0.12;
      w.renderOrder = 3;
      trough.add(w);
      // The chute runs inside a clear tube too, all the way into the tank.
      const cover = new THREE.Mesh(new THREE.CylinderGeometry(0.78, 0.78, len + 0.6, 32, 1, true).rotateZ(Math.PI / 2), glass);
      cover.position.y = 0.02;
      cover.renderOrder = 12;
      trough.add(cover);
      g.add(trough);
    }

    // ---------------------------------------------------------- on the breakwater
    const D = CREST_DECK;
    g.add(block(deck, D.x0, D.x1, D.top - 0.3, D.top, D.z0, D.z1));
    // Legs under the deck, down onto the rock.
    for (const x of [D.x0 + 0.4, (D.x0 + D.x1) / 2, D.x1 - 0.4]) for (const z of [D.z0 + 0.4, D.z1 - 0.4]) g.add(block(steel, x - 0.15, x + 0.15, -1, D.top - 0.3, z - 0.15, z + 0.15));
    const rail = mediumMaterial({ color: 0xe8b23a, roughness: 0.6 }, false);
    g.add(block(rail, D.x0, D.x1, D.top + 1.05, D.top + 1.12, D.z0, D.z0 + 0.07));
    g.add(block(rail, D.x0, D.x1, D.top + 1.05, D.top + 1.12, D.z1 - 0.07, D.z1));
    g.add(block(rail, D.x1 - 0.07, D.x1, D.top + 1.05, D.top + 1.12, D.z0, D.z1));
    // Struts from the deck up to the head platform.
    for (const side of [-1, 1]) {
      const p = w3(HEAD_L.x - 0.2 + side * 1.1, HEAD_L.y - 0.75, half + 1.3);
      g.add(beam(frame, { x: D.x0 + 1.4, y: D.top, z: p.z }, p, 0.14));
    }
    // Head tank, open on top, with a glowing rim.
    const T = HEAD_TANK;
    const tankTop = ASSUMPTIONS.transfer.headTankLevel + 1.3;
    const tank = new THREE.Mesh(new THREE.CylinderGeometry(T.r, T.r, tankTop - D.top, 40, 1, true), teal);
    tank.position.set(T.x, (tankTop + D.top) / 2, T.z);
    tank.castShadow = true;
    g.add(tank);
    const tankWater = new THREE.Mesh(new THREE.CircleGeometry(T.r - 0.05, 40).rotateX(-Math.PI / 2), plainWater);
    tankWater.position.set(T.x, ASSUMPTIONS.transfer.headTankLevel, T.z);
    tankWater.renderOrder = 3;
    g.add(tankWater);
    const rim = new THREE.Mesh(new THREE.TorusGeometry(T.r, 0.1, 8, 48).rotateX(Math.PI / 2), steel);
    rim.position.set(T.x, tankTop, T.z);
    g.add(rim);
    const glowRim = new THREE.Mesh(new THREE.TorusGeometry(T.r + 0.02, 0.035, 6, 64).rotateX(Math.PI / 2), accent);
    glowRim.position.set(T.x, tankTop + 0.1, T.z);
    g.add(glowRim);
    // A clear dome closes the tank where the chute comes in.
    const dome = new THREE.Mesh(new THREE.SphereGeometry(T.r + 0.08, 40, 16, 0, Math.PI * 2, 0, Math.PI / 2), glass);
    dome.scale.y = 0.55;
    dome.position.set(T.x, tankTop + 0.05, T.z);
    dome.renderOrder = 12;
    g.add(dome);
    // Feed pump: clean water from behind both nets, to carry the animals down the line.
    const fp = { x: T.x + 4.2, z: D.z0 + 1.6 };
    g.add(block(drive, fp.x - 0.8, fp.x + 0.8, D.top, D.top + 1.1, fp.z - 0.6, fp.z + 0.6));
    const feed = [
      new THREE.Vector3(fp.x - 0.8, D.top + 0.5, fp.z),
      new THREE.Vector3(hw + 3, 2.6, fp.z - 1.4),
      new THREE.Vector3(hw - 0.9, 0.4, fp.z - 3),
      new THREE.Vector3(hw - 1.4, -3.5, fp.z - 4),
    ];
    g.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(feed), 30, 0.22, 10), pipe));
    g.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3([new THREE.Vector3(fp.x - 0.4, D.top + 0.6, fp.z + 0.6), new THREE.Vector3(T.x + T.r * 0.7, tankTop - 0.3, T.z - T.r * 0.7)]), 8, 0.18, 10), pipe));
    // Control kiosk.
    g.add(block(mediumMaterial({ color: 0xe6ebea, roughness: 0.7 }, false), D.x1 - 3.4, D.x1 - 0.6, D.top, D.top + 2.6, D.z1 - 4.2, D.z1 - 1.2));
    g.add(block(teal, D.x1 - 3.6, D.x1 - 0.4, D.top + 2.6, D.top + 2.95, D.z1 - 4.4, D.z1 - 1.0));
    g.traverse((o) => (o.userData.pick = 'collector'));
    this.group.add(g);

    // The bloom's path: along the funnel beside net B, in at the mouth, down the hopper to the tail,
    // up over the buckets, off the head and across the chute to the tank.
    {
      const up = 0.32;
      const along = (s: number, off: number): THREE.Vector3 => {
        const q = pointOnNet(L, s);
        return new THREE.Vector3(q.x + L.nx * off, up, q.z + L.nz * off);
      };
      const back = L.length - SITE.collector.mouthBack;
      const lift0 = w3(-1.2, up, -0.2);
      const pts: THREE.Vector3[] = [
        along(back - 46, 3.2),
        along(back - 30, 3.0),
        along(back - 14, 2.8),
        new THREE.Vector3(MOUTH.x + 0.4, up, MOUTH.z + 2.5),
        new THREE.Vector3(lift0.x, lift0.y, lift0.z),
      ];
      // Up the elevator, just above the carrying run.
      for (const s of [2, 6, 10, 14, 18, 20.4]) {
        pivotLocalAt(s, this.p);
        const q = w3(this.p.x, Math.max(up, this.p.y + 0.95), 0);
        pts.push(new THREE.Vector3(q.x, q.y, q.z));
      }
      for (const c of CHUTE) pts.push(new THREE.Vector3(c.x, c.y + 0.35, c.z));
      const curve = new THREE.CatmullRomCurve3(pts, false, 'centripetal', 0.5);
      const geo = ribbonAlong(curve, 1.35, 420);
      this.pathMat.uniforms.uLength.value = curve.getLength();
      const path = new THREE.Mesh(geo, this.pathMat);
      path.renderOrder = 30;
      path.frustumCulled = false;
      path.userData.pick = 'collector';
      this.group.add(path);
    }

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

    this.anchor.set(HEAD.x, HEAD.y + 6, HEAD.z);
    const f = pointOnNet(L, L.length - SITE.collector.mouthBack - 6);
    this.sections.funnel.set(f.x + L.nx * 2.5, 0.6, f.z + L.nz * 2.5);
    this.sections.hopper.set(hw - 2.6, 1.2, (MOUTH.z + TAIL.z) / 2 + 0.5);
    pivotAt(K.length * 0.55, this.p);
    this.sections.screw.set(this.p.x - 1.4, this.p.y + 1.4, this.p.z);
    const hd = w3(HEAD_L.x + 1.2, HEAD_L.y + 1.6, 0);
    this.sections.launder.set(hd.x, hd.y, hd.z);
    this.sections.tank.set(T.x, tankTop + 1.4, T.z);
    this.placeBuckets(0, false, 0);
  }

  /** Matrix of the bucket at chain coordinate `s`, in the elevator's frame: hanging level below its pivot, swung over when tipped. */
  private bucketMatrix(s: number): THREE.Matrix4 {
    pivotLocalAt(s, this.p);
    this.q.setFromAxisAngle(this.zAxis, -tipAt(s));
    this.v.set(0, -HANG, 0).applyQuaternion(this.q);
    this.v.x += this.p.x;
    this.v.y += this.p.y;
    this.v.z = this.p.z;
    return this.m.compose(this.v, this.q, this.sc);
  }

  /**
   * Buckets round the chain loop at `chain` metres of travel. `step` is how far the chain moved since
   * the last frame: when that is a good part of a bucket's spacing (fast time-lapse), faint copies
   * along the way blur the motion instead of letting identical buckets strobe.
   */
  private placeBuckets(chain: number, wet: boolean, step: number): void {
    const off = ((chain % PITCH) + PITCH) % PITCH;
    let w = 0;
    for (let k = 0; k < BUCKETS; k++) {
      const s = off + k * PITCH;
      this.bucketMatrix(s);
      this.buckets.setMatrixAt(k, this.m);
      this.bucketSides.setMatrixAt(k, this.m);
      if (wet && s < TIP_AT - 0.05) this.bucketWater.setMatrixAt(w++, this.m);
    }
    this.buckets.instanceMatrix.needsUpdate = true;
    this.bucketSides.instanceMatrix.needsUpdate = true;
    this.bucketWater.count = w;
    this.bucketWater.instanceMatrix.needsUpdate = true;
    let g = 0;
    const blur = Math.min(Math.abs(step), PITCH * 0.9);
    if (blur > PITCH * 0.15) {
      const dir = Math.sign(step);
      for (let k = 0; k < BUCKETS; k++) {
        for (let j = 1; j <= GHOSTS; j++) this.ghosts.setMatrixAt(g++, this.bucketMatrix(off + k * PITCH - (dir * blur * j) / (GHOSTS + 1)));
      }
    }
    this.ghosts.count = g;
    this.ghosts.instanceMatrix.needsUpdate = true;
  }

  /** `alpha`: how far between the last two simulation steps to draw (as the jellyfish are drawn). */
  update(tr: TransferState, flow: number, time: number, alpha = 1): void {
    this.pulseMat.uniforms.uFlow.value = flow;
    const st = tr.lift;
    this.waterMat.uniforms.uFlow.value = st.speed;
    // The path lights up while the elevator runs, and fades out when it stops.
    this.pathOn += ((st.speed > 0.02 ? 1 : 0) - this.pathOn) * 0.05;
    this.pathMat.uniforms.uOn.value = this.pathOn;
    this.pathMat.visible = this.pathOn > 0.01;
    const chain = (st.prevPhase + (st.phase - st.prevPhase) * alpha) * PITCH;
    const step = chain - this.lastChain;
    this.placeBuckets(chain, st.phase > 0, Math.abs(step) < LOOP / 2 ? step : 0);
    // Sprockets turn with the chain.
    const da = step / K.sprocketRadius;
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
