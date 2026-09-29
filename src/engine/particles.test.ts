import { describe, expect, it } from 'vitest'
import { CLEAR, paint, rect, type RGBA } from '../processing/testUtils'
import { pairClouds, random, sampleParticles } from './particles'
import type { StageLogo } from './types'

const RED: RGBA = [220, 20, 60, 255]
const BLUE: RGBA = [30, 60, 200, 255]

/** 200 × 100 content with an 8 px transparent margin; only the left half is painted. */
const halfLogo: StageLogo = { bitmap: paint(216, 116, rect(8, 8, 108, 108, RED, CLEAR)), padding: 8 }
/** A full 100 × 100 blue square. */
const square: StageLogo = { bitmap: paint(116, 116, rect(8, 8, 108, 108, BLUE, CLEAR)), padding: 8 }

describe('random', () => {
  it('is deterministic and in [0, 1)', () => {
    const a = random(42)
    const b = random(42)
    for (let i = 0; i < 100; i++) {
      const v = a()
      expect(v).toBe(b())
      expect(v).toBeGreaterThanOrEqual(0)
      expect(v).toBeLessThan(1)
    }
    expect(random(1)()).not.toBe(random(2)())
  })
})

describe('sampleParticles', () => {
  const cloud = sampleParticles(halfLogo, 2000)

  it('places particles only on the visible pixels, with their colours', () => {
    expect(cloud.aspect).toBe(2)
    for (let i = 0; i < cloud.count; i++) {
      const x = cloud.positions[2 * i]
      const y = cloud.positions[2 * i + 1]
      expect(x).toBeGreaterThanOrEqual(-1)
      expect(x).toBeLessThanOrEqual(0)
      expect(Math.abs(y)).toBeLessThanOrEqual(0.5)
      expect([...cloud.colors.subarray(3 * i, 3 * i + 3)]).toEqual(RED.slice(0, 3))
    }
  })

  it('gets close to the requested count whatever the coverage', () => {
    expect(cloud.count).toBeGreaterThan(1500)
    expect(cloud.count).toBeLessThan(2600)
    const full = sampleParticles(square, 2000)
    expect(full.count).toBeGreaterThan(1500)
    expect(full.count).toBeLessThan(2600)
  })

  it('reports the spacing between particles', () => {
    // 10 000 px² of paint shared by ~2000 particles: cells of ~2.2 px in a 100 px tall logo.
    expect(cloud.spacing).toBeCloseTo(Math.sqrt(10000 / 2000) / 100, 4)
  })

  it('is deterministic', () => {
    expect(sampleParticles(halfLogo, 2000)).toEqual(cloud)
  })
})

describe('pairClouds', () => {
  const a = sampleParticles(halfLogo, 1500)
  const b = sampleParticles(square, 3000)
  const pairing = pairClouds(a, b)

  it('gives both logos the same number of particles: the larger count', () => {
    expect(pairing.count).toBe(Math.max(a.count, b.count))
    expect(pairing.from.length).toBe(pairing.count * 2)
    expect(pairing.toColors.length).toBe(pairing.count * 3)
  })

  it('uses every particle of each logo, repeating some of the smaller one', () => {
    const key = (arr: Float32Array, i: number) => `${arr[2 * i]},${arr[2 * i + 1]}`
    const fromKeys = new Set(Array.from({ length: pairing.count }, (_, i) => key(pairing.from, i)))
    const aKeys = new Set(Array.from({ length: a.count }, (_, i) => key(a.positions, i)))
    expect(fromKeys).toEqual(aKeys)
    const toKeys = new Set(Array.from({ length: pairing.count }, (_, i) => key(pairing.to, i)))
    const bKeys = new Set(Array.from({ length: b.count }, (_, i) => key(b.positions, i)))
    expect(toKeys).toEqual(bKeys)
  })

  it('keeps colours with their particles', () => {
    for (let i = 0; i < pairing.count; i += 97) {
      expect([...pairing.fromColors.subarray(3 * i, 3 * i + 3)]).toEqual(RED.slice(0, 3))
      expect([...pairing.toColors.subarray(3 * i, 3 * i + 3)]).toEqual(BLUE.slice(0, 3))
    }
  })

  it('sends neighbours to neighbours (spatially coherent pairing)', () => {
    // Particles that start next to each other land next to each other, unlike a random pairing.
    const dist = (arr: Float32Array, i: number, k: number) =>
      Math.hypot(arr[2 * i] - arr[2 * k], arr[2 * i + 1] - arr[2 * k + 1])
    const rand = random(3)
    let neighbours = 0
    let strangers = 0
    let samples = 0
    for (let i = 0; i < pairing.count; i += 11) {
      let nearest = -1
      for (let k = 0; k < pairing.count; k++) {
        if (k !== i && dist(pairing.from, i, k) > 0 && (nearest < 0 || dist(pairing.from, i, k) < dist(pairing.from, i, nearest))) {
          nearest = k
        }
      }
      neighbours += dist(pairing.to, i, nearest)
      strangers += dist(pairing.to, i, Math.floor(rand() * pairing.count))
      samples++
    }
    expect(neighbours / samples).toBeLessThan(0.25 * (strangers / samples))
  })
})
