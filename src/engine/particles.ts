import type { StageLogo } from './types'

/**
 * Points spread over a logo's visible pixels, with their colours. Positions are in logo
 * heights, centred on the content, y up: x ∈ [−aspect/2, aspect/2], y ∈ [−½, ½].
 */
export interface ParticleCloud {
  count: number
  positions: Float32Array
  /** sRGB bytes, r g b per particle. */
  colors: Uint8Array
  /** Content aspect ratio (width / height). */
  aspect: number
  /** Typical distance between neighbouring particles, in logo heights. */
  spacing: number
}

/** Particles per logo: dense enough to read as the logo, light enough for any GPU. */
export const PARTICLE_COUNT = 16000

/** Small, fast, seedable PRNG (mulberry32). Same seed → same sequence on every machine. */
export function random(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/**
 * Stratified sampling of the logo's opaque pixels: one jittered candidate per grid cell,
 * kept with probability = its alpha. Deterministic, and independent of the output size so
 * the preview and the export show the very same particles.
 */
export function sampleParticles(logo: StageLogo, target = PARTICLE_COUNT, seed = 1): ParticleCloud {
  const { bitmap, padding } = logo
  const { width, height, data } = bitmap
  const cw = width - 2 * padding
  const ch = height - 2 * padding
  const alphaAt = (x: number, y: number) => data[((padding + y) * width + padding + x) * 4 + 3]

  // Coverage estimate on a coarse grid decides the cell size.
  const probe = 128
  let covered = 0
  for (let j = 0; j < probe; j++) {
    for (let i = 0; i < probe; i++) {
      covered += alphaAt(Math.floor(((i + 0.5) * cw) / probe), Math.floor(((j + 0.5) * ch) / probe)) / 255
    }
  }
  const coverage = Math.max(covered / (probe * probe), 1e-3)
  const cell = Math.max(1, Math.sqrt((cw * ch * coverage) / target))

  const rand = random(seed)
  const cols = Math.ceil(cw / cell)
  const rows = Math.ceil(ch / cell)
  const positions: number[] = []
  const colors: number[] = []
  const aspect = cw / ch
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const x = Math.min(cw - 1, Math.floor((c + rand()) * cell))
      const y = Math.min(ch - 1, Math.floor((r + rand()) * cell))
      const keep = rand() * 255
      const index = ((padding + y) * width + padding + x) * 4
      if (keep >= data[index + 3] || data[index + 3] === 0) continue
      positions.push((x + 0.5) / ch - aspect / 2, 0.5 - (y + 0.5) / ch)
      colors.push(data[index], data[index + 1], data[index + 2])
    }
  }

  return {
    count: positions.length / 2,
    positions: Float32Array.from(positions),
    colors: Uint8Array.from(colors),
    aspect,
    spacing: cell / ch,
  }
}

/**
 * The given particles (indices into the cloud) in "columns" order: sorted by x into
 * `columns` strips of equal count, each strip sorted by y. Matching two equally sized sets
 * rank by rank in this order sends every region of one logo to the region in the same
 * relative place in the other (a cheap approximation of the least-travel pairing).
 */
function columnOrder(cloud: ParticleCloud, indices: number[], columns: number): number[] {
  const { positions } = cloud
  const byX = [...indices].sort((a, b) => positions[2 * a] - positions[2 * b])
  const result: number[] = []
  for (let c = 0; c < columns; c++) {
    const strip = byX.slice(Math.floor((c * byX.length) / columns), Math.floor(((c + 1) * byX.length) / columns))
    strip.sort((a, b) => positions[2 * a + 1] - positions[2 * b + 1])
    result.push(...strip)
  }
  return result
}

/** Two clouds with the same number of particles, particle i of one flying to particle i of the other. */
export interface ParticlePairing {
  count: number
  /** x y in the outgoing logo's heights / in the incoming logo's heights. */
  from: Float32Array
  to: Float32Array
  fromColors: Uint8Array
  toColors: Uint8Array
  fromSpacing: number
  toSpacing: number
}

/** `count` particles of the cloud in column order: all of them, plus random repeats if it has fewer. */
function resample(cloud: ParticleCloud, count: number, rand: () => number): number[] {
  if (cloud.count === 0) return []
  const indices = Array.from({ length: cloud.count }, (_, i) => i)
  // A repeated particle simply shares its twin's spot.
  while (indices.length < count) indices.push(Math.floor(rand() * cloud.count))
  return columnOrder(cloud, indices.slice(0, count), Math.max(1, Math.round(Math.sqrt(count))))
}

/**
 * Pairs two logos' particles for a morph: neighbouring particles travel together and each
 * region of one logo flows into the matching region of the other.
 */
export function pairClouds(from: ParticleCloud, to: ParticleCloud, seed = 7): ParticlePairing {
  const count = Math.max(from.count, to.count)
  const rand = random(seed)
  const a = resample(from, count, rand)
  const b = resample(to, count, rand)
  const pairing: ParticlePairing = {
    count: Math.min(a.length, b.length),
    from: new Float32Array(count * 2),
    to: new Float32Array(count * 2),
    fromColors: new Uint8Array(count * 3),
    toColors: new Uint8Array(count * 3),
    fromSpacing: from.spacing,
    toSpacing: to.spacing,
  }
  for (let i = 0; i < pairing.count; i++) {
    pairing.from.set(from.positions.subarray(2 * a[i], 2 * a[i] + 2), 2 * i)
    pairing.to.set(to.positions.subarray(2 * b[i], 2 * b[i] + 2), 2 * i)
    pairing.fromColors.set(from.colors.subarray(3 * a[i], 3 * a[i] + 3), 3 * i)
    pairing.toColors.set(to.colors.subarray(3 * b[i], 3 * b[i] + 3), 3 * i)
  }
  return pairing
}
