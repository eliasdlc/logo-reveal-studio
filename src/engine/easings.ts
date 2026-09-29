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

/** Hermite smoothstep between edges a and b (a may be greater than b to invert it). */
export const smoothstep = (a: number, b: number, x: number): number => {
  const t = clamp01((x - a) / (b - a))
  return t * t * (3 - 2 * t)
}

export const linear: Easing = (x) => x

export const easeInCubic: Easing = (x) => x ** 3

export const easeOutCubic: Easing = (x) => 1 - (1 - x) ** 3

export const easeOutQuart: Easing = (x) => 1 - (1 - x) ** 4

export const easeOutQuint: Easing = (x) => 1 - (1 - x) ** 5

/** Exponential ease-out, rescaled so it lands exactly on 1. */
export const easeOutExpo: Easing = (x) => {
  if (x <= 0) return 0
  if (x >= 1) return 1
  return (1 - 2 ** (-10 * x)) / (1 - 2 ** -10)
}

export const easeInOutSine: Easing = (x) => -(Math.cos(Math.PI * x) - 1) / 2

export const easeInOutCubic: Easing = (x) =>
  x < 0.5 ? 4 * x ** 3 : 1 - (-2 * x + 2) ** 3 / 2

export const easeInOutQuart: Easing = (x) => (x < 0.5 ? 8 * x ** 4 : 1 - (-2 * x + 2) ** 4 / 2)

/** Overshoots past 1 before settling; `overshoot` ≈ 1.70158 is the classic value. */
export const easeOutBack =
  (overshoot = 1.70158): Easing =>
  (x) => {
    if (x <= 0) return 0
    if (x >= 1) return 1
    const c3 = overshoot + 1
    return 1 + c3 * (x - 1) ** 3 + overshoot * (x - 1) ** 2
  }

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

/**
 * CSS-style cubic-bézier timing curve through (0, 0), (x1, y1), (x2, y2), (1, 1) — the
 * same curves motion designers use in After Effects or CSS. Exact at 0 and 1.
 */
export function cubicBezier(x1: number, y1: number, x2: number, y2: number): Easing {
  const cx = 3 * x1
  const bx = 3 * (x2 - x1) - cx
  const ax = 1 - cx - bx
  const cy = 3 * y1
  const by = 3 * (y2 - y1) - cy
  const ay = 1 - cy - by
  const sampleX = (s: number) => ((ax * s + bx) * s + cx) * s
  const sampleY = (s: number) => ((ay * s + by) * s + cy) * s
  const slopeX = (s: number) => (3 * ax * s + 2 * bx) * s + cx

  return (x) => {
    if (x <= 0) return 0
    if (x >= 1) return 1
    // Newton first (fast, precise on well-behaved curves), bisection as the fallback.
    let s = x
    for (let i = 0; i < 8; i++) {
      const err = sampleX(s) - x
      if (Math.abs(err) < 1e-7) return sampleY(s)
      const d = slopeX(s)
      if (Math.abs(d) < 1e-6) break
      s -= err / d
    }
    let lo = 0
    let hi = 1
    s = x
    for (let i = 0; i < 40; i++) {
      const v = sampleX(s)
      if (Math.abs(v - x) < 1e-7) break
      if (v < x) lo = s
      else hi = s
      s = (lo + hi) / 2
    }
    return sampleY(s)
  }
}

/** Quick start and a long, soft landing: the classic motion-design arrival. */
export const easeArrive = cubicBezier(0.16, 1, 0.3, 1)

/** Inverse of easeArrive (a bézier's inverse swaps its control points' coordinates). */
export const easeArriveInverse = cubicBezier(1, 0.16, 1, 0.3)

/** Symmetric, decisive in-out: for things that travel from one place to another. */
export const easeTravel = cubicBezier(0.7, 0, 0.3, 1)
