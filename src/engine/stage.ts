import * as THREE from 'three'
import { hexToRgb } from './color'
import { EFFECTS, type EffectId, type EffectState } from './effects'
import { FRAME_HEIGHT, fitLogo } from './layout'
import { DEFAULT_STAGE_SETTINGS, type LogoBitmap, type StageSettings } from './types'

const FOV = 28
const CAMERA_DISTANCE = FRAME_HEIGHT / 2 / Math.tan(THREE.MathUtils.degToRad(FOV / 2))
const DEG = Math.PI / 180

const SHADOW_STRENGTH = 0.16
const SHADOW_GAP = 0.035

/*
 * Color pipeline
 * --------------
 * Logo textures are uploaded as SRGB8_ALPHA8 (colorSpace = SRGBColorSpace), so the GPU
 * decodes them to linear for filtering and mipmapping. Every shader here re-encodes to
 * sRGB itself and writes that straight into an 8-bit target; blending then happens on
 * sRGB values, which is how browsers and image editors composite a PNG over a background.
 * No tone mapping and no lighting touch the colors, so an opaque logo pixel comes out
 * with exactly the value it had in the file.
 */
const SRGB_ENCODE = /* glsl */ `
  vec3 linearToSrgb(vec3 c) {
    c = clamp(c, 0.0, 1.0);
    return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(vec3(0.0031308), c));
  }
`

/** Full-screen quad in clip space; ignores the camera. */
const FULLSCREEN_VERT = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position.xy * 2.0, 0.0, 1.0);
  }
`

const MESH_VERT = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`

const BACKGROUND_FRAG = /* glsl */ `
  uniform vec3 color;
  void main() { gl_FragColor = vec4(color, 1.0); }
`

const LOGO_FRAG = /* glsl */ `
  uniform sampler2D map;
  uniform float opacity;
  varying vec2 vUv;
  ${SRGB_ENCODE}
  void main() {
    // Bitmaps are stored top row first, so flip V instead of re-uploading flipped.
    vec4 tex = texture2D(map, vec2(vUv.x, 1.0 - vUv.y));
    gl_FragColor = vec4(linearToSrgb(tex.rgb), tex.a * opacity);
  }
`

const SHADOW_FRAG = /* glsl */ `
  uniform float strength;
  varying vec2 vUv;
  void main() {
    vec2 d = (vUv - 0.5) * 2.0;
    float falloff = exp(-4.0 * dot(d, d));
    gl_FragColor = vec4(0.0, 0.0, 0.0, strength * falloff * (1.0 - smoothstep(0.8, 1.0, length(d))));
  }
`

/** Box-filters the supersampled scene down to the canvas, byte for byte when ss = 1. */
const RESOLVE_FRAG = /* glsl */ `
  uniform sampler2D source;
  varying vec2 vUv;
  void main() { gl_FragColor = texture2D(source, vUv); }
`

export interface StageOptions {
  /** Keep the canvas contents after compositing (needed to read frames back for export). */
  preserveDrawingBuffer?: boolean
}

/**
 * Owns the Three.js scene for one logo. Everything visible is a function of the logo,
 * the settings and the time passed to renderFrame(t) — nothing depends on wall-clock time.
 */
export class LogoStage {
  readonly renderer: THREE.WebGLRenderer
  private readonly scene = new THREE.Scene()
  private readonly camera = new THREE.PerspectiveCamera(FOV, 16 / 9, 0.1, 100)
  private readonly resolveScene = new THREE.Scene()
  private readonly resolveCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1)

  private readonly background: THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial>
  private readonly logo: THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial>
  private readonly shadow: THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial>
  private readonly resolveMaterial: THREE.ShaderMaterial

  private target: THREE.WebGLRenderTarget | null = null
  private texture: THREE.DataTexture | null = null
  private logoAspect = 1
  private width = 0
  private height = 0

  private settings: StageSettings = DEFAULT_STAGE_SETTINGS
  private effect: EffectId = 'swing'

  constructor(canvas: HTMLCanvasElement | OffscreenCanvas, options: StageOptions = {}) {
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: false, // handled by our own supersampled/multisampled target
      alpha: false,
      depth: false,
      stencil: false,
      premultipliedAlpha: false,
      preserveDrawingBuffer: options.preserveDrawingBuffer ?? false,
      powerPreference: 'high-performance',
    })
    this.renderer.setPixelRatio(1)
    this.renderer.outputColorSpace = THREE.SRGBColorSpace
    this.renderer.toneMapping = THREE.NoToneMapping
    this.renderer.autoClear = false

    this.camera.position.set(0, 0, CAMERA_DISTANCE)

    const quad = new THREE.PlaneGeometry(1, 1)
    const flat = { depthTest: false, depthWrite: false }

    this.background = new THREE.Mesh(
      quad,
      new THREE.ShaderMaterial({
        ...flat,
        vertexShader: FULLSCREEN_VERT,
        fragmentShader: BACKGROUND_FRAG,
        uniforms: { color: { value: new THREE.Vector3(1, 1, 1) } },
      }),
    )
    this.background.frustumCulled = false
    this.background.renderOrder = 0

    this.shadow = new THREE.Mesh(
      quad,
      new THREE.ShaderMaterial({
        ...flat,
        transparent: true,
        vertexShader: MESH_VERT,
        fragmentShader: SHADOW_FRAG,
        uniforms: { strength: { value: 0 } },
      }),
    )
    this.shadow.renderOrder = 1

    this.logo = new THREE.Mesh(
      quad,
      new THREE.ShaderMaterial({
        ...flat,
        transparent: true,
        vertexShader: MESH_VERT,
        fragmentShader: LOGO_FRAG,
        uniforms: { map: { value: null }, opacity: { value: 1 } },
      }),
    )
    this.logo.renderOrder = 2
    this.logo.visible = false

    this.scene.add(this.background, this.shadow, this.logo)

    this.resolveMaterial = new THREE.ShaderMaterial({
      ...flat,
      vertexShader: FULLSCREEN_VERT,
      fragmentShader: RESOLVE_FRAG,
      uniforms: { source: { value: null } },
    })
    const resolveQuad = new THREE.Mesh(quad, this.resolveMaterial)
    resolveQuad.frustumCulled = false
    this.resolveScene.add(resolveQuad)

    this.setSettings(this.settings)
  }

  /** Output size in device pixels. */
  setSize(width: number, height: number): void {
    width = Math.max(1, Math.round(width))
    height = Math.max(1, Math.round(height))
    if (width === this.width && height === this.height) return
    this.width = width
    this.height = height
    this.renderer.setSize(width, height, false)
    this.camera.aspect = width / height
    this.camera.updateProjectionMatrix()
    this.rebuildTarget()
  }

  setSettings(settings: StageSettings): void {
    this.settings = settings
    this.background.material.uniforms.color.value.fromArray(hexToRgb(settings.background))
  }

  setEffect(effect: EffectId): void {
    this.effect = effect
  }

  setLogo(bitmap: LogoBitmap | null): void {
    this.texture?.dispose()
    this.texture = null
    this.logo.visible = bitmap !== null
    this.logo.material.uniforms.map.value = null
    if (!bitmap) return

    const texture = new THREE.DataTexture(
      new Uint8Array(bitmap.data.buffer, bitmap.data.byteOffset, bitmap.data.byteLength),
      bitmap.width,
      bitmap.height,
      THREE.RGBAFormat,
      THREE.UnsignedByteType,
    )
    texture.colorSpace = THREE.SRGBColorSpace
    texture.flipY = false
    texture.generateMipmaps = true
    texture.minFilter = THREE.LinearMipmapLinearFilter
    texture.magFilter = THREE.LinearFilter
    texture.wrapS = texture.wrapT = THREE.ClampToEdgeWrapping
    texture.anisotropy = this.renderer.capabilities.getMaxAnisotropy()
    texture.needsUpdate = true

    this.texture = texture
    this.logoAspect = bitmap.width / bitmap.height
    this.logo.material.uniforms.map.value = texture
  }

  /** Draws the exact state of the scene at clip time `t` (seconds). */
  renderFrame(t: number): void {
    this.applyState(EFFECTS[this.effect].evaluate(t))
    this.draw()
  }

  dispose(): void {
    this.texture?.dispose()
    this.target?.dispose()
    this.logo.geometry.dispose()
    for (const mesh of [this.background, this.logo, this.shadow]) mesh.material.dispose()
    this.resolveMaterial.dispose()
    this.renderer.dispose()
  }

  private applyState(state: EffectState): void {
    const { width, height } = fitLogo(this.logoAspect, this.camera.aspect)
    const w = width * state.scale
    const h = height * state.scale

    this.logo.scale.set(w, h, 1)
    this.logo.rotation.set(state.rotX * DEG, state.rotY * DEG, 0)
    this.logo.material.uniforms.opacity.value = state.opacity

    // Contact shadow: shrinks and fades as the logo turns away from the camera.
    const facing = Math.abs(Math.cos(state.rotY * DEG) * Math.cos(state.rotX * DEG))
    this.shadow.visible = this.settings.shadow && this.logo.visible
    this.shadow.scale.set(w * (0.55 + 0.35 * facing), Math.max(h * 0.12, 0.03 * state.scale), 1)
    this.shadow.position.set(0, -h / 2 - SHADOW_GAP * state.scale, 0)
    this.shadow.material.uniforms.strength.value = SHADOW_STRENGTH * state.opacity * facing ** 2
  }

  private draw(): void {
    if (!this.target) return
    this.renderer.setRenderTarget(this.target)
    this.renderer.render(this.scene, this.camera)
    this.renderer.setRenderTarget(null)
    this.renderer.render(this.resolveScene, this.resolveCamera)
  }

  private rebuildTarget(): void {
    // 2x supersampling up to 1080p; above that MSAA only, to stay within GPU limits.
    const supersample = this.height <= 1080 ? 2 : 1
    const maxSize = this.renderer.capabilities.maxTextureSize
    const scale = Math.min(supersample, maxSize / this.width, maxSize / this.height)

    this.target?.dispose()
    this.target = new THREE.WebGLRenderTarget(
      Math.round(this.width * scale),
      Math.round(this.height * scale),
      {
        type: THREE.UnsignedByteType,
        format: THREE.RGBAFormat,
        colorSpace: THREE.NoColorSpace,
        depthBuffer: false,
        stencilBuffer: false,
        generateMipmaps: false,
        minFilter: THREE.LinearFilter,
        magFilter: THREE.LinearFilter,
        samples: supersample > 1 ? 0 : 4,
      },
    )
    this.resolveMaterial.uniforms.source.value = this.target.texture
  }
}
