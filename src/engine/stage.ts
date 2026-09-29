import * as THREE from 'three'
import { lerp, smoothstep } from './easings'
import { hexToRgb } from './color'
import { directionVector, type EffectState, type Reveal, type ShineState } from './effects'
import { solidity, type FinishSpec } from './finish'
import { FRAME_HEIGHT, normalizedLogoSize } from './layout'
import { pairClouds, random, sampleParticles, type ParticleCloud, type ParticlePairing } from './particles'
import {
  ASSEMBLY_VERT,
  BACKGROUND_FRAG,
  EXTRUDE_FRAG,
  EXTRUDE_VERT,
  FULLSCREEN_VERT,
  LIQUID_FRAG,
  LOGO_FRAG,
  MESH_VERT,
  PARTICLE_FRAG,
  RESOLVE_FRAG,
  REVEAL_KIND,
  SHADOW_FRAG,
  SHINE_STYLE,
  SWARM_VERT,
} from './shaders'
import { shineReach } from './shine'
import { programAt, segmentItems, type Draw, type Frame, type LogoLayer, type Program, type Segment } from './timeline'
import { liquidAt } from './transitions'
import { DEFAULT_STAGE_SETTINGS, type StageLogo, type StageSettings } from './types'

const FOV = 28
const CAMERA_DISTANCE = FRAME_HEIGHT / 2 / Math.tan(THREE.MathUtils.degToRad(FOV / 2))
const DEG = Math.PI / 180

const SHADOW_STRENGTH = 0.16
const SHADOW_GAP = 0.035

/** Particle dot diameter relative to the spacing between particles: slightly overlapping. */
const DOT_SCALE = 1.35
/** Stacked silhouettes that make up an emblem's thickness. */
const EXTRUSION_SLICES = 28

/** Softness of the sweep transition's line, in frame heights. */
const SWEEP_SOFTNESS = 0.045

/** GPU texture for one logo, plus what's needed to size its quad. */
interface LogoTexture {
  texture: THREE.DataTexture
  width: number
  height: number
  /** Content aspect ratio (without padding). */
  aspect: number
  /** Full texture size relative to its content, per axis (≥ 1 because of the padding). */
  paddingScale: { x: number; y: number }
  /** The padding as a fraction of the texture, per axis. */
  padUv: { x: number; y: number }
}

/** A logo layer's texture and on-screen content size (world units) for a given state. */
interface Placement {
  tex: LogoTexture
  width: number
  height: number
}

interface CloudGeometry {
  cloud: ParticleCloud
  geometry: THREE.BufferGeometry
}

interface PairGeometry {
  pairing: ParticlePairing
  geometry: THREE.BufferGeometry
}

type LayerMesh = THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial>
type ParticlePoints = THREE.Points<THREE.BufferGeometry, THREE.ShaderMaterial>

/** Small LRU: the least recently used entry is disposed when it overflows. */
class Cache<K, V> {
  private readonly entries = new Map<K, V>()
  private readonly size: number
  private readonly release: (value: V) => void

  constructor(size: number, release: (value: V) => void) {
    this.size = size
    this.release = release
  }

  get(key: K, create: () => V): V {
    const hit = this.entries.get(key)
    if (hit !== undefined) {
      this.entries.delete(key)
      this.entries.set(key, hit)
      return hit
    }
    const value = create()
    this.entries.set(key, value)
    while (this.entries.size > this.size) {
      const [oldest, old] = this.entries.entries().next().value!
      this.release(old)
      this.entries.delete(oldest)
    }
    return value
  }

  clear(): void {
    for (const value of this.entries.values()) this.release(value)
    this.entries.clear()
  }
}

/** Four deterministic random numbers per particle. */
function seeds(count: number, seed: number): Float32Array {
  const rand = random(seed)
  return Float32Array.from({ length: count * 4 }, rand)
}

/** How much of the logo a reveal shows, roughly (for the contact shadow). */
function revealCoverage(reveal: Reveal | null): number {
  if (!reveal) return 1
  if (reveal.kind === 'sweep') return reveal.keep === 'ahead' ? 1 - reveal.progress : reveal.progress
  return reveal.progress
}

/** EXTRUSION_SLICES unit quads, back to front, each tagged with its depth (1 = back). */
function extrusionGeometry(): THREE.BufferGeometry {
  const positions: number[] = []
  const uvs: number[] = []
  const slices: number[] = []
  const indices: number[] = []
  for (let i = 0; i < EXTRUSION_SLICES; i++) {
    const depth = 1 - i / EXTRUSION_SLICES
    const base = i * 4
    positions.push(-0.5, -0.5, 0, 0.5, -0.5, 0, 0.5, 0.5, 0, -0.5, 0.5, 0)
    uvs.push(0, 0, 1, 0, 1, 1, 0, 1)
    slices.push(depth, depth, depth, depth)
    indices.push(base, base + 1, base + 2, base, base + 2, base + 3)
  }
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2))
  geometry.setAttribute('slice', new THREE.Float32BufferAttribute(slices, 1))
  geometry.setIndex(indices)
  return geometry
}

export interface StageOptions {
  /** Keep the canvas contents after compositing (needed to read frames back for export). */
  preserveDrawingBuffer?: boolean
}

/**
 * Owns the Three.js scene. Everything visible is a function of the logos, the settings,
 * the program and the time passed to renderFrame(t) — nothing depends on wall-clock time,
 * so the preview and the exported video are the same frames.
 */
export class LogoStage {
  readonly renderer: THREE.WebGLRenderer
  private readonly scene = new THREE.Scene()
  private readonly camera = new THREE.PerspectiveCamera(FOV, 16 / 9, 0.1, 100)
  private readonly resolveScene = new THREE.Scene()
  private readonly resolveCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1)

  private readonly background: LayerMesh
  /** Two of each: a transition shows two logos at once. */
  private readonly layers: LayerMesh[]
  /** Floor reflections and emblem bodies, one per layer. */
  private readonly reflections: LayerMesh[]
  private readonly extrusions: LayerMesh[]
  private readonly mirror = new THREE.Matrix4()
  private readonly shadows: LayerMesh[]
  private readonly liquid: LayerMesh
  private readonly assembly: ParticlePoints
  private readonly swarm: ParticlePoints
  private readonly resolveMaterial: THREE.ShaderMaterial
  private readonly placer = new THREE.Object3D()

  private target: THREE.WebGLRenderTarget | null = null
  private width = 0
  private height = 0

  /** Two logos of a transition plus the next one being prepared, and a spare. */
  private readonly textures = new Cache<StageLogo, LogoTexture>(4, (t) => t.texture.dispose())
  private readonly clouds = new Cache<StageLogo, CloudGeometry>(3, (c) => c.geometry.dispose())
  private readonly pairs = new Cache<string, PairGeometry>(2, (p) => p.geometry.dispose())
  private readonly ids = new WeakMap<StageLogo, number>()
  private nextId = 1

  private settings: StageSettings = DEFAULT_STAGE_SETTINGS
  private program: Program<StageLogo> = { items: [], segments: [], length: 0 }

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
    const mesh = (fragmentShader: string, uniforms: Record<string, THREE.IUniform>, vertexShader = MESH_VERT) =>
      new THREE.Mesh(
        quad,
        new THREE.ShaderMaterial({ ...flat, transparent: true, vertexShader, fragmentShader, uniforms }),
      )

    this.background = mesh(BACKGROUND_FRAG, { color: { value: new THREE.Vector3(1, 1, 1) } }, FULLSCREEN_VERT)
    this.background.material.transparent = false
    this.background.frustumCulled = false
    this.background.renderOrder = 0

    this.shadows = [0, 1].map(() => {
      const shadow = mesh(SHADOW_FRAG, { strength: { value: 0 } })
      shadow.renderOrder = 1
      return shadow
    })

    const logoUniforms = () => ({
      map: { value: null },
      texSize: { value: new THREE.Vector2(1, 1) },
      uvScale: { value: new THREE.Vector2(1, 1) },
      pad: { value: new THREE.Vector2() },
      aspect: { value: 1 },
      opacity: { value: 1 },
      flash: { value: 0 },
      blurRadius: { value: new THREE.Vector2() },
      smear: { value: new THREE.Vector2() },
      revealKind: { value: 0 },
      revealA: { value: new THREE.Vector4() },
      revealB: { value: new THREE.Vector4() },
      shine: { value: new THREE.Vector4(0, 1, 0, 0) },
      shineDir: { value: new THREE.Vector2(1, 0) },
      emblem: { value: new THREE.Vector4() },
      mirror: { value: 0 },
    })
    this.layers = [0, 1].map(() => mesh(LOGO_FRAG, logoUniforms()))
    this.reflections = [0, 1].map(() => {
      const reflection = mesh(LOGO_FRAG, logoUniforms())
      // Mirrored, so its triangles face away; its matrix is set by hand.
      reflection.material.side = THREE.DoubleSide
      reflection.matrixAutoUpdate = false
      return reflection
    })
    const slices = extrusionGeometry()
    this.extrusions = [0, 1].map(
      () =>
        new THREE.Mesh(
          slices,
          new THREE.ShaderMaterial({
            ...flat,
            transparent: true,
            side: THREE.DoubleSide,
            vertexShader: EXTRUDE_VERT,
            fragmentShader: EXTRUDE_FRAG,
            uniforms: {
              map: { value: null },
              texSize: { value: new THREE.Vector2(1, 1) },
              opacity: { value: 1 },
              thickness: { value: 0 },
              emblem: { value: new THREE.Vector4() },
            },
          }),
        ) as unknown as LayerMesh,
    )

    this.liquid = mesh(LIQUID_FRAG, {
      mapA: { value: null },
      mapB: { value: null },
      texSizeA: { value: new THREE.Vector2(1, 1) },
      texSizeB: { value: new THREE.Vector2(1, 1) },
      rectA: { value: new THREE.Vector4() },
      rectB: { value: new THREE.Vector4() },
      padA: { value: new THREE.Vector2() },
      padB: { value: new THREE.Vector2() },
      aspectA: { value: 1 },
      aspectB: { value: 1 },
      blurA: { value: new THREE.Vector2() },
      blurB: { value: new THREE.Vector2() },
      opacityA: { value: 1 },
      opacityB: { value: 1 },
      shineA: { value: new THREE.Vector4(0, 1, 0, 0) },
      shineB: { value: new THREE.Vector4(0, 1, 0, 0) },
      shineDirA: { value: new THREE.Vector2(1, 0) },
      shineDirB: { value: new THREE.Vector2(1, 0) },
      mixAmount: { value: 0 },
      goo: { value: 0 },
    })

    const points = (vertexShader: string, uniforms: Record<string, THREE.IUniform>): ParticlePoints => {
      const object = new THREE.Points(
        new THREE.BufferGeometry(),
        new THREE.ShaderMaterial({ ...flat, transparent: true, vertexShader, fragmentShader: PARTICLE_FRAG, uniforms }),
      )
      object.frustumCulled = false
      return object
    }
    this.assembly = points(ASSEMBLY_VERT, {
      progress: { value: 0 },
      direction: { value: new THREE.Vector2(1, 0) },
      spread: { value: 1 },
      aspect: { value: 1 },
      dotSize: { value: 0.01 },
      pixelScale: { value: 1 },
    })
    this.swarm = points(SWARM_VERT, {
      matrixA: { value: new THREE.Matrix4() },
      matrixB: { value: new THREE.Matrix4() },
      progress: { value: 0 },
      dotA: { value: 0.01 },
      dotB: { value: 0.01 },
      pixelScale: { value: 1 },
    })

    this.scene.add(
      this.background,
      ...this.shadows,
      ...this.reflections,
      ...this.extrusions,
      ...this.layers,
      this.liquid,
      this.assembly,
      this.swarm,
    )
    this.hideAll()

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

  /** What to play: one logo's clip, or several with transitions. */
  setProgram(program: Program<StageLogo>): void {
    this.program = program
  }

  /** Draws the exact state of the scene at program time `t` (seconds). */
  renderFrame(t: number): void {
    this.hideAll()
    const frame = programAt(this.program, t)
    if (frame) {
      this.drawFrame(frame.draws)
      this.prepareAhead(frame)
    }
    this.draw()
  }

  dispose(): void {
    this.textures.clear()
    this.clouds.clear()
    this.pairs.clear()
    this.target?.dispose()
    this.background.geometry.dispose()
    for (const object of [
      this.background,
      ...this.layers,
      ...this.reflections,
      ...this.extrusions,
      ...this.shadows,
      this.liquid,
      this.assembly,
      this.swarm,
    ]) {
      object.material.dispose()
    }
    this.extrusions[0].geometry.dispose()
    this.assembly.geometry.dispose()
    this.swarm.geometry.dispose()
    this.resolveMaterial.dispose()
    this.renderer.dispose()
    // Release the WebGL context now instead of waiting for garbage collection: browsers
    // allow ~16 live contexts and, past that, kill the oldest one (the preview's).
    this.renderer.forceContextLoss()
  }

  /** Fires once if the GPU context is lost (driver reset, too many contexts…). */
  onContextLost(callback: () => void): () => void {
    const canvas = this.renderer.domElement
    canvas.addEventListener('webglcontextlost', callback)
    return () => canvas.removeEventListener('webglcontextlost', callback)
  }

  // ─── Drawing ──────────────────────────────────────────────────────────────

  private hideAll(): void {
    for (const object of [
      ...this.layers,
      ...this.reflections,
      ...this.extrusions,
      ...this.shadows,
      this.liquid,
      this.assembly,
      this.swarm,
    ]) {
      object.visible = false
    }
  }

  private drawFrame(draws: Draw[]): void {
    const sweep = this.sweepSpan(draws)
    let layers = 0
    let shadows = 0
    let order = 10
    for (const draw of draws) {
      order += 2
      switch (draw.kind) {
        case 'logo': {
          const place = this.placeLayer(draw)
          const { state } = draw
          if (state.opacity > 0 && layers < this.layers.length) {
            this.drawLogo(layers++, place, state, sweep, order, this.finishOf(draw.item))
          }
          if (shadows < this.shadows.length) this.drawShadow(this.shadows[shadows++], place, state, 1)
          if (state.particles) this.drawAssembly(this.program.items[draw.item].logo, place, state, order + 1)
          break
        }
        case 'liquid': {
          const mix = this.drawLiquid(draw.from, draw.to, draw.progress, order)
          this.drawShadow(this.shadows[shadows++], this.placeLayer(draw.from), draw.from.state, 1 - mix)
          this.drawShadow(this.shadows[shadows++], this.placeLayer(draw.to), draw.to.state, mix)
          // The liquid shape is flat: a logo with a finish (emblem, reflection) melts into it
          // and emerges from it with a quick crossfade instead of switching look abruptly.
          const ends = [
            { layer: draw.from, weight: 1 - smoothstep(0, 0.15, draw.progress) },
            { layer: draw.to, weight: smoothstep(0.85, 1, draw.progress) },
          ]
          ends.forEach(({ layer, weight }, slot) => {
            const finish = this.finishOf(layer.item)
            if (!finish || weight <= 0) return
            const state = { ...layer.state, opacity: layer.state.opacity * weight }
            this.drawLogo(slot, this.placeLayer(layer), state, null, order + 1 + slot, finish)
          })
          break
        }
        case 'swarm':
          this.drawSwarm(draw.from, draw.to, draw.progress, order)
          break
      }
    }
  }

  private placeLayer({ item, state }: LogoLayer): Placement {
    const { logo, scale } = this.program.items[item]
    const tex = this.textureFor(logo)
    const size = normalizedLogoSize(tex.aspect, this.camera.aspect)
    return { tex, width: size.width * scale * state.scale, height: size.height * scale * state.scale }
  }

  private finishOf(item: number): FinishSpec | null {
    return this.program.items[item].animation.finish
  }

  /** One logo layer in `slot`: its face, plus the emblem's body and the floor reflection. */
  private drawLogo(
    slot: number,
    place: Placement,
    state: EffectState,
    sweep: SweepSpan | null,
    order: number,
    finish: FinishSpec | null,
  ): void {
    const face = this.layers[slot]
    this.drawLayer(face, place, state, sweep, order, finish)
    if (!finish) return

    if (finish.reflection > 0) {
      const reflection = this.reflections[slot]
      this.drawLayer(reflection, place, state, sweep, order - 1.5, finish)
      reflection.material.uniforms.mirror.value = finish.reflection
      // Mirror the whole layer across the floor the contact shadow sits on.
      const floor = -place.height / 2 - SHADOW_GAP * state.scale
      this.mirror.makeScale(1, -1, 1).setPosition(0, 2 * floor, 0)
      reflection.updateMatrix()
      reflection.matrix.premultiply(this.mirror)
    }

    const body = finish.emblem ? solidity(state) : 0
    if (body > 0 && finish.depth > 0) {
      const { tex, width: w, height: h } = place
      const extrusion = this.extrusions[slot]
      extrusion.visible = true
      extrusion.renderOrder = order - 0.5
      extrusion.position.set(state.x, state.y, state.z)
      extrusion.rotation.set(state.rotX * DEG, state.rotY * DEG, state.rotZ * DEG)
      extrusion.scale.set(w * tex.paddingScale.x, h * tex.paddingScale.y, 1)
      const u = extrusion.material.uniforms
      u.map.value = tex.texture
      u.texSize.value.set(tex.width, tex.height)
      u.opacity.value = body
      u.thickness.value = finish.depth * h
      u.emblem.value.copy(face.material.uniforms.emblem.value)
    }
  }

  private drawLayer(
    mesh: LayerMesh,
    place: Placement,
    state: EffectState,
    sweep: SweepSpan | null,
    order: number,
    finish: FinishSpec | null = null,
  ): void {
    const { tex, width: w, height: h } = place
    const texW = w * tex.paddingScale.x
    const texH = h * tex.paddingScale.y

    // Room around the texture for whatever spills past it: blur, motion blur, strips.
    const blur = state.blur * h
    let spillX = 2.2 * blur + Math.abs(state.smearX) / 2
    let spillY = 2.2 * blur + Math.abs(state.smearY) / 2
    const { reveal } = state
    if (reveal?.kind === 'slices' || reveal?.kind === 'slide') {
      const [dx, dy] = directionVector(reveal.direction)
      const reach = reveal.kind === 'slices' ? reveal.travel + 0.05 : reveal.smear
      spillX += Math.abs(dx) * reach * w
      spillY += Math.abs(dy) * reach * h
    }
    const quadW = texW + 2 * spillX
    const quadH = texH + 2 * spillY

    mesh.visible = true
    mesh.renderOrder = order
    mesh.position.set(state.x, state.y, state.z)
    mesh.rotation.set(state.rotX * DEG, state.rotY * DEG, state.rotZ * DEG)
    mesh.scale.set(quadW, quadH, 1)

    const u = mesh.material.uniforms
    u.map.value = tex.texture
    u.texSize.value.set(tex.width, tex.height)
    u.uvScale.value.set(quadW / texW, quadH / texH)
    u.pad.value.set(tex.padUv.x, tex.padUv.y)
    u.aspect.value = tex.aspect
    u.opacity.value = state.opacity
    u.flash.value = state.flash
    u.blurRadius.value.set(blur / texW, blur / texH)
    u.smear.value.set(state.smearX / texW, state.smearY / texH)
    this.setReveal(u, reveal, sweep)
    this.setShine(u.shine.value, u.shineDir.value, state.shine, tex.aspect)
    u.mirror.value = 0
    // Bevel width in texels of the texture's content.
    const contentTexels = tex.height / tex.paddingScale.y
    if (finish?.emblem) u.emblem.value.set(1, finish.bevel * contentTexels, finish.gloss, finish.metal)
    else u.emblem.value.set(0, 1, 0, 0)
  }

  private setReveal(u: Record<string, THREE.IUniform>, reveal: Reveal | null, sweep: SweepSpan | null): void {
    const a: THREE.Vector4 = u.revealA.value
    const b: THREE.Vector4 = u.revealB.value
    b.set(0, 0, 0, 0)
    u.revealKind.value = reveal ? REVEAL_KIND[reveal.kind] : REVEAL_KIND.none
    if (!reveal) return
    switch (reveal.kind) {
      case 'slide': {
        const [dx, dy] = directionVector(reveal.direction)
        a.set(dx, dy, reveal.progress, reveal.smear)
        break
      }
      case 'wipe': {
        const [dx, dy] = directionVector(reveal.direction)
        a.set(dx, dy, reveal.progress, reveal.softness)
        b.x = reveal.glow
        break
      }
      case 'iris':
        a.set(reveal.progress, reveal.softness, reveal.glow, 0)
        break
      case 'slices': {
        const [dx, dy] = directionVector(reveal.direction)
        a.set(dx, dy, reveal.progress, reveal.count)
        b.set(reveal.travel, reveal.shutter, 0, 0)
        break
      }
      case 'dissolve':
        a.set(reveal.progress, reveal.softness, reveal.glow, reveal.scale)
        break
      case 'sweep': {
        const [dx, dy] = directionVector(reveal.direction)
        const span = sweep ?? { min: -1, max: 1 }
        const line = lerp(span.min - 2 * SWEEP_SOFTNESS, span.max + 2 * SWEEP_SOFTNESS, reveal.progress)
        a.set(dx, dy, line, SWEEP_SOFTNESS)
        b.set(reveal.keep === 'ahead' ? 1 : -1, reveal.glow, 0, 0)
        break
      }
    }
  }

  /** Where the sweep line has to travel so it crosses every logo taking part in it. */
  private sweepSpan(draws: Draw[]): SweepSpan | null {
    let min = Infinity
    let max = -Infinity
    for (const draw of draws) {
      if (draw.kind !== 'logo' || draw.state.reveal?.kind !== 'sweep') continue
      const [dx, dy] = directionVector(draw.state.reveal.direction)
      const { width, height } = this.placeLayer(draw)
      const centre = draw.state.x * dx + draw.state.y * dy
      const half = (Math.abs(dx) * width + Math.abs(dy) * height) / 2
      min = Math.min(min, centre - half)
      max = Math.max(max, centre + half)
    }
    return min <= max ? { min, max } : null
  }

  private setShine(params: THREE.Vector4, dir: THREE.Vector2, shine: ShineState | null, aspect: number): void {
    if (!shine || shine.intensity <= 0) {
      params.set(0, 1, 0, 0)
      return
    }
    const reach = shineReach(shine.angle, shine.width, aspect)
    params.set(lerp(-reach, reach, shine.position), shine.width, shine.intensity, SHINE_STYLE[shine.style])
    dir.set(Math.cos(shine.angle * DEG), Math.sin(shine.angle * DEG))
  }

  /** Soft contact shadow under the logo; fades as it turns away, leaves or isn't revealed yet. */
  private drawShadow(mesh: LayerMesh | undefined, place: Placement, state: EffectState, weight: number): void {
    if (!mesh || !this.settings.shadow) return
    const { width: w, height: h } = place
    const facing = Math.abs(Math.cos(state.rotY * DEG) * Math.cos(state.rotX * DEG))
    const lifted = Math.exp(-((Math.abs(state.y) / (0.5 * h)) ** 2))
    const strength = SHADOW_STRENGTH * state.opacity * facing ** 2 * revealCoverage(state.reveal) * lifted * weight
    if (strength <= 0) return
    mesh.visible = true
    mesh.scale.set(w * (0.55 + 0.35 * facing), Math.max(h * 0.12, 0.03 * state.scale), 1)
    mesh.position.set(state.x, -h / 2 - SHADOW_GAP * state.scale, state.z)
    mesh.material.uniforms.strength.value = strength
  }

  /** Both logos of a liquid morph as one shape. Returns how far the blend has gone. */
  private drawLiquid(from: LogoLayer, to: LogoLayer, progress: number, order: number): number {
    const a = this.placeLayer(from)
    const b = this.placeLayer(to)
    const { mix, blur, goo } = liquidAt(progress)
    const rect = (place: Placement, state: EffectState) => ({
      x: state.x,
      y: state.y,
      w: place.width * place.tex.paddingScale.x,
      h: place.height * place.tex.paddingScale.y,
    })
    const ra = rect(a, from.state)
    const rb = rect(b, to.state)
    const margin = 2.5 * blur
    const minX = Math.min(ra.x - ra.w / 2, rb.x - rb.w / 2) - margin
    const maxX = Math.max(ra.x + ra.w / 2, rb.x + rb.w / 2) + margin
    const minY = Math.min(ra.y - ra.h / 2, rb.y - rb.h / 2) - margin
    const maxY = Math.max(ra.y + ra.h / 2, rb.y + rb.h / 2) + margin

    const mesh = this.liquid
    mesh.visible = true
    mesh.renderOrder = order
    mesh.position.set((minX + maxX) / 2, (minY + maxY) / 2, 0)
    mesh.rotation.set(0, 0, 0)
    mesh.scale.set(maxX - minX, maxY - minY, 1)

    const u = mesh.material.uniforms
    const side = (suffix: 'A' | 'B', place: Placement, r: typeof ra, state: EffectState) => {
      u[`map${suffix}`].value = place.tex.texture
      u[`texSize${suffix}`].value.set(place.tex.width, place.tex.height)
      u[`rect${suffix}`].value.set(r.x, r.y, r.w, r.h)
      u[`pad${suffix}`].value.set(place.tex.padUv.x, place.tex.padUv.y)
      u[`aspect${suffix}`].value = place.tex.aspect
      u[`blur${suffix}`].value.set(blur / r.w, blur / r.h)
      u[`opacity${suffix}`].value = state.opacity
      this.setShine(u[`shine${suffix}`].value, u[`shineDir${suffix}`].value, state.shine, place.tex.aspect)
    }
    side('A', a, ra, from.state)
    side('B', b, rb, to.state)
    u.mixAmount.value = mix
    u.goo.value = goo
    return mix
  }

  private layerMatrix(state: EffectState, scale: number, out: THREE.Matrix4): THREE.Matrix4 {
    this.placer.position.set(state.x, state.y, state.z)
    this.placer.rotation.set(state.rotX * DEG, state.rotY * DEG, state.rotZ * DEG)
    this.placer.scale.setScalar(scale)
    this.placer.updateMatrix()
    return out.copy(this.placer.matrix)
  }

  /** Pixels per world unit at distance 1 from the camera, in the render target. */
  private pixelScale(): number {
    return ((this.target?.height ?? this.height) * this.camera.projectionMatrix.elements[5]) / 2
  }

  private drawAssembly(logo: StageLogo, place: Placement, state: EffectState, order: number): void {
    const particles = state.particles!
    const { cloud, geometry } = this.cloudFor(logo)
    const points = this.assembly
    points.geometry = geometry
    points.visible = true
    points.renderOrder = order
    points.position.set(state.x, state.y, state.z)
    points.rotation.set(state.rotX * DEG, state.rotY * DEG, state.rotZ * DEG)
    points.scale.setScalar(place.height)
    const u = points.material.uniforms
    u.progress.value = particles.progress
    u.direction.value.set(...directionVector(particles.direction))
    u.spread.value = particles.spread
    u.aspect.value = cloud.aspect
    u.dotSize.value = cloud.spacing * DOT_SCALE * place.height
    u.pixelScale.value = this.pixelScale()
  }

  private drawSwarm(from: LogoLayer, to: LogoLayer, progress: number, order: number): void {
    const a = this.placeLayer(from)
    const b = this.placeLayer(to)
    const { pairing, geometry } = this.pairFor(this.program.items[from.item].logo, this.program.items[to.item].logo)
    const points = this.swarm
    points.geometry = geometry
    points.visible = true
    points.renderOrder = order
    const u = points.material.uniforms
    this.layerMatrix(from.state, a.height, u.matrixA.value)
    this.layerMatrix(to.state, b.height, u.matrixB.value)
    u.progress.value = progress
    u.dotA.value = pairing.fromSpacing * DOT_SCALE * a.height
    u.dotB.value = pairing.toSpacing * DOT_SCALE * b.height
    u.pixelScale.value = this.pixelScale()
  }

  // ─── Resources ────────────────────────────────────────────────────────────

  /**
   * While a logo holds still, uploads what the next parts need (textures, particles), so
   * the preview never stalls when they start.
   */
  private prepareAhead(frame: Frame): void {
    const { segments, items } = this.program
    if (segments[frame.segment].kind !== 'hold' || frame.progress < 0.4) return
    for (const next of segments.slice(frame.segment + 1, frame.segment + 3)) {
      for (const item of segmentItems(next)) this.renderer.initTexture(this.textureFor(items[item].logo).texture)
      this.prepareParticles(next)
    }
  }

  private prepareParticles(segment: Segment): void {
    const { items } = this.program
    if (segment.kind === 'transition') {
      if (segment.transition.kind === 'particles') this.pairFor(items[segment.from.item].logo, items[segment.to.item].logo)
    } else if (segment.kind === 'entry' || segment.kind === 'exit') {
      const { animation, logo } = items[segment.occurrence.item]
      const motion = segment.kind === 'entry' ? animation.entry : animation.exit
      if (motion?.effect === 'particles') this.cloudFor(logo)
    }
  }

  private textureFor(logo: StageLogo): LogoTexture {
    return this.textures.get(logo, () => {
      const { bitmap, padding } = logo
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

      const contentW = bitmap.width - 2 * padding
      const contentH = bitmap.height - 2 * padding
      return {
        texture,
        width: bitmap.width,
        height: bitmap.height,
        aspect: contentW / contentH,
        paddingScale: { x: bitmap.width / contentW, y: bitmap.height / contentH },
        padUv: { x: padding / bitmap.width, y: padding / bitmap.height },
      }
    })
  }

  private cloudFor(logo: StageLogo): CloudGeometry {
    return this.clouds.get(logo, () => {
      const cloud = sampleParticles(logo)
      const geometry = new THREE.BufferGeometry()
      geometry.setAttribute('target', new THREE.BufferAttribute(cloud.positions, 2))
      geometry.setAttribute('dotColor', new THREE.BufferAttribute(cloud.colors, 3, true))
      geometry.setAttribute('seed', new THREE.BufferAttribute(seeds(cloud.count, 11), 4))
      geometry.setDrawRange(0, cloud.count)
      return { cloud, geometry }
    })
  }

  private pairFor(from: StageLogo, to: StageLogo): PairGeometry {
    return this.pairs.get(`${this.idOf(from)}:${this.idOf(to)}`, () => {
      const pairing = pairClouds(this.cloudFor(from).cloud, this.cloudFor(to).cloud)
      const geometry = new THREE.BufferGeometry()
      geometry.setAttribute('from', new THREE.BufferAttribute(pairing.from, 2))
      geometry.setAttribute('to', new THREE.BufferAttribute(pairing.to, 2))
      geometry.setAttribute('colorA', new THREE.BufferAttribute(pairing.fromColors, 3, true))
      geometry.setAttribute('colorB', new THREE.BufferAttribute(pairing.toColors, 3, true))
      geometry.setAttribute('seed', new THREE.BufferAttribute(seeds(pairing.count, 23), 4))
      geometry.setDrawRange(0, pairing.count)
      return { pairing, geometry }
    })
  }

  private idOf(logo: StageLogo): number {
    let id = this.ids.get(logo)
    if (id === undefined) this.ids.set(logo, (id = this.nextId++))
    return id
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

interface SweepSpan {
  min: number
  max: number
}
