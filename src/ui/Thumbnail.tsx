import { useEffect, useRef } from 'react'
import type { StageLogo } from '../engine/types'

/** Small preview of the processed texture over a checkerboard, so transparency is visible. */
export function Thumbnail({ logo }: { logo: StageLogo | null }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || !logo) return
    const { bitmap } = logo
    const size = 2 * canvas.clientWidth * window.devicePixelRatio
    const fit = Math.min(1, size / bitmap.width, size / bitmap.height)
    let cancelled = false
    void createImageBitmap(new ImageData(new Uint8ClampedArray(bitmap.data), bitmap.width, bitmap.height), {
      resizeWidth: Math.max(1, Math.round(bitmap.width * fit)),
      resizeHeight: Math.max(1, Math.round(bitmap.height * fit)),
      resizeQuality: 'high',
    }).then((image) => {
      if (cancelled) return image.close()
      canvas.width = image.width
      canvas.height = image.height
      canvas.getContext('2d')!.drawImage(image, 0, 0)
      image.close()
    })
    return () => {
      cancelled = true
    }
  }, [logo])

  return (
    <div className="checkerboard flex h-28 items-center justify-center overflow-hidden rounded-md p-3 ring-1 ring-white/10">
      {logo ? (
        <canvas ref={canvasRef} className="max-h-full max-w-full object-contain" />
      ) : (
        <span className="text-xs text-neutral-500">Procesando…</span>
      )}
    </div>
  )
}
