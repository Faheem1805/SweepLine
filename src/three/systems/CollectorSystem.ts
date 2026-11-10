import * as THREE from 'three';
import { ASSUMPTIONS } from '../../config/assumptions';
import { SITE, seabedDepth } from '../../config/site';
import { pointOnNet, type NetLine } from '../../simulation/geometry';
import { axisPoint, HEAD_TANK, LAUNDER_Y, LIFT_DECK, POCKET_SPACING, SCREW_LENGTH, SCREW_TAIL, STATIONS, type Screw, type Station } from '../../simulation/lift';
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

const LIFT = ASSUMPTIONS.lift;
const R = LIFT.diameter / 2;

function box(mat: THREE.Material, w: number, h: number, d: number, x: number, y: number, z: number): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

/** A box between two plan corners and two heights. */
function block(mat: THREE.Material, x0: number, x1: number, y0: number, y1: number, z0: number, z1: number): THREE.Mesh {
  return box(mat, Math.abs(x1 - x0), Math.abs(y1 - y0), Math.abs(z1 - z0), (x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
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

/** Helical flights of `turns` around a shaft along +y, length `len`: the moving part of a screw. Point angle th sits at (cos th, sin th) in x, z. */
function flightGeometry(len: number, rIn: number, rOut: number, turns: number, starts: number): THREE.BufferGeometry {
  const N = Math.round(turns * 32);
  const pos: number[] = [];
  const idx: number[] = [];
  for (let k = 0; k < starts; k++) {
    const base = pos.length / 3;
    for (let i = 0; i <= N; i++) {
      const t = i / N;
      const th = Math.PI * 2 * (turns * t + k / starts);
      const c = Math.cos(th);
      const n = Math.sin(th);
      pos.push(rIn * c, t * len, rIn * n, rOut * c, t * len, rOut * n);
    }
    for (let i = 0; i < N; i++) {
      const j = base + i * 2;
      idx.push(j, j + 1, j + 2, j + 1, j + 3, j + 2);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/**
 * The water in one pocket: the lower part of the tube's bore between two flights, sitting toward
 * local +z, `depth` long along local +y and centred on y = 0.
 */
function pocketGeometry(r: number, half: number, depth: number): THREE.BufferGeometry {
  const s = new THREE.Shape();
  const a0 = -Math.PI / 2 - half;
  s.moveTo(r * Math.cos(a0), r * Math.sin(a0));
  s.absarc(0, 0, r, a0, -Math.PI / 2 + half, false);
  s.closePath();
  const g = new THREE.ExtrudeGeometry(s, { depth, bevelEnabled: false, curveSegments: 18 });
  g.rotateX(-Math.PI / 2);
  g.translate(0, -depth / 2, 0);
  return g;
}

interface ScrewView {
  station: number;
  screw: number;
  spin: THREE.Group;
  pockets: THREE.InstancedMesh;
  /** Pocket instances allocated. */
  capacity: number;
  /** Angle of the tube floor in the frame (flight convention: (cos, sin) in x, z), and the same in Three's cylinder convention. */
  floorTh: number;
  lamp: THREE.MeshBasicMaterial;
}

/**
 * The collector at each net's end: the funnel between the net and the east wall, a funnel sensor, a
 * hopper, and two inclined enclosed screws (duty and standby) rising along the wall to a deck between
 * the nets, where they spill into launders to the head tank. The release line runs from the tank
 * over the breakwater and along the seabed to the outlet. The screws are drawn cut away so the
 * flights, the water in each pocket and the jellyfish riding in it can be seen; the pockets and the
 * flights move with the simulation, so a drawn animal is in the pocket the model has it in.
 */
export class CollectorSystem {
  readonly group = new THREE.Group();
  /** Where labels and cameras look. */
  readonly anchor = new THREE.Vector3();
  /** Label anchors for net A's lift, section by section. */
  readonly sections = {
    funnel: new THREE.Vector3(),
    hopper: new THREE.Vector3(),
    screw: new THREE.Vector3(),
    launder: new THREE.Vector3(),
    tank: new THREE.Vector3(),
  };
  private readonly pulseMat: THREE.ShaderMaterial;
  private readonly screws: ScrewView[] = [];
  private readonly beams: THREE.MeshBasicMaterial[] = [];
  private readonly launderWater: THREE.ShaderMaterial;
  private readonly m = new THREE.Matrix4();
  private readonly q = new THREE.Quaternion();
  private readonly v = new THREE.Vector3();
  private readonly one = new THREE.Vector3(1, 1, 1);
  private readonly up = new THREE.Vector3(0, 1, 0);

  constructor(nets: readonly NetLine[]) {
    this.group.name = 'collector';
    const steel = mediumMaterial({ color: 0x4a5a63, roughness: 0.55, metalness: 0.55 });
    const deck = mediumMaterial({ color: 0xb9c1c2, roughness: 0.8, metalness: 0.1 }, false);
    const roof = mediumMaterial({ color: 0x18a999, roughness: 0.5, metalness: 0.2, emissive: 0x06302c, emissiveIntensity: 0.6 }, false);
    const yellow = mediumMaterial({ color: 0xe8b23a, roughness: 0.5, metalness: 0.2 }, false);
    const pipe = mediumMaterial({ color: 0x23323a, roughness: 0.5, metalness: 0.25 });
    const concrete = mediumMaterial({ color: 0x9aa39f, roughness: 0.9 });
    const tubeMat = mediumMaterial({ color: 0x9fb0b8, roughness: 0.42, metalness: 0.6, side: THREE.DoubleSide });
    const bandMat = mediumMaterial({ color: 0xc8372d, roughness: 0.5, metalness: 0.3, side: THREE.DoubleSide });
    const flightMat = mediumMaterial({ color: 0xe8b23a, roughness: 0.45, metalness: 0.45, side: THREE.DoubleSide });
    const driveMat = mediumMaterial({ color: 0x1f6f8b, roughness: 0.45, metalness: 0.4 }, false);
    const glass = new THREE.MeshStandardMaterial({ color: 0xcfe8f0, roughness: 0.05, metalness: 0.1, transparent: true, opacity: 0.1, depthWrite: false, side: THREE.DoubleSide });
    const pocketMat = new THREE.MeshStandardMaterial({ color: 0x2aa7c9, roughness: 0.15, metalness: 0.05, transparent: true, opacity: 0.5, depthWrite: false, emissive: 0x0b3c4c, emissiveIntensity: 0.5 });
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
    // Water running along the launders: ripples that move while a lift is spilling into them.
    this.launderWater = new THREE.ShaderMaterial({
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
          float w = 0.5 + 0.5 * sin(vUv.x * 4.0 - uTime * 5.0 * uFlow + sin(vUv.y * 9.0) * 0.6);
          vec3 c = mix(vec3(0.10, 0.45, 0.58), vec3(0.45, 0.82, 0.9), w * (0.25 + 0.5 * uFlow));
          gl_FragColor = vec4(c, 0.78);
        }
      `,
      transparent: true,
      depthWrite: false,
    });

    const platform = new THREE.Group();
    const D = LIFT_DECK;
    // Deck between the nets, on piles, that both lifts rise to.
    platform.add(block(deck, D.x0, D.x1, D.top - 0.5, D.top, D.z0, D.z1));
    for (const x of [D.x0 + 0.6, 71.2, D.x1 - 0.6]) {
      for (const z of [D.z0 + 0.8, 57, 66, D.z1 - 0.8]) {
        const pile = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.45, D.top + 12, 12), steel);
        pile.position.set(x, (D.top - 12) / 2, z);
        pile.castShadow = true;
        platform.add(pile);
      }
    }
    // Railings.
    const rail = mediumMaterial({ color: 0xe8b23a, roughness: 0.6 }, false);
    platform.add(block(rail, D.x0, D.x0 + 0.08, D.top + 1.1, D.top + 1.18, D.z0 + 4, D.z1 - 4));
    platform.add(block(rail, D.x1 - 0.08, D.x1, D.top + 1.1, D.top + 1.18, D.z0, D.z1));
    // Service crane for swapping panels and lifting a screw's drive.
    platform.add(box(yellow, 0.7, 11, 0.7, D.x0 + 1.2, D.top + 5.5, 61.5));
    platform.add(box(yellow, 22, 0.6, 0.6, D.x0 - 9.5, D.top + 11, 61.5));
    // Control kiosk.
    platform.add(block(mediumMaterial({ color: 0xdfe5e4, roughness: 0.7 }, false), 76.2, 79.2, D.top, D.top + 2.8, 68.4, 72.6));
    platform.add(block(roof, 76, 79.4, D.top + 2.8, D.top + 3.2, 68.2, 72.8));

    // Head tank: open on top so the water can be seen, at the level that drives the line.
    const T = HEAD_TANK;
    const tankWall = new THREE.Mesh(new THREE.CylinderGeometry(T.r, T.r, 8.4 - D.top, 32, 1, true), mediumMaterial({ color: 0x18a999, roughness: 0.5, metalness: 0.2, emissive: 0x06302c, emissiveIntensity: 0.6, side: THREE.DoubleSide }, false));
    tankWall.position.set(T.x, (8.4 + D.top) / 2, T.z);
    tankWall.castShadow = true;
    platform.add(tankWall);
    const tankWater = new THREE.Mesh(new THREE.CircleGeometry(T.r - 0.05, 32).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x1d7d98, roughness: 0.08, metalness: 0.1, emissive: 0x0b3c4c, emissiveIntensity: 0.6 }));
    tankWater.position.set(T.x, ASSUMPTIONS.transfer.headTankLevel, T.z);
    tankWater.renderOrder = 3;
    platform.add(tankWater);
    const rim = new THREE.Mesh(new THREE.TorusGeometry(T.r, 0.12, 8, 40).rotateX(Math.PI / 2), steel);
    rim.position.set(T.x, 8.4, T.z);
    platform.add(rim);
    platform.traverse((o) => (o.userData.pick = 'collector'));
    this.group.add(platform);

    for (const st of STATIONS) this.buildStation(st, nets[st.net], { steel, concrete, tubeMat, bandMat, flightMat, driveMat, glass, pocketMat, yellow });

    // Release line: out of the tank, along the deck edge, over the breakwater and along the seabed.
    const route = SITE.pipeRoute;
    const pts: THREE.Vector3[] = [new THREE.Vector3(T.x + T.r - 0.2, 5.6, T.z), new THREE.Vector3(80.6, 5.4, T.z + 4), new THREE.Vector3(81.2, 5.4, 78)];
    for (let i = 0; i < route.length; i++) {
      const [x, z] = route[i];
      const onMound = x < 120;
      pts.push(new THREE.Vector3(x, onMound ? 5.4 : -seabedDepth(x, z) + 0.4, z));
    }
    const line = pipeAlong(pts, 0.55, pipe, this.pulseMat, 240);
    line.traverse((o) => (o.userData.pick = 'release'));
    this.group.add(line);

    this.anchor.set(70, D.top + 9, 62);
    const A = STATIONS[0];
    const sa = A.screws[0];
    const L = nets[0];
    const f = pointOnNet(L, L.length - 9);
    this.sections.funnel.set(f.x + 1.5, 0.6, f.z);
    this.sections.hopper.set((A.hopper.x0 + A.hopper.x1) / 2, 1, (A.hopper.z0 + A.hopper.z1) / 2);
    axisPoint(sa, SCREW_LENGTH * 0.55, this.v);
    this.sections.screw.set(this.v.x - 0.4, this.v.y + R + 0.4, this.v.z);
    const ld = sa.launder;
    this.sections.launder.set((ld[0].x + ld[1].x) / 2, LAUNDER_Y + 0.4, ld[0].z);
    this.sections.tank.set(T.x, 8.6, T.z);
  }

  private buildStation(
    st: Station,
    L: NetLine,
    mats: Record<'steel' | 'concrete' | 'tubeMat' | 'bandMat' | 'flightMat' | 'driveMat' | 'glass' | 'pocketMat' | 'yellow', THREE.Material>,
  ): void {
    const g = new THREE.Group();
    const H = st.hopper;
    const wallTop = 0.8;
    // Sheet-pile face along the wall, from the hopper to the funnel mouth: the funnel's outer side.
    const fz0 = H.z0 - 2;
    const fz1 = L.bz + SITE.collector.pocketLength * Math.abs(L.tz) + 3;
    g.add(block(mats.concrete, SITE.channel.halfWidth, SITE.channel.halfWidth + 0.6, -SITE.channel.depth - 1.5, wallTop + 0.4, fz0, fz1));
    // Hopper: an open box against the wall with its mouth toward the funnel.
    const t = 0.35;
    g.add(block(mats.concrete, H.x0, H.x1, H.floor - 0.4, H.floor, H.z0, H.z1));
    g.add(block(mats.concrete, H.x0, H.x0 + t, H.floor, wallTop, H.z0, H.z1));
    g.add(block(mats.concrete, H.x0, H.x1, H.floor, wallTop, H.z0, H.z0 + t));
    // Mouth: the north face is open where the funnel arrives, against the wall.
    g.add(block(mats.concrete, H.x0, 66.2, H.floor, wallTop, H.z1 - t, H.z1));
    g.add(block(mats.concrete, 66.2, H.x1, -0.6, wallTop, H.z1 - t, H.z1));
    // Walkway round the hopper.
    g.add(block(mats.steel, H.x0 - 0.2, H.x1, wallTop, wallTop + 0.12, H.z0 - 0.8, H.z0));

    // Funnel sensor: an imaging sonar on a post at the funnel mouth, looking down the funnel into the hopper.
    const s0 = pointOnNet(L, L.length - SITE.collector.pocketLength + 1);
    const head = new THREE.Vector3(69.2, -2.2, s0.z);
    const aim = new THREE.Vector3(st.mouth.x - 0.6, -4.2, st.mouth.z);
    const post = block(mats.steel, 69.05, 69.45, -2, 1.8, s0.z - 0.2, s0.z + 0.2);
    g.add(post);
    g.add(box(mats.yellow, 0.7, 0.55, 0.7, head.x, head.y, head.z));
    g.add(box(mats.yellow, 0.5, 0.4, 0.4, head.x, 2.0, head.z));
    const beamLen = head.distanceTo(aim);
    const beamMat = new THREE.MeshBasicMaterial({ color: 0x2dd4bf, transparent: true, opacity: 0.06, depthWrite: false, side: THREE.DoubleSide });
    const beam = new THREE.Mesh(new THREE.ConeGeometry(Math.tan(0.13) * beamLen, beamLen, 24, 1, true), beamMat);
    beam.position.copy(head).lerp(aim, 0.5);
    beam.quaternion.setFromUnitVectors(this.up, this.v.copy(head).sub(aim).normalize());
    beam.renderOrder = 8;
    g.add(beam);
    this.beams.push(beamMat);

    // Supports: a cross beam under both screws and legs to the seabed, twice along the incline.
    const sc0 = st.screws[0];
    for (const a of [6.5, 13.5]) {
      const p = axisPoint(sc0, a, { x: 0, y: 0, z: 0 });
      const yb = p.y - R / Math.cos((LIFT.incline * Math.PI) / 180) - 0.35;
      g.add(block(mats.steel, H.x0 + 0.2, H.x1 - 0.2, yb - 0.45, yb, p.z - 0.35, p.z + 0.35));
      for (const x of [H.x0 + 0.5, (sc0.inlet.x + st.screws[1].inlet.x) / 2, H.x1 - 0.5]) {
        const bed = -seabedDepth(x, p.z);
        g.add(block(mats.steel, x - 0.22, x + 0.22, Math.min(bed, -SITE.channel.depth), yb - 0.45, p.z - 0.22, p.z + 0.22));
      }
    }

    st.screws.forEach((sc, k) => this.buildScrew(st, sc, k, g, mats));

    // Launder from each screw's spout to the head tank, on short stands.
    const ld = st.screws.map((s) => s.launder);
    const pts = [ld[0][0], ld[0][1], ld[0][2]];
    const floor = LAUNDER_Y - 0.6;
    for (let k = 1; k < pts.length; k++) {
      const a = pts[k - 1];
      const b = pts[k];
      const len = Math.hypot(b.x - a.x, b.z - a.z);
      const alongX = Math.abs(b.z - a.z) < 0.01;
      const w = 1.0;
      const seg = new THREE.Group();
      seg.position.set((a.x + b.x) / 2, 0, (a.z + b.z) / 2);
      if (!alongX) seg.rotation.y = Math.PI / 2;
      const ext = len + (k === 1 ? 1.2 : 0.6);
      seg.add(box(mats.steel, ext, 0.12, w + 0.24, 0, floor - 0.06, 0));
      seg.add(box(mats.steel, ext, 0.75, 0.12, 0, floor + 0.3, w / 2 + 0.06));
      seg.add(box(mats.steel, ext, 0.75, 0.12, 0, floor + 0.3, -w / 2 - 0.06));
      const water = new THREE.Mesh(new THREE.PlaneGeometry(ext, w).rotateX(-Math.PI / 2), this.launderWater);
      water.position.y = LAUNDER_Y - 0.02;
      water.renderOrder = 3;
      seg.add(water);
      for (let s = -ext / 2 + 0.6; s < ext / 2; s += 3) seg.add(box(mats.steel, 0.16, floor - LIFT_DECK.top, 0.16, s, (floor + LIFT_DECK.top) / 2, 0));
      g.add(seg);
    }
    g.traverse((o) => (o.userData.pick = 'collector'));
    this.group.add(g);
  }

  private buildScrew(
    st: Station,
    sc: Screw,
    k: number,
    g: THREE.Group,
    mats: Record<'steel' | 'concrete' | 'tubeMat' | 'bandMat' | 'flightMat' | 'driveMat' | 'glass' | 'pocketMat' | 'yellow', THREE.Material>,
  ): void {
    // Frame: origin at the bottom pocket, +y up the axis, +x across.
    const X = new THREE.Vector3(sc.across.x, sc.across.y, sc.across.z);
    const Y = new THREE.Vector3(sc.axis.x, sc.axis.y, sc.axis.z);
    const Z = new THREE.Vector3().crossVectors(X, Y);
    const frame = new THREE.Group();
    frame.position.set(sc.inlet.x, sc.inlet.y, sc.inlet.z);
    frame.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(X, Y, Z));
    g.add(frame);
    // Floor of the tube in the frame, and the cut-away window: toward the channel (−x) and up.
    const down = new THREE.Vector3(sc.down.x, sc.down.y, sc.down.z);
    const dl = new THREE.Vector3(down.dot(X), 0, down.dot(Z));
    const floorTh = Math.atan2(dl.z, dl.x);
    const win = new THREE.Vector3(-1, 0, 0).sub(dl).normalize();
    const winCyl = Math.atan2(win.x, win.z);
    // Half-section: the flights and shaft are cut away on the window side, a little past the axis,
    // so the pockets, the water in them and the animals on the tube floor can be seen.
    const cutDir = X.clone().multiplyScalar(win.x).add(Z.clone().multiplyScalar(win.z)).normalize();
    const cut = new THREE.Plane(cutDir.clone().negate(), cutDir.x * sc.inlet.x + cutDir.y * sc.inlet.y + cutDir.z * sc.inlet.z + 0.08);
    const flightMat = mediumMaterial({ color: 0xe8b23a, roughness: 0.45, metalness: 0.45, side: THREE.DoubleSide });
    flightMat.clippingPlanes = [cut];
    flightMat.clipShadows = true;
    const shaftMat = mediumMaterial({ color: 0x4a5a63, roughness: 0.55, metalness: 0.55 });
    shaftMat.clippingPlanes = [cut];
    const half = (78 * Math.PI) / 180;
    const total = SCREW_LENGTH + SCREW_TAIL + 0.6;
    const yMid = (SCREW_LENGTH - SCREW_TAIL + 0.6) / 2;
    const shell = new THREE.Mesh(new THREE.CylinderGeometry(R + 0.06, R + 0.06, total, 40, 1, true, winCyl + half, Math.PI * 2 - 2 * half), mats.tubeMat);
    shell.position.y = yMid;
    shell.castShadow = true;
    frame.add(shell);
    const pane = new THREE.Mesh(new THREE.CylinderGeometry(R + 0.06, R + 0.06, total, 20, 1, true, winCyl - half, 2 * half), mats.glass);
    pane.position.y = yMid;
    pane.renderOrder = 9;
    frame.add(pane);
    // Edges of the cut, and the running rings the tube turns on (red, as on the drawing).
    for (const e of [winCyl - half, winCyl + half]) {
      const edge = new THREE.Mesh(new THREE.BoxGeometry(0.12, total, 0.12), mats.tubeMat);
      edge.position.set(Math.sin(e) * (R + 0.06), yMid, Math.cos(e) * (R + 0.06));
      frame.add(edge);
    }
    for (let a = 1.2; a < SCREW_LENGTH; a += 4.4) {
      const band = new THREE.Mesh(new THREE.CylinderGeometry(R + 0.16, R + 0.16, 0.42, 40, 1, true), mats.bandMat);
      band.position.y = a;
      frame.add(band);
    }
    // End caps: the lower end in the hopper, and the drive at the top.
    const cap = new THREE.Mesh(new THREE.CircleGeometry(R + 0.06, 32).rotateX(Math.PI / 2), mats.tubeMat);
    cap.position.y = -SCREW_TAIL - 0.3;
    frame.add(cap);
    frame.add(box(mats.driveMat, 1.7, 1.3, 1.7, 0, SCREW_LENGTH + 1.15, 0));
    const motor = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 1.5, 20), mats.driveMat);
    motor.rotation.z = Math.PI / 2;
    motor.position.set(k === 0 ? -1.4 : 1.4, SCREW_LENGTH + 1.15, 0);
    frame.add(motor);
    const lamp = new THREE.MeshBasicMaterial({ color: STATUS.STANDBY, toneMapped: false });
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.28, 12, 10), lamp);
    axisPoint(sc, SCREW_LENGTH + 1.15, this.v);
    bulb.position.set(this.v.x, this.v.y + 1.35, this.v.z);
    g.add(bulb);
    // Top bearing pedestal down to the deck, and the spout into the launder.
    axisPoint(sc, SCREW_LENGTH + 0.4, this.v);
    g.add(block(mats.steel, this.v.x - 0.5, this.v.x + 0.5, LIFT_DECK.top, this.v.y - R, this.v.z - 0.5, this.v.z + 0.5));
    axisPoint(sc, SCREW_LENGTH - 0.2, this.v);
    const sz = sc.launder[0].z;
    g.add(block(mats.steel, sc.inlet.x - 0.62, sc.inlet.x - 0.5, LAUNDER_Y - 0.1, this.v.y - 0.3, Math.min(sz, this.v.z) - 0.2, Math.max(sz, this.v.z) + 0.2));
    g.add(block(mats.steel, sc.inlet.x + 0.5, sc.inlet.x + 0.62, LAUNDER_Y - 0.1, this.v.y - 0.3, Math.min(sz, this.v.z) - 0.2, Math.max(sz, this.v.z) + 0.2));

    // Flights and shaft, turning.
    const spin = new THREE.Group();
    const turns = (SCREW_LENGTH + SCREW_TAIL) / LIFT.pitch;
    const flights = new THREE.Mesh(flightGeometry(SCREW_LENGTH + SCREW_TAIL, 0.3, R - 0.04, turns, LIFT.starts).translate(0, -SCREW_TAIL, 0), flightMat);
    flights.castShadow = true;
    spin.add(flights);
    spin.add(new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, SCREW_LENGTH + SCREW_TAIL + 1.6, 16, 1, false).translate(0, (SCREW_LENGTH - SCREW_TAIL + 1.6) / 2, 0), shaftMat));
    frame.add(spin);

    // Water in each pocket, moving up with the flights.
    const count = Math.ceil((SCREW_LENGTH + SCREW_TAIL) / POCKET_SPACING) + 1;
    const pockets = new THREE.InstancedMesh(pocketGeometry(R - 0.08, (76 * Math.PI) / 180, POCKET_SPACING * 0.78), mats.pocketMat, count);
    pockets.renderOrder = 4;
    pockets.frustumCulled = false;
    frame.add(pockets);
    const view: ScrewView = { station: st.net, screw: k, spin, pockets, capacity: count, floorTh, lamp };
    this.screws.push(view);
    this.placePockets(view, 0, false);
  }

  /** Pockets between the flights at phase `phase` (pockets closed off so far). */
  private placePockets(v: ScrewView, phase: number, wet: boolean): void {
    const sp = POCKET_SPACING;
    const f = phase - Math.floor(phase);
    // Pocket floor angle in the cylinder convention (x = sin, z = cos) used to rotate the geometry, which sits toward +z.
    this.q.setFromAxisAngle(this.up, Math.PI / 2 - v.floorTh);
    let n = 0;
    for (let m = -2; n < v.capacity; m++) {
      const y0 = (f + m) * sp;
      if (y0 + sp < -SCREW_TAIL) continue;
      if (y0 > SCREW_LENGTH - sp * 0.5) break;
      this.v.set(0, y0 + sp * 0.5, 0);
      this.m.compose(this.v, this.q, this.one);
      v.pockets.setMatrixAt(n++, this.m);
    }
    v.pockets.count = wet ? n : 0;
    v.pockets.instanceMatrix.needsUpdate = true;
  }

  update(tr: TransferState, flow: number, time: number): void {
    this.pulseMat.uniforms.uFlow.value = flow;
    let spill = 0;
    for (const v of this.screws) {
      const st = tr.stations[v.station];
      const phase = st.phase[v.screw];
      // Flights cross the floor of the tube where the model's pocket boundaries are (see SCREW_TAIL in lift.ts).
      v.spin.rotation.y = 2 * Math.PI * (phase / LIFT.starts + SCREW_TAIL / LIFT.pitch) - v.floorTh;
      this.placePockets(v, phase, phase > 0);
      const status: ModuleStatus = v.screw === 0 ? (tr.primaryFault ? 'FAULT' : st.speed[0] > 0.02 ? 'ONLINE' : 'STANDBY') : !tr.standbyEnabled ? 'DISABLED' : tr.standbyFault ? 'FAULT' : st.speed[1] > 0.02 ? 'ONLINE' : 'STANDBY';
      v.lamp.color.setHex(STATUS[status]);
      if (status === 'FAULT' && Math.sin(time * 6) < 0) v.lamp.color.setHex(0x3a1414);
      spill = Math.max(spill, st.speed[v.screw]);
    }
    this.launderWater.uniforms.uFlow.value = spill;
    tr.stations.forEach((st, i) => {
      const b = this.beams[i];
      b.color.setHex(st.seen ? 0x4ade80 : 0x2dd4bf);
      b.opacity = st.seen ? 0.11 + 0.04 * Math.sin(time * 5) : 0.05;
    });
  }
}
