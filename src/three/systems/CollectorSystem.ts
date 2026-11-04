import * as THREE from 'three';
import { SITE, seabedDepth } from '../../config/site';
import { collectorPoint, pointOnNet, type NetLine } from '../../simulation/geometry';
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

function box(mat: THREE.Material, w: number, h: number, d: number, x: number, y: number, z: number): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z);
  m.castShadow = true;
  m.receiveShadow = true;
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

/** A helical flight of `turns` around a shaft along +y, length `len`: the moving part of a screw lift. */
function flightGeometry(len: number, rIn: number, rOut: number, turns: number, starts: number): THREE.BufferGeometry {
  const N = Math.round(turns * 28);
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
 * The collector: a funnel of net at the east wall where each net ends, a wet well, two inclined
 * screw lifts (duty and standby) to a head tank, and the release line over the breakwater and along
 * the seabed. A screw has no impeller: an animal rides up in a pocket of water. Pulses in the pipe
 * show biomass moving.
 */
export class CollectorSystem {
  readonly group = new THREE.Group();
  /** Where labels and cameras look. */
  readonly anchor = new THREE.Vector3();
  private readonly pulseMat: THREE.ShaderMaterial;
  private readonly lampPrimary: THREE.MeshBasicMaterial;
  private readonly lampStandby: THREE.MeshBasicMaterial;
  private readonly tank: THREE.Mesh;
  private readonly screws: THREE.Group[] = [];
  private lastTime = 0;

  constructor(nets: readonly NetLine[]) {
    this.group.name = 'collector';
    const steel = mediumMaterial({ color: 0x4a5a63, roughness: 0.55, metalness: 0.55 });
    const deck = mediumMaterial({ color: 0xb9c1c2, roughness: 0.8, metalness: 0.1 }, false);
    const roof = mediumMaterial({ color: 0x18a999, roughness: 0.5, metalness: 0.2, emissive: 0x06302c, emissiveIntensity: 0.6 }, false);
    const wall = mediumMaterial({ color: 0xdfe5e4, roughness: 0.7 }, false);
    const yellow = mediumMaterial({ color: 0xe8b23a, roughness: 0.5, metalness: 0.2 }, false);
    const pipe = mediumMaterial({ color: 0x23323a, roughness: 0.5, metalness: 0.25 });
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

    const K = SITE.collector;
    const deckY = K.deckY;
    const zLow = 60;
    const zHigh = 80;
    const yLow = -1.8;
    const yHigh = 7.1;
    const xs = [65, 71];
    const rOut = 1.6;
    const platform = new THREE.Group();
    // Deck on piles against the east wall, open over the two screws.
    platform.add(box(deck, 22, 0.5, 12, 69, deckY, 86));
    platform.add(box(deck, 2.4, 0.5, 20, 61.8, deckY, 70));
    platform.add(box(deck, 1.6, 0.5, 20, 68, deckY, 70));
    platform.add(box(deck, 7, 0.5, 20, 76.5, deckY, 70));
    for (const x of [59.4, 68, 79]) {
      for (const z of [61, 71, 81, 91]) {
        const pile = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, deckY + 11, 12), steel);
        pile.position.set(x, (deckY - 11) / 2, z);
        pile.castShadow = true;
        platform.add(pile);
      }
    }
    // Wet well the screws lift from.
    const concrete = mediumMaterial({ color: 0x9aa39f, roughness: 0.9 }, false);
    platform.add(box(concrete, 11.4, 2.6, 0.6, 68, -0.2, 56.8));
    platform.add(box(concrete, 0.6, 2.6, 6, 62.6, -0.2, 59.6));
    platform.add(box(concrete, 0.6, 2.6, 6, 73.4, -0.2, 59.6));
    // Motor house at the top of the screws.
    platform.add(box(wall, 18, 4.6, 7, 68, deckY + 2.55, 84));
    platform.add(box(roof, 19, 0.6, 8, 68, deckY + 5.1, 84));
    this.lampPrimary = new THREE.MeshBasicMaterial({ color: STATUS.STANDBY, toneMapped: false });
    this.lampStandby = new THREE.MeshBasicMaterial({ color: STATUS.STANDBY, toneMapped: false });
    const lamp = (m: THREE.Material, x: number) => {
      const l = new THREE.Mesh(new THREE.SphereGeometry(0.42, 12, 10), m);
      l.position.set(x, deckY + 5.9, 84);
      platform.add(l);
    };
    lamp(this.lampPrimary, xs[0]);
    lamp(this.lampStandby, xs[1]);
    // Screw lifts: an open steel trough, a shaft and a three-start flight turning inside it.
    const len = Math.hypot(zHigh - zLow, yHigh - yLow);
    const tilt = Math.atan2(zHigh - zLow, yHigh - yLow);
    const trough = mediumMaterial({ color: 0x5b6b73, roughness: 0.6, metalness: 0.5, side: THREE.DoubleSide });
    const flight = mediumMaterial({ color: 0xe8b23a, roughness: 0.45, metalness: 0.45, side: THREE.DoubleSide });
    const flightGeo = flightGeometry(len, 0.62, rOut, 8.5, 3);
    const shaftGeo = new THREE.CylinderGeometry(0.62, 0.62, len, 18).translate(0, len / 2, 0);
    // Open on top: the tube covers the lower 3/5 of a turn.
    const troughGeo = new THREE.CylinderGeometry(rOut + 0.1, rOut + 0.1, len + 0.6, 32, 1, true, -Math.PI * 0.6, Math.PI * 1.2).translate(0, len / 2, 0);
    xs.forEach((x, i) => {
      const lift = new THREE.Group();
      lift.position.set(x, yLow, zLow);
      lift.rotation.x = tilt;
      lift.add(new THREE.Mesh(troughGeo, trough));
      const spin = new THREE.Group();
      spin.add(new THREE.Mesh(shaftGeo, steel));
      spin.add(new THREE.Mesh(flightGeo, flight));
      spin.traverse((o) => (o.castShadow = true));
      lift.add(spin);
      this.screws[i] = spin;
      platform.add(lift);
      // Trestle under the middle of the trough.
      const t = 0.42;
      const y = yLow + (yHigh - yLow) * t;
      platform.add(box(steel, 3.6, 0.3, 0.5, x, y - rOut - 0.35, zLow + (zHigh - zLow) * t));
      platform.add(box(steel, 0.3, y - rOut + 5, 0.3, x - 1.6, (y - rOut - 5) / 2, zLow + (zHigh - zLow) * t));
      platform.add(box(steel, 0.3, y - rOut + 5, 0.3, x + 1.6, (y - rOut - 5) / 2, zLow + (zHigh - zLow) * t));
    });
    // Head tank: gives the line the head to run itself down to the outlet.
    this.tank = new THREE.Mesh(new THREE.CylinderGeometry(3, 3, 7, 28), roof);
    this.tank.position.set(76.6, deckY + 3.7, 88.4);
    this.tank.castShadow = true;
    platform.add(this.tank);
    // Service crane, for swapping panels from the platform.
    platform.add(box(yellow, 0.7, 11, 0.7, 59.6, deckY + 5.6, 90));
    platform.add(box(yellow, 22, 0.6, 0.6, 52, deckY + 11, 90));
    // Railings.
    const rail = mediumMaterial({ color: 0xe8b23a, roughness: 0.6 }, false);
    platform.add(box(rail, 22, 0.08, 0.08, 69, deckY + 1.2, 92));
    platform.add(box(rail, 0.08, 0.08, 32, 60.6, deckY + 1.2, 76));
    platform.traverse((o) => (o.userData.pick = 'collector'));
    this.group.add(platform);

    // Funnels at each net's end, and a low flume to the wet well.
    const wing = mediumMaterial({ color: 0xc7b78e, roughness: 0.8, side: THREE.DoubleSide, transparent: true, opacity: 0.5 });
    for (const L of nets) {
      const c = collectorPoint(L);
      const m = pointOnNet(L, L.pocketS);
      const wx = m.x + L.nx * K.mouthHalfWidth;
      const wz = m.z + L.nz * K.mouthHalfWidth;
      // Outer funnel wing, from the mouth to the suction.
      const len2 = Math.hypot(c.x - wx, c.z - wz);
      const w = new THREE.Mesh(new THREE.PlaneGeometry(len2, SITE.channel.depth + 0.8), wing);
      w.position.set((c.x + wx) / 2, (0.8 - SITE.channel.depth) / 2, (c.z + wz) / 2);
      w.rotation.y = -Math.atan2(c.z - wz, c.x - wx);
      w.userData.pick = 'collector';
      this.group.add(w);
      // Bar rack across the funnel mouth: jellyfish pass, turtles and large debris do not.
      const bars = Math.round(K.mouthHalfWidth / K.rackGap);
      const rack = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.05, 0.05, SITE.channel.depth + 1.4, 6), steel, bars);
      const barAt = new THREE.Matrix4();
      for (let i = 0; i < bars; i++) {
        const s = (K.mouthHalfWidth * (i + 0.5)) / bars;
        barAt.setPosition(m.x + L.nx * s, (1.4 - SITE.channel.depth) / 2, m.z + L.nz * s);
        rack.setMatrixAt(i, barAt);
      }
      rack.userData.pick = 'collector';
      this.group.add(rack);
      // Suction frame.
      const frame = new THREE.Mesh(new THREE.CylinderGeometry(1.5, 1.5, SITE.channel.depth + 5, 16), steel);
      frame.position.set(c.x, (4.6 - SITE.channel.depth) / 2, c.z);
      frame.castShadow = true;
      frame.userData.pick = 'collector';
      this.group.add(frame);
      // Flume to the wet well.
      const via = L.index === 0 ? [new THREE.Vector3(c.x - 5, 0.9, c.z - 3), new THREE.Vector3(61.6, 0.9, 78), new THREE.Vector3(61.6, 0.9, 66)] : [new THREE.Vector3(c.x + 0.5, 0.9, c.z + 8), new THREE.Vector3(69, 0.9, 50)];
      const flume = pipeAlong([new THREE.Vector3(c.x, 1.6, c.z), ...via, new THREE.Vector3(66, 0.9, 58)], 0.5, pipe, this.pulseMat, 40);
      flume.traverse((o) => (o.userData.pick = 'collector'));
      this.group.add(flume);
    }

    // Release line: over the breakwater, down the far side, along the seabed to the outlet.
    const route = SITE.pipeRoute;
    const pts: THREE.Vector3[] = [new THREE.Vector3(76.6, 7.8, 88.4)];
    for (let i = 0; i < route.length; i++) {
      const [x, z] = route[i];
      const onMound = x < 120;
      pts.push(new THREE.Vector3(x, onMound ? 5.4 : -seabedDepth(x, z) + 0.4, z));
    }
    const line = pipeAlong(pts, 0.55, pipe, this.pulseMat, 220);
    line.traverse((o) => (o.userData.pick = 'release'));
    this.group.add(line);

    this.anchor.set(68, deckY + 8, 82);
  }

  update(primary: ModuleStatus, standby: ModuleStatus, flow: number, time: number): void {
    this.lampPrimary.color.setHex(STATUS[primary]);
    this.lampStandby.color.setHex(STATUS[standby]);
    if (primary === 'FAULT' && Math.sin(time * 6) < 0) this.lampPrimary.color.setHex(0x3a1414);
    this.pulseMat.uniforms.uFlow.value = flow;
    const dt = Math.min(0.1, Math.max(0, time - this.lastTime));
    this.lastTime = time;
    // A screw this size turns slowly; drawn at about 30 rpm.
    if (primary === 'ONLINE') this.screws[0].rotation.y -= dt * 3.1;
    if (standby === 'ONLINE') this.screws[1].rotation.y -= dt * 3.1;
  }
}
