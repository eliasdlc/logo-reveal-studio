import { easeInOutCubic } from './easings'
import type { ShineState, ShineStyle } from './effects'

/** A light band that crosses the logo once it has arrived (and optionally again later). */
export interface ShineSpec {
  /** Seconds after the logo is at rest; negative starts it during the entry. */
  delay: number
  /** Seconds one sweep takes to cross. */
  duration: number
  /** Seconds between the start of one sweep and the next; 0 = only once. */
  interval: number
  /** Travel direction in degrees: 0 = →, 45 = ↗, 90 = ↑. */
  angle: number
  /** Band width, in logo heights. */
  width: number
  /** 0–1: how close to white the band gets. */
  intensity: number
  style: ShineStyle
}

/**
 * The shine at `sinceArrive` seconds after the logo came to rest, or null between sweeps.
 * `window` is how long the logo stays at rest: repeats only start if they finish before
 * it leaves, so a sweep is never cut off by the exit. The first sweep always plays.
 */
export function shineAt(spec: ShineSpec, sinceArrive: number, window: number): ShineState | null {
  const local = sinceArrive - spec.delay
  if (local < 0 || spec.duration <= 0) return null
  const period = spec.interval > 0 ? Math.max(spec.interval, spec.duration) : Infinity
  const index = Number.isFinite(period) ? Math.floor(local / period) : 0
  const start = index * (Number.isFinite(period) ? period : 0)
  const into = local - start
  if (into > spec.duration) return null
  if (index > 0 && spec.delay + start + spec.duration > window) return null
  return {
    position: easeInOutCubic(into / spec.duration),
    angle: spec.angle,
    width: spec.width,
    intensity: spec.intensity,
    style: spec.style,
  }
}

/**
 * How far the band centre travels, in logo heights either side of the centre, for a logo
 * of the given aspect: the band starts and ends fully outside the logo.
 */
export function shineReach(angle: number, width: number, aspect: number): number {
  const rad = (angle * Math.PI) / 180
  return (Math.abs(Math.cos(rad)) * aspect) / 2 + Math.abs(Math.sin(rad)) / 2 + 3 * width
}
