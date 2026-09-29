import type { LogoItem } from './store'

export type LogoStatus = 'processing' | 'error' | 'warning' | 'ok'

export interface LogoIssues {
  status: LogoStatus
  /** No transparent background and the white hasn't been removed. */
  opaque: boolean
  /** Upscale factor when the bitmap is smaller than it will appear on screen, else null. */
  upscale: number | null
}

export function logoIssues(logo: LogoItem): LogoIssues {
  const { processed, options } = logo
  if (logo.error) return { status: 'error', opaque: false, upscale: null }
  if (!processed) return { status: 'processing', opaque: false, upscale: null }
  const opaque = !processed.analysis.hasTransparency && !options.removeWhite
  const density = processed.baseDensity / options.scale
  const upscale = density < 1 ? 1 / density : null
  return { status: opaque || upscale ? 'warning' : 'ok', opaque, upscale }
}
