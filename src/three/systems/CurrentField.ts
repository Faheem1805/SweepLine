import * as THREE from 'three';
import { SITE, inMound } from '../../config/site';
import type { SimulationEngine } from '../../simulation/SimulationEngine';

/** Particle region: the channel and the water it draws from. */
const REGION = { x0: -640, x1: 640, z0: -28, z1: 980 };
const MAX = 6400;

/**
 * Flow visualisation for one world: advected streak particles plus a grid of direction arrows
 * (engineering view). Particles ride the same field as the agents, and pass through the nets as the
 * water does, so the reader sees that the net stops animals, not flow.
 */
export class CurrentField {
  readonly group = new THREE.Group();
  private readonly lines: THREE.LineSegments;
  private readonly arrows: THREE.InstancedMesh;
  private readonly px = new Float32Array(MAX);
  private readonly pz = new Float32Array(MAX);
  private readonly vx = new Float32Array(MAX);
  private readonly vz = new Float32Array(MAX);
  private readonly life = new Float32Array(MAX);
  private readonly maxLife = new Float32Array(MAX);
  private readonly positions: Float32Array;
  private readonly colors: Float32Array;
  private readonly tmp = { x: 0, z: 0 };
  private arrowTimer = 0;
  private flowMode = false;
  private initialised = false;
  private readonly arrowPos: Array<[number, number]> = [];

  constructor(name: string) {
    this.group.name = name;
    this.positions = new Float32Array(MAX * 6);
    this.colors = new Float32Array(MAX * 6);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.positions, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('color', new THREE.BufferAttribute(this.colors, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setDrawRange(0, 0);
    const lineMat = new THREE.ShaderMaterial({
      vertexShader: /* glsl */ `
        attribute vec3 color;
        varying vec3 vColor;
        void main() {
          vColor = color;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: /* glsl */ `
        varying vec3 vColor;
        void main() { gl_FragColor = vec4(vColor, 1.0); }
      `,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    this.lines = new THREE.LineSegments(geo, lineMat);
    this.lines.frustumCulled = false;
    this.lines.renderOrder = 20;
    this.group.add(this.lines);

    const shape = new THREE.Shape();
    shape.moveTo(1.0, 0);
    shape.lineTo(-0.35, 0.55);
    shape.lineTo(-0.1, 0);
    shape.lineTo(-0.35, -0.55);
    shape.closePath();
    const arrowGeo = new THREE.ShapeGeometry(shape);
    arrowGeo.rotateX(-Math.PI / 2);
    for (let x = -620; x <= 620; x += 44) {
      for (let z = -10; z <= 960; z += 44) {
        if (inMound(x, z)) continue;
        this.arrowPos.push([x, z]);
      }
    }
    const arrowMat = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.75, depthWrite: false, side: THREE.DoubleSide });
    this.arrows = new THREE.InstancedMesh(arrowGeo, arrowMat, this.arrowPos.length);
    this.arrows.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.arrows.frustumCulled = false;
    this.arrows.renderOrder = 21;
    this.arrows.visible = false;
    const c = new THREE.Color(0.2, 0.8, 0.95);
    for (let i = 0; i < this.arrowPos.length; i++) this.arrows.setColorAt(i, c);
    this.group.add(this.arrows);
  }

  private respawn(i: number): void {
    const r = REGION;
    let x = 0;
    let z = 0;
    for (let tries = 0; tries < 8; tries++) {
      // Half the particles in the channel, where the action is.
      if (Math.random() < 0.5) {
        x = (Math.random() - 0.5) * 2 * (SITE.channel.halfWidth - 2);
        z = r.z0 + Math.random() * (SITE.channel.mouthZ + 40 - r.z0);
      } else {
        x = r.x0 + Math.random() * (r.x1 - r.x0);
        z = r.z0 + Math.random() * (r.z1 - r.z0);
      }
      if (!inMound(x, z)) break;
    }
    this.px[i] = x;
    this.pz[i] = z;
    this.maxLife[i] = 60 + Math.random() * 110;
    this.life[i] = 0;
    this.vx[i] = 0;
    this.vz[i] = 0;
  }

  setFlowMode(on: boolean): void {
    if (on === this.flowMode && this.initialised) return;
    this.flowMode = on;
    this.arrows.visible = on;
    for (let i = 0; i < MAX; i++) {
      this.respawn(i);
      this.life[i] = Math.random() * this.maxLife[i];
    }
    this.initialised = true;
  }

  update(engine: SimulationEngine, dtSim: number, dtReal: number): void {
    if (!this.initialised) this.setFlowMode(false);
    const n = this.flowMode ? MAX : 1800;
    const flow = engine.flow;
    const tmp = this.tmp;
    const dt = Math.min(dtSim, 6);
    const trail = this.flowMode ? 34 : 12;
    const pos = this.positions;
    const col = this.colors;
    for (let i = 0; i < n; i++) {
      let x = this.px[i];
      let z = this.pz[i];
      flow.sample(x, z, 1.2, tmp);
      this.vx[i] += (tmp.x - this.vx[i]) * 0.5;
      this.vz[i] += (tmp.z - this.vz[i]) * 0.5;
      x += this.vx[i] * dt;
      z += this.vz[i] * dt;
      this.life[i] += dt;
      const outside = x > REGION.x1 || x < REGION.x0 || z > REGION.z1 || z < SITE.intake.mouthZ + 1 || inMound(x, z);
      if (this.life[i] > this.maxLife[i] || outside) {
        this.respawn(i);
        x = this.px[i];
        z = this.pz[i];
      }
      this.px[i] = x;
      this.pz[i] = z;
      const speed = Math.hypot(this.vx[i], this.vz[i]);
      const lt = this.life[i] / this.maxLife[i];
      const fade = Math.min(1, lt * 5) * Math.min(1, (1 - lt) * 4);
      const y = 0.5;
      const o = i * 6;
      pos[o] = x;
      pos[o + 1] = y;
      pos[o + 2] = z;
      pos[o + 3] = x - this.vx[i] * trail;
      pos[o + 4] = y;
      pos[o + 5] = z - this.vz[i] * trail;
      const t = Math.min(1, speed / 0.42);
      const k = fade * (this.flowMode ? 0.85 : 0.07);
      col[o] = (0.08 + 0.6 * t * t) * k;
      col[o + 1] = (0.5 + 0.5 * t) * k;
      col[o + 2] = (0.75 + 0.25 * t) * k;
      col[o + 3] = 0;
      col[o + 4] = 0;
      col[o + 5] = 0;
    }
    const geo = this.lines.geometry;
    geo.setDrawRange(0, n * 2);
    const pa = geo.attributes.position as THREE.BufferAttribute;
    const ca = geo.attributes.color as THREE.BufferAttribute;
    pa.clearUpdateRanges();
    pa.addUpdateRange(0, n * 6);
    pa.needsUpdate = true;
    ca.clearUpdateRanges();
    ca.addUpdateRange(0, n * 6);
    ca.needsUpdate = true;

    if (this.flowMode) {
      this.arrowTimer -= dtReal;
      if (this.arrowTimer <= 0) {
        this.arrowTimer = 0.4;
        this.updateArrows(engine);
      }
    }
  }

  private readonly am = new THREE.Matrix4();
  private readonly aq = new THREE.Quaternion();
  private readonly ap = new THREE.Vector3();
  private readonly as = new THREE.Vector3();
  private readonly ac = new THREE.Color();
  private readonly yAxis = new THREE.Vector3(0, 1, 0);

  private updateArrows(engine: SimulationEngine): void {
    const flow = engine.flow;
    for (let i = 0; i < this.arrowPos.length; i++) {
      const [x, z] = this.arrowPos[i];
      flow.sample(x, z, 1, this.tmp);
      const sp = Math.hypot(this.tmp.x, this.tmp.z);
      this.aq.setFromAxisAngle(this.yAxis, -Math.atan2(this.tmp.z, this.tmp.x));
      const sc = 3 + Math.min(sp, 0.6) * 22;
      this.ap.set(x, 0.6, z);
      this.as.set(sc, 1, sc * 0.8);
      this.am.compose(this.ap, this.aq, this.as);
      this.arrows.setMatrixAt(i, this.am);
      const t = Math.min(1, sp / 0.4);
      this.ac.setRGB(0.1 + 0.85 * t * t, 0.55 + 0.45 * t, 0.7 + 0.3 * t);
      this.arrows.setColorAt(i, this.ac);
    }
    this.arrows.instanceMatrix.needsUpdate = true;
    if (this.arrows.instanceColor) this.arrows.instanceColor.needsUpdate = true;
  }
}
