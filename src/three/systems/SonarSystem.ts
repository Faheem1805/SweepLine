import * as THREE from 'three';
import { ASSUMPTIONS } from '../../config/assumptions';
import { SITE } from '../../config/site';
import { SHARED } from '../environment/shaderChunks';

const R = ASSUMPTIONS.sonar.range;

/**
 * The near-field sonar at the channel mouth, drawn on the water: a rotating sweep with range rings.
 * It is what still sees the bloom at night or in turbid water, so it comes up in those conditions and
 * in the engineering view.
 */
export class SonarSystem {
  readonly mesh: THREE.Mesh;
  private readonly mat: THREE.ShaderMaterial;
  private strength = 0;

  constructor() {
    this.mat = new THREE.ShaderMaterial({
      uniforms: { uTime: SHARED.uTime, uStrength: { value: 0 }, uPeriod: { value: ASSUMPTIONS.sonar.period } },
      vertexShader: /* glsl */ `
        varying vec2 vUv;
        void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
      `,
      fragmentShader: /* glsl */ `
        uniform float uTime;
        uniform float uStrength;
        uniform float uPeriod;
        varying vec2 vUv;
        void main() {
          vec2 p = (vUv - 0.5) * 2.0;
          float r = length(p);
          if (r > 1.0) discard;
          float a = atan(p.y, p.x) / 6.2831853 + 0.5;
          // A wedge sweeping round, trailing off behind its leading edge.
          float s = fract(a - uTime / uPeriod);
          float wedge = pow(1.0 - s, 7.0) * 0.5;
          float rings = smoothstep(0.012, 0.0, abs(fract(r * 4.0) - 0.5) - 0.48) * 0.12;
          float rim = smoothstep(0.012, 0.0, abs(r - 0.985)) * 0.5;
          float fade = smoothstep(1.0, 0.72, r);
          float v = (wedge * fade + rings + rim) * uStrength;
          gl_FragColor = vec4(vec3(0.25, 0.95, 0.75) * v, 1.0);
        }
      `,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(R * 2, R * 2).rotateX(-Math.PI / 2), this.mat);
    this.mesh.position.set(0, 0.9, SITE.channel.mouthZ);
    this.mesh.renderOrder = 19;
    this.mesh.name = 'sonar';
  }

  update(on: boolean, dt: number): void {
    this.strength += ((on ? 1 : 0) - this.strength) * Math.min(1, dt * 2);
    this.mat.uniforms.uStrength.value = this.strength;
    this.mesh.visible = this.strength > 0.01;
  }
}
