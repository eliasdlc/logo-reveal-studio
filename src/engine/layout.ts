/** The frame is 1 world unit tall; its width is the aspect ratio (16/9). */
export const FRAME_HEIGHT = 1

export const MAX_LOGO_WIDTH = 0.55
export const MAX_LOGO_HEIGHT = 0.45

export interface LogoSize {
  width: number
  height: number
}

/**
 * Largest size for a logo of the given aspect ratio that fits inside the allowed box
 * (55% of the frame width, 45% of its height). World units.
 */
export function fitLogo(logoAspect: number, frameAspect: number): LogoSize {
  const maxW = MAX_LOGO_WIDTH * frameAspect * FRAME_HEIGHT
  const maxH = MAX_LOGO_HEIGHT * FRAME_HEIGHT
  const width = Math.min(maxW, maxH * logoAspect)
  return { width, height: width / logoAspect }
}
