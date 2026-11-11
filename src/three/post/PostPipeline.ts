import * as THREE from 'three';
import { BloomEffect, EffectComposer, EffectPass, LUT3DEffect, RenderPass, SMAAEffect, SMAAPreset, VignetteEffect } from 'postprocessing';
import { N8AOPostPass } from 'n8ao';
import { GradeEffect } from './GradeEffect';
import { createLookLUT } from './lookLut';
import { SanitizeEffect } from './SanitizeEffect';
import { UnderwaterEffect } from './UnderwaterEffect';

/** A viewport on the canvas in CSS pixels, origin bottom-left (as WebGLRenderer.setViewport). */
export interface ViewRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Per-view inputs that steer the camera-dependent effects. */
export interface ViewState {
  underwater: boolean;
  /** Camera distance to its orbit target (m). */
  targetDistance: number;
  /** Angle of the view direction below the horizon (degrees). */
  pitchDeg: number;
  /** World point the underwater view looks at. */
  focus: THREE.Vector3;
}

/**
 * Pixels rendered per frame on very large high-DPI screens before the extra device pixels are given
 * up. The view is never drawn below one pixel per CSS pixel, so it is never upscaled and never soft:
 * this only trims the extra density of a 4K or Retina panel.
 */
const PIXEL_BUDGET = 8.3e6;

/**
 * Post-processing for the 3D view (pmndrs/postprocessing + N8AO):
 *
 *   scene (HDR, 2× MSAA) → ambient occlusion → sanitize (no NaN / ∞)
 *     → [above water] bloom · grade · LUT · vignette
 *     → [underwater]  light shafts + wobble → bloom · grade · LUT · vignette
 *     → SMAA → canvas
 *
 * Nothing in the chain blurs the picture: no tilt-shift, no depth of field, and the internal
 * resolution never drops below the canvas's CSS size.
 *
 * Each view (the single view, or each half of Compare) runs the whole chain at its own size into
 * its own viewport, so depth-based effects always see the projection they were rendered with.
 * The grade replaces renderer tone mapping: everything upstream stays linear HDR.
 */
export class PostPipeline {
  readonly composer: EffectComposer;
  readonly ao: N8AOPostPass;
  readonly underwater: UnderwaterEffect;
  private readonly abovePass: EffectPass;
  private readonly shaftPass: EffectPass;
  private readonly underPass: EffectPass;
  private readonly renderer: THREE.WebGLRenderer;
  private width = 0;
  private height = 0;
  /** Called with the (sized) scene target before each view renders, outside any render call. */
  beforeRender: ((sceneTarget: THREE.WebGLRenderTarget) => void) | null = null;

  constructor(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.PerspectiveCamera, sun: THREE.DirectionalLight) {
    this.renderer = renderer;
    // 2× MSAA: SMAA at the end takes the remaining edges, at half the scene-pass cost of 4×.
    const samples = Math.min(2, renderer.capabilities.maxSamples);
    this.composer = new EffectComposer(renderer, { frameBufferType: THREE.HalfFloatType, multisampling: samples });
    this.composer.autoRenderToScreen = true;

    this.composer.addPass(new RenderPass(scene, camera));

    // Contact shadows where structures meet the ground, the revetment and the water line.
    this.ao = new N8AOPostPass(scene, camera, 512, 512);
    this.ao.configuration.transparencyAware = false;
    this.ao.autoDetectTransparency = false;
    this.ao.configuration.halfRes = true;
    this.ao.configuration.gammaCorrection = false;
    this.ao.setQualityMode('Medium');
    this.ao.configuration.intensity = 2.4;
    this.ao.configuration.distanceFalloff = 1.0;
    this.ao.configuration.color = new THREE.Color(0x0b1820);
    this.composer.addPass(this.ao);

    // No stray NaN / infinite pixel reaches the blur and bloom passes, which would spread it over the frame.
    this.composer.addPass(new EffectPass(camera, new SanitizeEffect()));

    const bloom = () =>
      new BloomEffect({ mipmapBlur: true, luminanceThreshold: 0.95, luminanceSmoothing: 0.35, intensity: 0.7, radius: 0.72 });
    const look = createLookLUT();
    const lut = () => new LUT3DEffect(look, { tetrahedralInterpolation: true });
    const vignette = () => new VignetteEffect({ offset: 0.32, darkness: 0.42 });

    this.abovePass = new EffectPass(camera, bloom(), new GradeEffect(), lut(), vignette());
    this.abovePass.dithering = true;
    this.composer.addPass(this.abovePass);

    // Underwater: light shafts and wobble first, then the same look as above water.
    this.underwater = new UnderwaterEffect(camera, sun);
    this.shaftPass = new EffectPass(camera, this.underwater);
    this.shaftPass.enabled = false;
    this.composer.addPass(this.shaftPass);
    this.underPass = new EffectPass(camera, bloom(), new GradeEffect(), lut(), vignette());
    this.underPass.dithering = true;
    this.underPass.enabled = false;
    this.composer.addPass(this.underPass);

    this.composer.addPass(new EffectPass(camera, new SMAAEffect({ preset: SMAAPreset.HIGH })));
  }

  /** The multisampled HDR target the scene is rendered into (read back by the water for refraction). */
  get sceneTarget(): THREE.WebGLRenderTarget {
    return this.composer.inputBuffer;
  }

  /**
   * Share of the extra high-DPI density drawn (0..1): 1 draws every device pixel, 0 one pixel per
   * CSS pixel. SceneManager lowers it when frames run long on a slower GPU and raises it again when
   * there is headroom. It never goes below one pixel per CSS pixel, so the view never turns soft.
   */
  renderScale = 1;

  /** Size every buffer for a view of `width × height` device pixels (no-op if unchanged). */
  private setSize(width: number, height: number): void {
    if (width === this.width && height === this.height) return;
    this.width = width;
    this.height = height;
    // EffectComposer.setSize() would also resize the canvas, so mirror it here for the view size.
    this.composer.inputBuffer.setSize(width, height);
    this.composer.outputBuffer.setSize(width, height);
    (this.composer as unknown as { depthRenderTarget: THREE.WebGLRenderTarget | null }).depthRenderTarget?.setSize(width, height);
    for (const pass of this.composer.passes) pass.setSize(width, height);
  }

  /**
   * Internal render size of a view: its drawing-buffer size, scaled down when the frame would
   * exceed the pixel budget (large high-DPI windows); the final pass upsamples to the canvas.
   * `share` is this view's fraction of the frame (½ for each Compare half).
   */
  viewSize(rect: ViewRect, share = 1): [number, number] {
    const pr = this.renderer.getPixelRatio();
    // Density drawn: between one pixel per CSS pixel and the full device ratio.
    let k = 1 + (pr - 1) * Math.min(1, Math.max(0, this.renderScale));
    // A very large high-DPI view gives up density above the budget, never below 1.
    const css = Math.max(1, rect.width * rect.height);
    k = Math.max(1, Math.min(k, Math.sqrt((PIXEL_BUDGET * share) / css)));
    return [Math.max(1, Math.round(rect.width * k)), Math.max(1, Math.round(rect.height * k))];
  }

  /** Steer the camera-dependent effects for the view about to be rendered. */
  configure(view: ViewState): void {
    this.abovePass.enabled = !view.underwater;
    this.shaftPass.enabled = view.underwater;
    this.underPass.enabled = view.underwater;
    // AO radius follows the viewing scale: tight contact shadows up close, broader from the air.
    this.ao.configuration.aoRadius = Math.min(6, Math.max(0.6, view.targetDistance * 0.022));
  }

  /** Render the scene through the chain into one viewport of the canvas. */
  render(rect: ViewRect, dt: number, share = 1): void {
    const [w, h] = this.viewSize(rect, share);
    this.setSize(w, h);
    this.beforeRender?.(this.composer.inputBuffer);
    const r = this.renderer;
    r.setViewport(rect.x, rect.y, rect.width, rect.height);
    r.setScissor(rect.x, rect.y, rect.width, rect.height);
    r.setScissorTest(true);
    this.composer.render(dt);
    r.setScissorTest(false);
  }

  dispose(): void {
    this.composer.dispose();
  }
}
