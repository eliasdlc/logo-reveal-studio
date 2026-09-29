/** The frame is 1 world unit tall; its width is the aspect ratio (16/9). */
export const FRAME_HEIGHT = 1
export const FRAME_ASPECT = 16 / 9

/** Hard limits for the automatic size, as fractions of the frame. */
export const MAX_LOGO_WIDTH = 0.55
export const MAX_LOGO_HEIGHT = 0.45

/**
 * Every logo gets the same area as a square of this side (fraction of the frame height),
 * so square and horizontal logos carry the same visual weight.
 */
export const TARGET_SQUARE_SIDE = 0.36

export interface LogoSize {
  width: number
  height: number
}

/**
 * Automatic on-screen size (world units) for logo content of the given aspect ratio:
 * equal area for every logo, shrunk if needed to stay within 55% × 45% of the frame.
 * The manual per-logo scale is applied on top of this.
 */
export function normalizedLogoSize(logoAspect: number, frameAspect: number): LogoSize {
  const side = TARGET_SQUARE_SIDE * FRAME_HEIGHT
  const width = side * Math.sqrt(logoAspect)
  const height = side / Math.sqrt(logoAspect)
  const fit = Math.min(1, (MAX_LOGO_WIDTH * frameAspect * FRAME_HEIGHT) / width, (MAX_LOGO_HEIGHT * FRAME_HEIGHT) / height)
  return { width: width * fit, height: height * fit }
}
