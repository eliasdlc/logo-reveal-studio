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
    if (x <= 0) return 0
    if (x >= 1) return 1
    const c3 = overshoot + 1
    return 1 + c3 * (x - 1) ** 3 + overshoot * (x - 1) ** 2
  }

export const easeInOutCubic: Easing = (x) =>
  x < 0.5 ? 4 * x ** 3 : 1 - (-2 * x + 2) ** 3 / 2

/**
 * Soft damped spring: rises past 1, wobbles back and lands exactly on 1 at x = 1.
 * `damping` controls how quickly the wobble dies (higher = less overshoot, ~8% at 5),
 * `oscillations` how many wobble cycles fit in the window.
 */
export const easeOutElastic =
  (damping = 5, oscillations = 1.25): Easing =>
  (x) => {
    if (x <= 0) return 0
    if (x >= 1) return 1
    return 1 - Math.exp(-damping * x) * Math.cos(2 * Math.PI * oscillations * x) * (1 - x)
  }
