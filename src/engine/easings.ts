export type Easing = (x: number) => number

export const clamp01 = (x: number): number => (x < 0 ? 0 : x > 1 ? 1 : x)

export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t

/**
 * Progress of `t` inside the window [start, start + duration], clamped to [0, 1].
 * A zero-length window jumps straight to 1 once `t` reaches `start`.
 */
export const progress = (t: number, start: number, duration: number): number => {
  if (duration <= 0) return t >= start ? 1 : 0
  return clamp01((t - start) / duration)
}

export const linear: Easing = (x) => x

export const easeOutCubic: Easing = (x) => 1 - (1 - x) ** 3

/** Overshoots past 1 before settling; `overshoot` ≈ 1.70158 is the classic value. */
export const easeOutBack =
  (overshoot = 1.70158): Easing =>
  (x) => {
    const c3 = overshoot + 1
    return 1 + c3 * (x - 1) ** 3 + overshoot * (x - 1) ** 2
  }

const elastic: Easing = (x) => {
  if (x <= 0) return 0
  if (x >= 1) return 1
  return 1 + 2 ** (-10 * x) * Math.sin(((x * 10 - 0.75) * (2 * Math.PI)) / 3)
}

/**
 * Damped spring that starts at 0 and lands exactly on 1. `bounciness` blends between
 * a plain easeOutCubic (0) and the classic elastic curve (1), so lower = softer.
 */
export const easeOutElastic =
  (bounciness = 1): Easing =>
  (x) =>
    lerp(easeOutCubic(clamp01(x)), elastic(x), bounciness)
