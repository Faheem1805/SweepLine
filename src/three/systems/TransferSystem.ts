import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { SEABED_DEPTH_GLSL, SITE, mirrorX, seabedDepth } from '../../config/site';
import { buildThroatGeometry, throatHalfHeightAt, throatHalfWidthAt, type ThroatGeometry } from '../../simulation/geometry';
import type { LineSide, ModuleStatus } from '../../simulation/types';
import { WAVES_GLSL, waveElevation } from '../../simulation/waves';
import { applyMedium, mediumMaterial, SHARED } from '../environment/shaderChunks';
import { makeGratingTexture } from '../environment/textures';

const OCC_GREEN = new THREE.Color(0x34d399);
/** Fraction of the feeder hose (its pontoon end) that stays put when the hose is stowed. */
const FEEDER_FIXED = 0.12;
const OCC_AMBER = new THREE.Color(0xf5b94c);
const OCC_RED = new THREE.Color(0xf87171);

export function occupancyColor(occ: number, out: THREE.Color): THREE.Color {
  if (occ < 0.6) return out.copy(OCC_GREEN).lerp(OCC_AMBER, Math.max(0, (occ - 0.45) / 0.15));
  if (occ < 0.85) return out.copy(OCC_AMBER).lerp(OCC_RED, Math.max(0, (occ - 0.75) / 0.1));
  return out.copy(OCC_RED);
}

/** Superellipse cross-section loft for the bellmouth. */
function bellmouthGeometry(th: ThroatGeometry): { surface: THREE.BufferGeometry; lip: THREE.Vector3[] } {
  const ringSegs = 56;
  const stations: number[] = [];
  for (let i = 0; i <= 6; i++) stations.push(-1.0 + (i / 6) * 1.0);
  for (let i = 1; i <= 18; i++) stations.push((i / 18) * th.length);
  const pos: number[] = [];
  const lip: THREE.Vector3[] = [];
  const nExp = 4;
  for (let j = 0; j < stations.length; j++) {
    const q = stations[j];
    let w: number;
    let h: number;
    if (q < 0) {
      const f = Math.pow(-q / 1.0, 1.6);
      w = th.halfWidth + 0.55 * f;
      h = th.halfHeight + 0.45 * f;
    } else {
      w = throatHalfWidthAt(th, q);
      h = throatHalfHeightAt(th, q);
    }
    for (let i = 0; i <= ringSegs; i++) {
      const a = (i / ringSegs) * Math.PI * 2;
      const c = Math.cos(a);
      const s = Math.sin(a);
      const lx = w * Math.sign(c) * Math.pow(Math.abs(c), 2 / nExp);
      const ly = h * Math.sign(s) * Math.pow(Math.abs(s), 2 / nExp);
      const x = th.mx + th.ax * q + th.lx * lx;
      const z = th.mz + th.az * q + th.lz * lx;
      const y = -th.centerDepth + ly;
      pos.push(x, y, z);
      if (j === 0 && i < ringSegs) lip.push(new THREE.Vector3(x, y, z));
    }
  }
  const cols = ringSegs + 1;
  const idx: number[] = [];
  for (let j = 0; j < stations.length - 1; j++) {
    for (let i = 0; i < ringSegs; i++) {
      const a = j * cols + i;
      idx.push(a, a + cols, a + 1, a + 1, a + cols, a + cols + 1);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return { surface: g, lip };
}

/**
 * HDPE pipe material that floats on the shared sea state and shows moving flow pulses. A floating
 * hose can also lie stowed on the seabed (`rise` 0), from `sinkFrom` along its length (so its end
 * on the pontoon stays put).
 */
function pipeMaterial(
  floating: boolean,
  colour: number,
  sinkFrom = 0,
): { mat: THREE.MeshStandardMaterial; flow: { value: number }; rise: { value: number } } {
  const flow = { value: 0 };
  const rise = { value: 1 };
  const sink = { value: sinkFrom };
  const mat = applyMedium(new THREE.MeshStandardMaterial({ color: colour, roughness: 0.42, metalness: 0.08 }), {
    caustics: true,
    key: floating ? 'pipe-float' : 'pipe-fixed',
    extra: (shader) => {
      shader.uniforms.uFlow = flow;
      shader.uniforms.uRise = rise;
      shader.uniforms.uSinkFrom = sink;
      shader.uniforms.uWaveAmp = SHARED.uWaveAmp;
      shader.uniforms.uWaveTime = SHARED.uWaveTime;
      shader.uniforms.uFlowTime = SHARED.uTime;
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', `#include <common>\n${floating ? `${WAVES_GLSL}\n${SEABED_DEPTH_GLSL}\nuniform float uRise;\nuniform float uSinkFrom;` : ''}\nvarying float vAlong;`)
        .replace(
          '#include <begin_vertex>',
          `#include <begin_vertex>
          vAlong = uv.x;
          ${
            floating
              ? `vec2 wxz = (modelMatrix * vec4(transformed, 1.0)).xz;
          vec2 pSlope;
          float eta = waveElevation(wxz, pSlope) * 0.85;
          // Stowed: resting on the seabed.
          float bed = 0.57 - seabedDepth(wxz);
          transformed.y += mix(eta, bed, (1.0 - uRise) * smoothstep(uSinkFrom, uSinkFrom + 0.08, uv.x));`
              : ''
          }`,
        );
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', '#include <common>\nuniform float uFlow;\nuniform float uFlowTime;\nvarying float vAlong;')
        .replace(
          '#include <emissivemap_fragment>',
          `#include <emissivemap_fragment>
          float pulse = smoothstep(0.35, 1.0, sin(vAlong * ${floating ? '120.0' : '24.0'} - uFlowTime * 2.4) * 0.5 + 0.5);
          totalEmissiveRadiance += vec3(0.08, 0.6, 0.72) * pulse * uFlow * 0.55 + vec3(0.015, 0.08, 0.1) * uFlow;`,
        );
    },
  });
  return { mat, flow, rise };
}

interface ModuleVisual {
  housing: THREE.Mesh;
  beacon: THREE.Mesh;
  beaconMat: THREE.MeshBasicMaterial;
  housingMat: THREE.MeshStandardMaterial;
}

/**
 * Recovery throat, pontoon, primary + standby transfer modules and the
 * floating transfer pipeline (a feeder to the release-valve manifold, then the
 * branch to the outlet). Visual state follows the simulation's transfer
 * statuses and throat occupancy. Built in the side-0 frame; the Twin-Line's
 * mirror-image installation is the same model mirrored about the intake centreline.
 */
export class TransferSystem {
  readonly group = new THREE.Group();
  readonly throatGroup = new THREE.Group();
  readonly moduleGroup = new THREE.Group();
  readonly pipeGroup = new THREE.Group();
  readonly side: LineSide;
  /** The recovery throat in world coordinates. */
  readonly throat: ThroatGeometry;
  private readonly lipMat: THREE.MeshStandardMaterial;
  private readonly occBeacon: THREE.Mesh;
  private readonly primary: ModuleVisual;
  private readonly standby: ModuleVisual;
  private readonly feederFlow: { value: number };
  private readonly branchFlow: { value: number };
  /** Hose rise (0 stowed on the seabed, 1 floating) for the feeder and the branch. */
  private readonly feederRise: { value: number };
  private readonly branchRise: { value: number };
  private readonly riserFlow: { value: number };
  private readonly standbyFlow: { value: number };
  private readonly collars: THREE.InstancedMesh;
  private readonly collarPts: THREE.Vector3[] = [];
  private readonly collarQuats: THREE.Quaternion[] = [];
  /** Which hose each collar is on (0 feeder, 1 branch) and how much of it sinks when stowed. */
  private readonly collarHose: number[] = [];
  private readonly collarSink: number[] = [];
  private readonly idleLip = new THREE.Color(0x24313a);
  private readonly tmpC = new THREE.Color();
  /** Feeder (throat to manifold) and branch (manifold to outlet), in the side-0 frame. */
  readonly pipeCurve: THREE.CatmullRomCurve3;
  readonly branchCurve: THREE.CatmullRomCurve3;
  private readonly m = new THREE.Matrix4();
  private readonly q = new THREE.Quaternion();
  private readonly s = new THREE.Vector3(1, 1, 1);
  private readonly p = new THREE.Vector3();

  constructor(side: LineSide = 0) {
    this.group.name = side === 0 ? 'transfer-system' : 'transfer-system-b';
    this.side = side;
    this.throat = buildThroatGeometry(side);
    const th = buildThroatGeometry(0);
    if (side === 1) {
      this.group.scale.x = -1;
      this.group.position.x = SITE.twin.mirrorX;
    }

    // ---------------------------------------------------- bellmouth
    const { surface, lip } = bellmouthGeometry(th);
    const shell = new THREE.Mesh(
      surface,
      mediumMaterial({ color: 0x4f7c86, roughness: 0.42, metalness: 0.2, side: THREE.DoubleSide }),
    );
    shell.castShadow = true;
    shell.receiveShadow = true;
    this.lipMat = new THREE.MeshStandardMaterial({ color: 0x1b2a2e, emissive: OCC_GREEN, emissiveIntensity: 0.55, roughness: 0.4 });
    const lipTube = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(lip, true), 120, 0.16, 8, true), this.lipMat);
    // Gate frame at the waterline: two posts and a crossbeam carrying the occupancy beacon.
    const frameMat = mediumMaterial({ color: 0xc8cfd2, roughness: 0.45, metalness: 0.5 });
    const fx = th.mx - 0.4;
    const frame = new THREE.Mesh(
      mergeGeometries([
        new THREE.BoxGeometry(0.35, 3.4, 0.35).translate(fx, 0.9, th.mz - th.halfWidth - 0.55),
        new THREE.BoxGeometry(0.35, 3.4, 0.35).translate(fx, 0.9, th.mz + th.halfWidth + 0.55),
        new THREE.BoxGeometry(0.4, 0.35, th.halfWidth * 2 + 1.5).translate(fx, 2.55, th.mz),
        new THREE.BoxGeometry(2.2, 0.22, 0.3).translate(fx + 1.0, 0.45, th.mz - th.halfWidth - 0.55),
        new THREE.BoxGeometry(2.2, 0.22, 0.3).translate(fx + 1.0, 0.45, th.mz + th.halfWidth + 0.55),
      ])!,
      frameMat,
    );
    frame.castShadow = true;
    this.occBeacon = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.18, th.halfWidth * 1.6), new THREE.MeshBasicMaterial({ color: OCC_GREEN }));
    this.occBeacon.position.set(fx, 2.82, th.mz);
    this.throatGroup.add(shell, lipTube, frame, this.occBeacon);
    this.throatGroup.traverse((o) => (o.userData.pick = 'throat'));

    // ---------------------------------------------------- pontoon
    const deckMat = mediumMaterial({ map: makeGratingTexture(64), roughness: 0.7, metalness: 0.4, color: 0x9aa5ab }, false);
    (deckMat.map as THREE.Texture).repeat.set(6, 5);
    const hullMat = mediumMaterial({ color: 0x2a3b45, roughness: 0.6, metalness: 0.3 });
    const yellow = mediumMaterial({ color: 0xe8b23a, roughness: 0.5 }, false);
    const px0 = th.mx + 1.2;
    const px1 = th.mx + 14.5;
    const pz0 = th.mz - 4.6;
    const pz1 = th.mz + 4.6;
    const pontoon = new THREE.Group();
    const hulls = mergeGeometries([
      new THREE.BoxGeometry(px1 - px0, 1.2, 1.6).translate((px0 + px1) / 2, 0.05, pz0 + 0.8),
      new THREE.BoxGeometry(px1 - px0, 1.2, 1.6).translate((px0 + px1) / 2, 0.05, pz1 - 0.8),
      new THREE.BoxGeometry(1.4, 1.0, pz1 - pz0).translate(px1 - 0.7, 0.15, (pz0 + pz1) / 2),
    ])!;
    const hullMesh = new THREE.Mesh(hulls, hullMat);
    const deck = new THREE.Mesh(new THREE.BoxGeometry(px1 - px0, 0.14, pz1 - pz0).translate((px0 + px1) / 2, 0.72, (pz0 + pz1) / 2), deckMat);
    const railGeos: THREE.BufferGeometry[] = [];
    for (let x = px0 + 0.3; x <= px1 - 0.2; x += 1.5) {
      railGeos.push(new THREE.CylinderGeometry(0.03, 0.03, 1.0, 5).translate(x, 1.29, pz0 + 0.1));
      railGeos.push(new THREE.CylinderGeometry(0.03, 0.03, 1.0, 5).translate(x, 1.29, pz1 - 0.1));
    }
    railGeos.push(new THREE.BoxGeometry(px1 - px0, 0.05, 0.05).translate((px0 + px1) / 2, 1.78, pz0 + 0.1));
    railGeos.push(new THREE.BoxGeometry(px1 - px0, 0.05, 0.05).translate((px0 + px1) / 2, 1.78, pz1 - 0.1));
    const rails = new THREE.Mesh(mergeGeometries(railGeos)!, yellow);
    pontoon.add(hullMesh, deck, rails);
    pontoon.traverse((o) => {
      o.castShadow = true;
      o.receiveShadow = true;
    });
    this.moduleGroup.add(pontoon);

    // ---------------------------------------------------- transfer modules
    this.primary = this.buildModule(th.mx + 8.6, th.mz - 1.6, 0x2c5d6b);
    this.standby = this.buildModule(th.mx + 8.6, th.mz + 1.9, 0x34454f);
    this.moduleGroup.traverse((o) => (o.userData.pick = 'transfer'));

    // Riser from the bellmouth outlet to the module inlets (enclosed, no impeller in the animal path).
    const riserP = pipeMaterial(false, 0x1c2428);
    this.riserFlow = riserP.flow;
    const riserCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(th.inletX - 0.6, -th.centerDepth, th.inletZ),
      new THREE.Vector3(th.inletX + 0.8, -th.centerDepth + 0.2, th.inletZ),
      new THREE.Vector3(th.inletX + 1.3, 0.5, th.inletZ - 0.6),
      new THREE.Vector3(th.mx + 6.2, 1.75, th.mz - 1.6),
    ]);
    const riser = new THREE.Mesh(new THREE.TubeGeometry(riserCurve, 40, 0.62, 18, false), riserP.mat);
    const standbyP = pipeMaterial(false, 0x1c2428);
    this.standbyFlow = standbyP.flow;
    const branch = new THREE.Mesh(
      new THREE.TubeGeometry(
        new THREE.CatmullRomCurve3([
          new THREE.Vector3(th.inletX + 1.3, 0.5, th.inletZ - 0.6),
          new THREE.Vector3(th.inletX + 1.5, 1.2, th.mz + 0.8),
          new THREE.Vector3(th.mx + 6.2, 1.75, th.mz + 1.9),
        ]),
        24,
        0.42,
        14,
        false,
      ),
      standbyP.mat,
    );
    this.moduleGroup.add(riser, branch);

    // ---------------------------------------------------- floating transfer pipeline
    // Feeder to the release-valve manifold, then the branch to this side's outlet (the valve sends
    // each animal down whichever branch is down-tide).
    const valve = SITE.manifold;
    const j = SITE.pipeRoute.findIndex(([x, z]) => x === valve.x && z === valve.z);
    const feeder = [
      new THREE.Vector3(th.mx + 11.2, 1.75, th.mz - 1.6),
      new THREE.Vector3(th.mx + 13.4, 0.6, th.mz - 0.6),
      new THREE.Vector3(th.mx + 16.5, 0.05, th.mz + 0.5),
      ...SITE.pipeRoute.slice(1, j + 1).map(([x, z]) => new THREE.Vector3(x, 0.05, z)),
    ];
    const branchRoute = [
      ...SITE.pipeRoute.slice(j).map(([x, z]) => new THREE.Vector3(x, 0.05, z)),
      new THREE.Vector3(SITE.release.x - SITE.release.dirX * 2.5, 0.05, SITE.release.z - SITE.release.dirZ * 2.5),
    ];
    this.pipeCurve = new THREE.CatmullRomCurve3(feeder, false, 'centripetal');
    this.branchCurve = new THREE.CatmullRomCurve3(branchRoute, false, 'centripetal');
    const feederP = pipeMaterial(true, 0x2a3135, FEEDER_FIXED);
    const branchP = pipeMaterial(true, 0x2a3135);
    this.feederFlow = feederP.flow;
    this.branchFlow = branchP.flow;
    this.feederRise = feederP.rise;
    this.branchRise = branchP.rise;
    const pipes = [
      new THREE.Mesh(new THREE.TubeGeometry(this.pipeCurve, 160, 0.62, 16, false), feederP.mat),
      new THREE.Mesh(new THREE.TubeGeometry(this.branchCurve, 260, 0.62, 16, false), branchP.mat),
    ];
    for (const pipe of pipes) {
      pipe.castShadow = false;
      pipe.receiveShadow = true;
      pipe.userData.pick = 'transfer';
    }
    const joinCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(th.mx + 11.2, 1.75, th.mz + 1.9),
      new THREE.Vector3(th.mx + 13.0, 1.2, th.mz + 1.4),
      new THREE.Vector3(th.mx + 14.6, 0.6, th.mz + 0.2),
    ]);
    const join = new THREE.Mesh(new THREE.TubeGeometry(joinCurve, 20, 0.42, 14, false), standbyP.mat);
    this.pipeGroup.add(...pipes, join);

    // Flotation collars along the floating line.
    const zAxis = new THREE.Vector3(0, 0, 1);
    for (const [hose, curve, start] of [
      [0, this.pipeCurve, 22],
      [1, this.branchCurve, 4],
    ] as const) {
      const total = curve.getLength();
      for (let d = start; d < total - 4; d += 7) {
        const u = d / total;
        this.collarPts.push(curve.getPointAt(u));
        this.collarQuats.push(new THREE.Quaternion().setFromUnitVectors(zAxis, curve.getTangentAt(u)));
        this.collarHose.push(hose);
        this.collarSink.push(hose === 0 ? THREE.MathUtils.smoothstep(u, FEEDER_FIXED, FEEDER_FIXED + 0.08) : 1);
      }
    }
    this.collars = new THREE.InstancedMesh(
      new THREE.TorusGeometry(0.78, 0.2, 8, 20),
      mediumMaterial({ color: 0xf59e0b, roughness: 0.45 }, false),
      this.collarPts.length,
    );
    this.collars.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.collars.frustumCulled = false;
    this.pipeGroup.add(this.collars);
    this.pipeGroup.traverse((o) => (o.userData.pick = 'transfer'));

    this.group.add(this.throatGroup, this.moduleGroup, this.pipeGroup);
  }

  private buildModule(x: number, z: number, colour: number): ModuleVisual {
    const housingMat = mediumMaterial({ color: colour, roughness: 0.38, metalness: 0.45, emissive: 0x000000 }, false);
    const g = new THREE.Group();
    const housing = new THREE.Mesh(new THREE.CylinderGeometry(0.95, 0.95, 4.6, 28).rotateZ(Math.PI / 2), housingMat);
    housing.position.set(x, 1.75, z);
    const flangeGeo = new THREE.CylinderGeometry(1.08, 1.08, 0.14, 28).rotateZ(Math.PI / 2);
    const steel = mediumMaterial({ color: 0x8d989f, roughness: 0.35, metalness: 0.7 }, false);
    const f1 = new THREE.Mesh(flangeGeo, steel);
    f1.position.set(x - 2.3, 1.75, z);
    const f2 = new THREE.Mesh(flangeGeo, steel);
    f2.position.set(x + 2.3, 1.75, z);
    const drive = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.7, 1.0), mediumMaterial({ color: 0x3a464d, roughness: 0.5, metalness: 0.4 }, false));
    drive.position.set(x + 0.4, 2.95, z);
    const saddleGeo = mergeGeometries([
      new THREE.BoxGeometry(0.3, 0.9, 1.6).translate(x - 1.4, 1.1, z),
      new THREE.BoxGeometry(0.3, 0.9, 1.6).translate(x + 1.4, 1.1, z),
    ])!;
    const saddles = new THREE.Mesh(saddleGeo, steel);
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 1.4, 6), steel);
    pole.position.set(x + 1.6, 3.2, z);
    const beaconMat = new THREE.MeshBasicMaterial({ color: 0x34d399 });
    const beacon = new THREE.Mesh(new THREE.SphereGeometry(0.17, 14, 10), beaconMat);
    beacon.position.set(x + 1.6, 3.95, z);
    g.add(housing, f1, f2, drive, saddles, pole, beacon);
    g.traverse((o) => {
      o.castShadow = true;
      o.receiveShadow = true;
    });
    this.moduleGroup.add(g);
    return { housing, beacon, beaconMat, housingMat };
  }

  private styleModule(v: ModuleVisual, status: ModuleStatus, time: number): void {
    const pulse = 0.55 + 0.45 * Math.sin(time * 4);
    switch (status) {
      case 'ONLINE':
        v.beaconMat.color.set(0x34d399);
        v.housingMat.emissive.setRGB(0.0, 0.05, 0.06);
        break;
      case 'ACTIVATING':
        v.beaconMat.color.setRGB(0.96 * pulse + 0.04, 0.72 * pulse + 0.05, 0.3 * pulse);
        v.housingMat.emissive.setRGB(0.08 * pulse, 0.05 * pulse, 0.0);
        break;
      case 'FAULT':
        v.beaconMat.color.setRGB(0.97 * pulse + 0.03, 0.44 * pulse, 0.44 * pulse);
        v.housingMat.emissive.setRGB(0.28 * pulse, 0.02, 0.02);
        break;
      case 'DISABLED':
        v.beaconMat.color.set(0x2a3338);
        v.housingMat.emissive.setRGB(0, 0, 0);
        break;
      default:
        v.beaconMat.color.set(0x4b5a62);
        v.housingMat.emissive.setRGB(0, 0, 0);
    }
  }

  /**
   * `branchFlow`: flow (0..1) down the branch to this side's outlet, set by the release valve.
   * `feederUp` / `branchUp`: whether each hose floats or lies stowed on the seabed (eased over `dt`).
   */
  update(state: {
    occupancy: number;
    primary: ModuleStatus;
    standby: ModuleStatus;
    path: string;
    flowFraction: number;
    throatOpen: boolean;
    branchFlow: number;
    feederUp: boolean;
    branchUp: boolean;
    dt: number;
    time: number;
    waveTime: number;
    waveHeight: number;
  }): void {
    occupancyColor(state.occupancy, this.tmpC);
    this.lipMat.emissive.copy(state.throatOpen ? this.tmpC : this.idleLip);
    this.lipMat.emissiveIntensity = state.throatOpen ? 0.5 + 0.2 * Math.sin(state.time * 2.5) * Math.min(1, state.occupancy) : 0.2;
    (this.occBeacon.material as THREE.MeshBasicMaterial).color.copy(state.throatOpen ? this.tmpC : this.idleLip);
    this.styleModule(this.primary, state.primary, state.time);
    this.styleModule(this.standby, state.standby, state.time);
    const f = state.throatOpen ? Math.min(1, state.flowFraction) : 0;
    this.feederFlow.value = f;
    this.branchFlow.value = Math.min(1, state.branchFlow);
    this.riserFlow.value = state.path === 'NONE' ? 0 : f;
    this.standbyFlow.value = state.path === 'STANDBY' ? f : 0;
    const k = Math.min(1, state.dt / 1.6);
    this.feederRise.value += ((state.feederUp ? 1 : 0) - this.feederRise.value) * k;
    this.branchRise.value += ((state.branchUp ? 1 : 0) - this.branchRise.value) * k;
    for (let i = 0; i < this.collarPts.length; i++) {
      const c = this.collarPts[i];
      // Collars sit in the side-0 frame; the sea state and seabed are sampled where they really are.
      const wx = this.side === 0 ? c.x : mirrorX(c.x);
      const sunk = (1 - (this.collarHose[i] === 0 ? this.feederRise.value : this.branchRise.value)) * this.collarSink[i];
      const float = c.y + waveElevation(wx, c.z, state.waveTime, state.waveHeight) * 0.85;
      this.q.copy(this.collarQuats[i]);
      this.p.set(c.x, float + (0.62 - seabedDepth(wx, c.z) - float) * sunk, c.z);
      this.m.compose(this.p, this.q, this.s);
      this.collars.setMatrixAt(i, this.m);
    }
    this.collars.instanceMatrix.needsUpdate = true;
  }

  /** Label anchor points (world coordinates). */
  anchors() {
    const th = this.throat;
    const sx = this.side === 0 ? 1 : -1;
    const pipe = this.pipeCurve.getPointAt(0.5);
    return {
      throat: new THREE.Vector3(th.mx, 1.4, th.mz),
      transfer: new THREE.Vector3(th.mx + 8.6 * sx, 4.4, th.mz),
      transferLow: new THREE.Vector3(th.mx + 11.5 * sx, 2.2, th.mz + 1.9),
      pipe: new THREE.Vector3(this.side === 0 ? pipe.x : mirrorX(pipe.x), pipe.y + 1.2, pipe.z),
    };
  }
}

/**
 * Release-valve manifold where both lines' transfer pipelines meet (Twin-Line): a floating
 * valve body whose indicator points down the branch to the outlet the valve is set to.
 */
export class ReleaseValve {
  readonly group = new THREE.Group();
  private readonly pointer = new THREE.Group();
  private readonly ringMat = new THREE.MeshBasicMaterial({ color: 0x34d399 });
  private yaw = 0;

  constructor() {
    this.group.name = 'release-valve';
    const v = SITE.manifold;
    const steel = mediumMaterial({ color: 0x8d989f, roughness: 0.35, metalness: 0.7 }, false);
    const body = new THREE.Mesh(new THREE.CylinderGeometry(1.15, 1.15, 0.9, 28), mediumMaterial({ color: 0x2c3a42, roughness: 0.5, metalness: 0.4 }, false));
    body.position.y = 0.25;
    const actuator = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.55, 0.7), steel);
    actuator.position.y = 0.95;
    const ring = new THREE.Mesh(new THREE.TorusGeometry(1.2, 0.08, 8, 40).rotateX(Math.PI / 2), this.ringMat);
    ring.position.y = 0.72;
    // Indicator arrow on the actuator, turned toward the live branch.
    const arrow = new THREE.Mesh(new THREE.ConeGeometry(0.28, 0.9, 12).rotateZ(-Math.PI / 2).translate(0.75, 0, 0), this.ringMat);
    arrow.position.y = 1.3;
    this.pointer.add(arrow);
    this.group.add(body, actuator, ring, this.pointer);
    this.group.position.set(v.x, 0, v.z);
    this.group.traverse((o) => {
      o.userData.pick = 'transfer';
      o.castShadow = true;
    });
  }

  /** `outlet`: the outlet the valve sends releases to; `active`: transfer running. */
  update(outlet: LineSide, active: boolean, dt: number, waveTime: number, waveHeight: number): void {
    const v = SITE.manifold;
    const j = SITE.pipeRoute.findIndex(([x, z]) => x === v.x && z === v.z);
    const [nx, nz] = SITE.pipeRoute[j + 1];
    const dx = (outlet === 0 ? nx : mirrorX(nx)) - v.x;
    const goal = -Math.atan2(nz - v.z, dx);
    let d = goal - this.yaw;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    // The actuator swings over in a couple of seconds.
    this.yaw += d * Math.min(1, dt * 2.5);
    this.pointer.rotation.y = this.yaw;
    this.ringMat.color.set(active ? 0x34d399 : 0x4b5a62);
    this.group.position.y = waveElevation(v.x, v.z, waveTime, waveHeight) * 0.85 - 0.1;
  }
}
