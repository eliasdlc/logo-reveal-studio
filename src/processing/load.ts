import type { LogoBitmap } from '../engine/types'
import { bleedAlpha } from './bleed'

/** Long side for rasterized SVGs. Phase 2 derives this from the export resolution. */
const SVG_RASTER_SIZE = 4096

export const ACCEPTED_TYPES = ['image/png', 'image/jpeg', 'image/svg+xml']

export async function loadLogoFile(file: File): Promise<LogoBitmap> {
  const isSvg = file.type === 'image/svg+xml' || file.name.toLowerCase().endsWith('.svg')
  const bitmap = isSvg ? await rasterizeSvg(await file.text()) : await decodeRaster(file)
  bleedAlpha(bitmap)
  return bitmap
}

export async function loadLogoFromSvg(svg: string): Promise<LogoBitmap> {
  const bitmap = await rasterizeSvg(svg)
  bleedAlpha(bitmap)
  return bitmap
}

async function decodeRaster(blob: Blob): Promise<LogoBitmap> {
  const image = await createImageBitmap(blob, { premultiplyAlpha: 'none' })
  try {
    return readPixels(image, image.width, image.height)
  } finally {
    image.close()
  }
}

async function rasterizeSvg(svg: string): Promise<LogoBitmap> {
  const [vw, vh] = svgIntrinsicSize(svg)
  const scale = SVG_RASTER_SIZE / Math.max(vw, vh)
  const width = Math.max(1, Math.round(vw * scale))
  const height = Math.max(1, Math.round(vh * scale))

  const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }))
  try {
    const img = new Image()
    img.decoding = 'async'
    img.src = url
    await img.decode()
    return readPixels(img, width, height)
  } finally {
    URL.revokeObjectURL(url)
  }
}

/** Size in SVG user units, from width/height or else the viewBox. */
function svgIntrinsicSize(svg: string): [number, number] {
  const doc = new DOMParser().parseFromString(svg, 'image/svg+xml')
  const root = doc.documentElement
  if (root.nodeName !== 'svg') throw new Error('El archivo SVG no es válido.')
  const viewBox = root.getAttribute('viewBox')?.split(/[\s,]+/).map(Number)
  const num = (attr: string) => {
    const v = root.getAttribute(attr)
    return v && !v.trim().endsWith('%') ? parseFloat(v) : NaN
  }
  let w = num('width')
  let h = num('height')
  if (viewBox && viewBox.length === 4 && viewBox[2] > 0 && viewBox[3] > 0) {
    if (!(w > 0) && !(h > 0)) [w, h] = [viewBox[2], viewBox[3]]
    else if (!(w > 0)) w = (h * viewBox[2]) / viewBox[3]
    else if (!(h > 0)) h = (w * viewBox[3]) / viewBox[2]
  }
  if (!(w > 0) || !(h > 0)) throw new Error('El SVG no tiene tamaño ni viewBox.')
  return [w, h]
}

function readPixels(source: CanvasImageSource, width: number, height: number): LogoBitmap {
  const canvas = new OffscreenCanvas(width, height)
  const ctx = canvas.getContext('2d', { colorSpace: 'srgb', willReadFrequently: true })
  if (!ctx) throw new Error('No se pudo crear un canvas 2D.')
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(source, 0, 0, width, height)
  const { data } = ctx.getImageData(0, 0, width, height)
  return { width, height, data }
}
