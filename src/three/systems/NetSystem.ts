import * as THREE from 'three';
import { ASSUMPTIONS } from '../../config/assumptions';
import { SITE, waveExposure } from '../../config/site';
import type { NetLine } from '../../simulation/geometry';
import type { NetState } from '../../simulation/net';
import { waveElevation } from '../../simulation/waves';
import { applyMedium, mediumMaterial } from '../environment/shaderChunks';

/** Mesh columns per panel, so a panel can belly downstream with the flow. */
const COLS = 4;
const TOP = SITE.net.freeboard;
const DEPTH = SITE.channel.depth;

function meshTexture(): THREE.CanvasTexture {
  const size = 128;
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const x = c.getContext('2d')!;
  x.clearRect(0, 0, size, size);
  x.strokeStyle = 'rgba(255,255,255,0.95)';
  x.lineWidth = 7;
  const cell = size / 2;
  for (let i = -2; i <= 4; i++) {
    x.beginPath();
    x.moveTo(i * cell, 0);
    x.lineTo(i * cell + size, size);
    x.stroke();
    x.beginPath();
    x.moveTo(i * cell + size, 0);
    x.lineTo(i * cell, size);
    x.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

const CLEAN = new THREE.Color(0xd8c9a0);
const FOULED = new THREE.Color(0x5d6236);
const OK = new THREE.Color(0x2dd4bf);
const NEAR = new THREE.Color(0xf5b94c);
const OUT = new THREE.Color(0xf87171);
const _c = new THREE.Color();
const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();
const _a = new THREE.Vector3(1, 0, 0);
const _b = new THREE.Vector3();
const _jq = new THREE.Quaternion();
const _jn = new THREE.Vector3();
const _down = new THREE.Vector3(0, -1, 0);
/** Jet nozzles: heights of the two rows (m) and nozzles per row on each panel. */
const JET_ROWS = [-SITE.channel.depth + 1.2, -SITE.channel.depth * 0.45];
const JET_COLS = 6;

/** Colour for a load 0..1 (engineering view): teal, through amber, to red. */
function loadColor(load: number, out: THREE.Color): THREE.Color {
  const t = Math.min(1, Math.max(0, load));
  if (t < 0.5) return out.copy(OK).lerp(NEAR, t * 2);
  return out.copy(NEAR).lerp(OUT, (t - 0.5) * 2);
}

interface NetParts {
  jets: THREE.InstancedMesh;
  /** Whether each panel's jets are drawn now. */
  jetOn: boolean[];
  geometry: THREE.BufferGeometry;
  panels: THREE.Mesh;
  floats: THREE.InstancedMesh;
  lamps: THREE.InstancedMesh;
  glow: THREE.Mesh;
  glowMat: THREE.ShaderMaterial;
}

/**
 * The two guide nets in 3D: tubular piles, mesh panels from float line to seabed that belly gently
 * with the flow, an amber float line, a lamp on each pile, and a glowing line on the water that keeps
 * the net readable from the air and shows its load in the engineering view.
 */
export class NetSystem {
  readonly group = new THREE.Group();
  private readonly parts: NetParts[] = [];
  private readonly nets: readonly NetLine[];
  private readonly panelMat: THREE.Material;
  private readonly jetMat: THREE.ShaderMaterial;
  /** A spray cone with its tip at the nozzle, opening along −y (turned to face upstream). */
  private readonly jetGeo = new THREE.ConeGeometry(0.45, 1.3, 16, 1, true).translate(0, -0.65, 0);

  constructor(nets: readonly NetLine[]) {
    this.group.name = 'nets';
    this.nets = nets;
    const tex = meshTexture();
    tex.repeat.set(1, 1);
    this.panelMat = applyMedium(
      new THREE.MeshStandardMaterial({ map: tex, transparent: true, opacity: 0.85, alphaTest: 0.03, side: THREE.DoubleSide, roughness: 0.75, depthWrite: false, vertexColors: true }),
      { caustics: true, key: 'net-mesh' },
    );
    const floatMat = mediumMaterial({ color: 0xf0a428, roughness: 0.5, metalness: 0.05, emissive: 0x4a2a00, emissiveIntensity: 0.5 }, false);
    const pileMat = mediumMaterial({ color: 0x6d7a81, roughness: 0.6, metalness: 0.5 });
    const capMat = mediumMaterial({ color: 0xe8b23a, roughness: 0.5, metalness: 0.2 }, false);

    const pileGeo = new THREE.CylinderGeometry(SITE.net.pileDiameter / 2, SITE.net.pileDiameter / 2, 1, 14);
    const capGeo = new THREE.CylinderGeometry(SITE.net.pileDiameter * 0.62, SITE.net.pileDiameter * 0.62, 0.6, 14);
    // Piles sit behind the mesh (downstream), so the face the bloom slides along has no bump.
    const behind = SITE.net.pileDiameter / 2 + 0.12;
    const manifoldMat = mediumMaterial({ color: 0x3b4a52, roughness: 0.55, metalness: 0.5 });
    this.jetMat = new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 } },
      vertexShader: /* glsl */ `
        varying vec2 vUv;
        varying float vFacing;
        void main() {
          vUv = uv;
          vec4 w = modelMatrix * instanceMatrix * vec4(position, 1.0);
          vec3 n = normalize(mat3(modelMatrix * instanceMatrix) * normal);
          vFacing = abs(dot(n, normalize(cameraPosition - w.xyz)));
          gl_Position = projectionMatrix * viewMatrix * w;
        }
      `,
      fragmentShader: /* glsl */ `
        uniform float uTime;
        varying vec2 vUv;
        varying float vFacing;
        void main() {
          // A faint shimmer of moving water: strongest at the nozzle (v = 1), gone a metre out, soft at
          // its edges (where the cone is seen side-on), with streaks running outward.
          float v = vUv.y;
          float streak = 0.6 + 0.4 * sin(vUv.x * 31.4 + uTime * 2.0) * sin(v * 14.0 + uTime * 20.0);
          float a = pow(v, 1.6) * pow(vFacing, 1.2) * streak;
          gl_FragColor = vec4(vec3(0.7, 0.9, 1.0) * a * 0.34, 1.0);
        }
      `,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
    });
    for (const L of nets) {
      // Piles at every panel joint.
      const count = L.panels + 1;
      const piles = new THREE.InstancedMesh(pileGeo, pileMat, count);
      const caps = new THREE.InstancedMesh(capGeo, capMat, count);
      const top = 4.8;
      for (let i = 0; i < count; i++) {
        const s = i * L.panelLength;
        const x = L.ax + L.tx * s - L.nx * behind;
        const z = L.az + L.tz * s - L.nz * behind;
        _m.compose(_p.set(x, (top - DEPTH - 1) / 2, z), _q.identity(), _s.set(1, top + DEPTH + 1, 1));
        piles.setMatrixAt(i, _m);
        _m.compose(_p.set(x, top, z), _q.identity(), _s.set(1, 1, 1));
        caps.setMatrixAt(i, _m);
      }
      piles.castShadow = true;
      piles.receiveShadow = true;
      piles.userData.pick = 'net';
      caps.castShadow = true;
      caps.userData.pick = 'net';
      this.group.add(piles, caps);

      // Mesh panels: rows top and bottom, COLS columns per panel.
      const verts = (COLS + 1) * 2 * L.panels;
      const positions = new Float32Array(verts * 3);
      const colors = new Float32Array(verts * 3);
      const uvs = new Float32Array(verts * 2);
      const index: number[] = [];
      for (let k = 0; k < L.panels; k++) {
        const base = k * (COLS + 1) * 2;
        for (let c = 0; c <= COLS; c++) {
          const u = ((k + c / COLS) * L.panelLength) / 0.9;
          uvs.set([u, (TOP + DEPTH) / 0.9, u, 0], (base + c * 2) * 2);
          if (c < COLS) {
            const a = base + c * 2;
            index.push(a, a + 1, a + 2, a + 2, a + 1, a + 3);
          }
        }
      }
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3).setUsage(THREE.DynamicDrawUsage));
      geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3).setUsage(THREE.DynamicDrawUsage));
      geometry.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
      geometry.setIndex(index);
      geometry.computeVertexNormals();
      const panels = new THREE.Mesh(geometry, this.panelMat);
      panels.frustumCulled = false;
      panels.renderOrder = 6;
      panels.userData.pick = 'net';
      this.group.add(panels);

      // Float line, one segment per panel.
      const floatGeo = new THREE.CylinderGeometry(0.42, 0.42, 1, 12);
      floatGeo.rotateZ(Math.PI / 2);
      const floats = new THREE.InstancedMesh(floatGeo, floatMat, L.panels);
      floats.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      floats.castShadow = true;
      floats.frustumCulled = false;
      floats.userData.pick = 'net';
      this.group.add(floats);

      // Load lamps on the pile caps.
      const lamps = new THREE.InstancedMesh(new THREE.SphereGeometry(0.34, 10, 8), new THREE.MeshBasicMaterial({ toneMapped: false }), count);
      for (let i = 0; i < count; i++) {
        const s = i * L.panelLength;
        _m.makeTranslation(L.ax + L.tx * s - L.nx * behind, 5.4, L.az + L.tz * s - L.nz * behind);
        lamps.setMatrixAt(i, _m);
        lamps.setColorAt(i, OK);
      }
      lamps.frustumCulled = false;
      this.group.add(lamps);

      // Glow line on the water, widened with distance so the net reads from the air.
      const segs = L.panels;
      const gp = new Float32Array((segs + 1) * 2 * 3);
      const gc = new Float32Array((segs + 1) * 2 * 3);
      const gs = new Float32Array((segs + 1) * 2);
      const gIdx: number[] = [];
      for (let i = 0; i <= segs; i++) {
        const s = (i / segs) * L.length;
        const x = L.ax + L.tx * s;
        const z = L.az + L.tz * s;
        gp.set([x, 1, z, x, 1, z], i * 6);
        gs.set([-1, 1], i * 2);
        if (i < segs) {
          const a = i * 2;
          gIdx.push(a, a + 1, a + 2, a + 2, a + 1, a + 3);
        }
      }
      const gGeo = new THREE.BufferGeometry();
      gGeo.setAttribute('position', new THREE.BufferAttribute(gp, 3));
      gGeo.setAttribute('color', new THREE.BufferAttribute(gc, 3).setUsage(THREE.DynamicDrawUsage));
      gGeo.setAttribute('aSide', new THREE.BufferAttribute(gs, 1));
      gGeo.setIndex(gIdx);
      const glowMat = new THREE.ShaderMaterial({
        uniforms: { uWidth: { value: 3 }, uNormal: { value: new THREE.Vector2(L.nx, L.nz) }, uOpacity: { value: 0.6 } },
        vertexShader: /* glsl */ `
          attribute float aSide;
          attribute vec3 color;
          uniform float uWidth;
          uniform vec2 uNormal;
          varying vec3 vColor;
          varying float vSide;
          void main() {
            vec3 p = position;
            p.xz += uNormal * aSide * uWidth * 0.5;
            vColor = color;
            vSide = aSide;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
          }
        `,
        fragmentShader: /* glsl */ `
          uniform float uOpacity;
          varying vec3 vColor;
          varying float vSide;
          void main() {
            float a = pow(1.0 - abs(vSide), 1.6) * uOpacity;
            gl_FragColor = vec4(vColor * a, 1.0);
          }
        `,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide,
      });
      const glow = new THREE.Mesh(gGeo, glowMat);
      glow.frustumCulled = false;
      glow.renderOrder = 23;
      this.group.add(glow);

      // Jet purge: a manifold along the foot of each panel on the downstream side, with nozzles in two
      // rows aimed back through the mesh. Their spray is drawn only while that panel fires.
      const manifold = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.14, 0.14, 1, 8).rotateZ(Math.PI / 2), manifoldMat, L.panels);
      const jets = new THREE.InstancedMesh(this.jetGeo, this.jetMat, L.panels * JET_ROWS.length * JET_COLS);
      for (let k = 0; k < L.panels; k++) {
        const s = (k + 0.5) * L.panelLength;
        _b.set(L.tx, 0, L.tz);
        _q.setFromUnitVectors(_a, _b);
        _m.compose(_p.set(L.ax + L.tx * s - L.nx * 0.45, -DEPTH + 0.6, L.az + L.tz * s - L.nz * 0.45), _q, _s.set(L.panelLength * 0.92, 1, 1));
        manifold.setMatrixAt(k, _m);
      }
      _m.makeScale(0, 0, 0);
      for (let i = 0; i < jets.count; i++) jets.setMatrixAt(i, _m);
      manifold.userData.pick = 'net';
      jets.frustumCulled = false;
      jets.renderOrder = 22;
      this.group.add(manifold, jets);

      this.parts.push({ jets, jetOn: new Array<boolean>(L.panels).fill(false), geometry, panels, floats, lamps, glow, glowMat });
    }
  }

  pickables(): THREE.Object3D[] {
    return this.group.children.filter((o) => o.userData.pick === 'net');
  }

  update(states: readonly NetState[], time: number, hs: number, engineering: boolean, camera: THREE.Camera, firing?: readonly Float32Array[]): void {
    const N = ASSUMPTIONS.net;
    this.jetMat.uniforms.uTime.value = time;
    for (let ni = 0; ni < this.nets.length; ni++) {
      const L = this.nets[ni];
      const net = states[ni];
      const P = this.parts[ni];
      const active = net.active;
      P.panels.visible = active;
      P.floats.visible = active;
      P.lamps.visible = active;
      P.glow.visible = active;
      if (!active) continue;

      const pos = P.geometry.attributes.position.array as Float32Array;
      const col = P.geometry.attributes.color.array as Float32Array;
      const bowBase = 0.5 + Math.min(1.6, net.head * 40);
      const load = net.head / N.reliefHead;
      for (let k = 0; k < net.n; k++) {
        const drop = net.drop[k];
        // Net A's last panel is left out: the gap passes what A has guided on down the wall to net B.
        const open = (k + 1) * L.panelLength > L.openFrom + 0.01;
        const torn = net.torn[k] === 1 || open;
        const lift = (1 - drop) * (DEPTH + TOP + 3);
        const dip = net.relief[k] * N.reliefDip;
        // Marine growth and biomass tint the mesh.
        const onPanel = Math.min(1, net.bioKg[k] / 1500);
        _c.copy(CLEAN).lerp(FOULED, Math.min(1, net.foul[k] / N.foulMax));
        if (engineering) loadColor(Math.max(load, onPanel), _c);
        const base = k * (COLS + 1) * 2;
        for (let c = 0; c <= COLS; c++) {
          const f = c / COLS;
          const s = (k + f) * L.panelLength;
          const belly = 4 * f * (1 - f);
          const off = -belly * bowBase * (1 + onPanel * 0.6);
          const x = L.ax + L.tx * s + L.nx * off;
          const z = L.az + L.tz * s + L.nz * off;
          const eta = waveElevation(x, z, time, hs * waveExposure(x, z));
          const yTop = (torn ? -DEPTH : eta + TOP - dip - belly * 0.12) + lift;
          const yBot = -DEPTH - 0.1 + lift;
          pos.set([x, yTop, z, x + L.nx * off * 0.4 - L.nx * off, yBot, z + L.nz * off * 0.4 - L.nz * off], (base + c * 2) * 3);
          col.set([_c.r, _c.g, _c.b, _c.r, _c.g, _c.b], (base + c * 2) * 3);
        }

        // Float segment for this panel.
        const s = (k + 0.5) * L.panelLength;
        const x = L.ax + L.tx * s;
        const z = L.az + L.tz * s;
        const eta = waveElevation(x, z, time, hs * waveExposure(x, z));
        const y = torn ? -DEPTH + 0.5 : eta + TOP - dip + lift - 0.05;
        _p.set(x, y, z);
        _b.set(L.tx, 0, L.tz);
        _q.setFromUnitVectors(_a, _b);
        _m.compose(_p, _q, _s.set(open ? 0 : L.panelLength, open ? 0 : 1, open ? 0 : 1));
        P.floats.setMatrixAt(k, _m);
        // Jets firing on this panel: a short cone of spray from each nozzle, out through the mesh.
        const f = firing?.[ni]?.[k] ?? 0;
        const on = f > 0 && !open;
        if (on !== P.jetOn[k]) {
          P.jetOn[k] = on;
          _jq.setFromUnitVectors(_down, _jn.set(L.nx, 0, L.nz));
          let i = k * JET_ROWS.length * JET_COLS;
          for (const y of JET_ROWS) {
            for (let c = 0; c < JET_COLS; c++) {
              const sj = (k + (c + 0.5) / JET_COLS) * L.panelLength;
              if (on) _m.compose(_p.set(L.ax + L.tx * sj - L.nx * 0.35, y, L.az + L.tz * sj - L.nz * 0.35), _jq, _s.set(1, 1, 1));
              else _m.makeScale(0, 0, 0);
              P.jets.setMatrixAt(i++, _m);
            }
          }
          P.jets.instanceMatrix.needsUpdate = true;
        }

        // Lamp and glow colour, by this panel's state.
        const panelLoad = torn ? 1 : Math.max(net.relief[k], load, onPanel * 0.7);
        loadColor(panelLoad, _c);
        P.lamps.setColorAt(k, _c);
      }
      P.geometry.attributes.position.needsUpdate = true;
      P.geometry.attributes.color.needsUpdate = true;
      P.geometry.computeVertexNormals();
      P.floats.instanceMatrix.needsUpdate = true;
      if (P.lamps.instanceColor) P.lamps.instanceColor.needsUpdate = true;

      const gc = P.glow.geometry.attributes.color.array as Float32Array;
      for (let i = 0; i <= net.n; i++) {
        const k = Math.min(net.n - 1, i);
        const onPanel = Math.min(1, net.bioKg[k] / 1500);
        const panelLoad = net.torn[k] ? 1 : Math.max(net.relief[k], load, onPanel * 0.7);
        if (engineering || panelLoad > 0.4) loadColor(panelLoad, _c);
        else _c.setRGB(1, 0.72, 0.28);
        gc.set([_c.r, _c.g, _c.b, _c.r, _c.g, _c.b], i * 6);
      }
      P.glow.geometry.attributes.color.needsUpdate = true;
      const mid = _p.set((L.ax + L.bx) / 2, 0, (L.az + L.bz) / 2);
      const d = camera.position.distanceTo(mid);
      P.glowMat.uniforms.uWidth.value = Math.max(2.5, d * 0.011);
      P.glowMat.uniforms.uOpacity.value = THREE.MathUtils.smoothstep(d, 120, 420) * (engineering ? 0.95 : 0.6) * (ni === 0 ? 1 : 0.75);
    }
  }
}
