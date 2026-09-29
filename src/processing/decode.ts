import type { LogoBitmap } from '../engine/types'
import type { Box } from './trim'

export const ACCEPTED_TYPES = ['image/png', 'image/jpeg', 'image/svg+xml', 'image/webp']

/** Original, untouched logo. SVGs stay vector so they can be rasterized at any size. */
export type LogoSource =
  | { kind: 'raster'; bitmap: LogoBitmap }
  | { kind: 'svg'; image: HTMLImageElement; width: number; height: number }

export async function decodeFile(file: File): Promise<LogoSource> {
  const isSvg = file.type === 'image/svg+xml' || file.name.toLowerCase().endsWith('.svg')
  if (isSvg) return decodeSvg(await file.text())
  if (!ACCEPTED_TYPES.includes(file.type)) throw new Error('Formato no soportado. Usa PNG, JPG o SVG.')
  const image = await createImageBitmap(file, { premultiplyAlpha: 'none' })
  try {
    return { kind: 'raster', bitmap: readPixels(image, image.width, image.height) }
  } finally {
    image.close()
  }
}

export async function decodeSvg(svg: string): Promise<LogoSource> {
  const doc = new DOMParser().parseFromString(svg, 'image/svg+xml')
  const root = doc.documentElement
  if (root.nodeName !== 'svg' || doc.querySelector('parsererror')) {
    throw new Error('El archivo SVG no es válido.')
  }
  const [width, height] = svgIntrinsicSize(root)
  // Pin the intrinsic size so the browser scales the vector (not a 300×150 default box).
  root.setAttribute('width', String(width))
  root.setAttribute('height', String(height))
  const blob = new Blob([new XMLSerializer().serializeToString(root)], { type: 'image/svg+xml' })

  const image = new Image()
  image.decoding = 'async'
  image.src = URL.createObjectURL(blob)
  try {
    await image.decode()
  } catch {
    throw new Error('El navegador no pudo dibujar este SVG.')
  }
  // The object URL stays alive: the image is re-rasterized whenever the target size changes.
  return { kind: 'svg', image, width, height }
}

/**
 * Rasterizes the `region` (in SVG units) of an SVG at `scale` px per unit, straight from
 * the vector — so text and curves stay sharp at any size.
 */
export function rasterizeSvg(
  source: Extract<LogoSource, { kind: 'svg' }>,
  scale: number,
  region: Box = { x: 0, y: 0, width: source.width, height: source.height },
): LogoBitmap {
  const width = Math.max(1, Math.ceil(region.width * scale))
  const height = Math.max(1, Math.ceil(region.height * scale))
  return readPixels(source.image, width, height, (ctx) =>
    ctx.drawImage(source.image, -region.x * scale, -region.y * scale, source.width * scale, source.height * scale),
  )
}

/** Size in SVG user units, from width/height or else the viewBox. */
function svgIntrinsicSize(root: Element): [number, number] {
  const viewBox = root.getAttribute('viewBox')?.trim().split(/[\s,]+/).map(Number)
  const length = (attr: string) => {
    const v = root.getAttribute(attr)?.trim()
    return v && !v.endsWith('%') ? parseFloat(v) : NaN
  }
  let w = length('width')
  let h = length('height')
  if (viewBox?.length === 4 && viewBox[2] > 0 && viewBox[3] > 0) {
    if (!(w > 0) && !(h > 0)) [w, h] = [viewBox[2], viewBox[3]]
    else if (!(w > 0)) w = (h * viewBox[2]) / viewBox[3]
    else if (!(h > 0)) h = (w * viewBox[3]) / viewBox[2]
  }
  if (!(w > 0) || !(h > 0)) throw new Error('El SVG no tiene tamaño (width/height) ni viewBox.')
  return [w, h]
}

function readPixels(
  source: CanvasImageSource,
  width: number,
  height: number,
  draw: (ctx: OffscreenCanvasRenderingContext2D) => void = (ctx) => ctx.drawImage(source, 0, 0, width, height),
): LogoBitmap {
  const canvas = new OffscreenCanvas(width, height)
  const ctx = canvas.getContext('2d', { colorSpace: 'srgb', willReadFrequently: true })
  if (!ctx) throw new Error('No se pudo crear un canvas 2D.')
  ctx.imageSmoothingQuality = 'high'
  draw(ctx)
  const { data } = ctx.getImageData(0, 0, width, height)
  return { width, height, data }
}
