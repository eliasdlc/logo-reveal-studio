import { FRAME_ASPECT, FRAME_HEIGHT, normalizedLogoSize } from '../engine/layout'
import type { LogoBitmap, StageLogo } from '../engine/types'
import { analyzeLogo, type LogoAnalysis } from './analyze'
import { bleedAlpha } from './bleed'
import { rasterizeSvg, type LogoSource } from './decode'
import { cloneBitmap } from './pixels'
import { removeWhiteBackground } from './removeWhite'
import { cropAndPad, findContentBox, visibleByAlpha, visibleOnWhite, type Box, type ContentTest } from './trim'

export interface ProcessOptions {
  removeWhite: boolean
  whiteThreshold: number
  /** Also remove white areas enclosed by the logo (inside of letters). */
  removeEnclosedWhite: boolean
  /** Manual per-logo scale (1 = automatic size). */
  scale: number
  /** Export frame height in px (1080 or 2160); SVGs are rasterized for it. */
  outputHeight: number
}

export interface ProcessedLogo {
  stage: StageLogo
  analysis: LogoAnalysis
  /**
   * Texture pixels per screen pixel of the export at rest, for manual scale 1. Divide by
   * the current scale to get the real value; below 1 the logo is upscaled and gets blurry.
   */
  baseDensity: number
}

/** Transparent margin around the trimmed content. */
export const PADDING = 8
/** SVGs are rasterized at this many texture pixels per screen pixel. */
const SVG_OVERSAMPLE = 2
/** Long side of the quick first raster used to locate an SVG's content. */
const SVG_PROBE_SIZE = 1024
const MAX_TEXTURE_SIZE = 8192

export function processLogo(source: LogoSource, options: ProcessOptions): ProcessedLogo {
  return source.kind === 'svg' ? processSvg(source, options) : processRaster(source.bitmap, options)
}

function processRaster(original: LogoBitmap, options: ProcessOptions): ProcessedLogo {
  let bitmap = cloneBitmap(original)
  const analysis = analyzeLogo(bitmap)
  if (options.removeWhite) removeWhiteBackground(bitmap, options.whiteThreshold, !options.removeEnclosedWhite)
  const box = requireContent(bitmap, contentTest(analysis, options))

  let content = cropAndPad(bitmap, box, 0)
  const longSide = Math.max(content.width, content.height)
  if (longSide > MAX_TEXTURE_SIZE - 2 * PADDING) {
    content = downscale(content, (MAX_TEXTURE_SIZE - 2 * PADDING) / longSide)
  }
  bitmap = cropAndPad(content, { x: 0, y: 0, width: content.width, height: content.height }, PADDING)
  bleedAlpha(bitmap)

  const screen = screenSize(content.width / content.height, options)
  return { stage: { bitmap, padding: PADDING }, analysis, baseDensity: (content.height / screen.height) * options.scale }
}

function processSvg(source: Extract<LogoSource, { kind: 'svg' }>, options: ProcessOptions): ProcessedLogo {
  // 1. Quick raster to find where the content is and what the file looks like.
  const probeScale = SVG_PROBE_SIZE / Math.max(source.width, source.height)
  const probe = rasterizeSvg(source, probeScale)
  const analysis = analyzeLogo(probe)
  if (options.removeWhite) removeWhiteBackground(probe, options.whiteThreshold, !options.removeEnclosedWhite)
  const test = contentTest(analysis, options)
  const probeBox = requireContent(probe, test)

  // 2. Re-rasterize just that region (plus a 2-probe-pixel safety ring) from the vector,
  //    at 2× the size it will occupy on screen at the export resolution.
  const margin = 2
  const region = clampToSvg(
    {
      x: (probeBox.x - margin) / probeScale,
      y: (probeBox.y - margin) / probeScale,
      width: (probeBox.width + 2 * margin) / probeScale,
      height: (probeBox.height + 2 * margin) / probeScale,
    },
    source,
  )
  const contentUnits = { width: probeBox.width / probeScale, height: probeBox.height / probeScale }
  const screen = screenSize(contentUnits.width / contentUnits.height, options)
  const wanted = (SVG_OVERSAMPLE * screen.height) / contentUnits.height
  const limit = (MAX_TEXTURE_SIZE - 2 * PADDING) / Math.max(region.width, region.height)
  const scale = Math.min(wanted, limit)

  const raster = rasterizeSvg(source, scale, region)
  if (options.removeWhite) removeWhiteBackground(raster, options.whiteThreshold, !options.removeEnclosedWhite)
  const box = requireContent(raster, test)
  const bitmap = cropAndPad(raster, box, PADDING)
  bleedAlpha(bitmap)

  return { stage: { bitmap, padding: PADDING }, analysis, baseDensity: (box.height / screen.height) * options.scale }
}

/** What counts as "logo" when trimming: alpha, or non-white for opaque images on white. */
function contentTest(analysis: LogoAnalysis, options: ProcessOptions): ContentTest {
  if (analysis.hasTransparency || options.removeWhite || !analysis.lightBorder) return visibleByAlpha
  return visibleOnWhite
}

function requireContent(bitmap: LogoBitmap, test: ContentTest): Box {
  const box = findContentBox(bitmap, test)
  if (!box) throw new Error('La imagen está vacía (no hay nada visible que mostrar).')
  return box
}

/** On-screen content size in export pixels, at rest. */
function screenSize(aspect: number, options: ProcessOptions) {
  const size = normalizedLogoSize(aspect, FRAME_ASPECT)
  const pxPerUnit = options.outputHeight / FRAME_HEIGHT
  return { width: size.width * options.scale * pxPerUnit, height: size.height * options.scale * pxPerUnit }
}

function clampToSvg(box: Box, svg: { width: number; height: number }): Box {
  const x = Math.max(0, box.x)
  const y = Math.max(0, box.y)
  return {
    x,
    y,
    width: Math.min(svg.width, box.x + box.width) - x,
    height: Math.min(svg.height, box.y + box.height) - y,
  }
}

/** Rare path for huge bitmaps; goes through a 2D canvas, so only used when unavoidable. */
function downscale(bitmap: LogoBitmap, factor: number): LogoBitmap {
  const src = new OffscreenCanvas(bitmap.width, bitmap.height)
  src.getContext('2d')!.putImageData(new ImageData(bitmap.data, bitmap.width, bitmap.height), 0, 0)
  const width = Math.max(1, Math.round(bitmap.width * factor))
  const height = Math.max(1, Math.round(bitmap.height * factor))
  const dst = new OffscreenCanvas(width, height)
  const ctx = dst.getContext('2d', { willReadFrequently: true })!
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(src, 0, 0, width, height)
  return { width, height, data: ctx.getImageData(0, 0, width, height).data }
}
