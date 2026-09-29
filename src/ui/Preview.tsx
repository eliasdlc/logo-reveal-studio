import { useEffect, useRef } from 'react'
import { LogoStage } from '../engine/stage'
import type { StageLogo } from '../engine/types'
import { clipSpecOf, playbackLength, useStudio } from '../state/store'

/** 16:9 live preview. Draws through the same LogoStage.renderFrame(t) the exporter uses. */
export function Preview() {
  const containerRef = useRef<HTMLDivElement>(null)
  const playing = useStudio((s) => s.playing)

  useEffect(() => {
    const container = containerRef.current!
    // The canvas is created here (not in JSX) so each stage owns a fresh WebGL context.
    const canvas = document.createElement('canvas')
    canvas.className = 'absolute inset-0 h-full w-full'
    container.appendChild(canvas)
    const stage = new LogoStage(canvas)

    let shownLogo: StageLogo | null = null
    const draw = () => {
      const s = useStudio.getState()
      const logo = s.logo?.processed?.stage ?? null
      if (logo !== shownLogo) {
        stage.setLogo(logo)
        shownLogo = logo
      }
      stage.setLogoScale(s.logo?.options.scale ?? 1)
      stage.setSettings(s.settings)
      if (s.logo) stage.setClip(clipSpecOf(s.logo.options, s.padEnds))
      stage.renderFrame(s.time)
    }

    // Render at the canvas' real device-pixel size so the browser never rescales it (blur).
    // devicePixelContentBoxSize is exact when available, but isn't always updated for
    // emulated/zoomed pixel ratios, so it's only trusted when it agrees with CSS size × DPR.
    const resize = new ResizeObserver(([entry]) => {
      const dpr = window.devicePixelRatio
      const cssW = entry.contentRect.width * dpr
      const cssH = entry.contentRect.height * dpr
      const box = entry.devicePixelContentBoxSize?.[0]
      const exact = box && Math.abs(box.inlineSize - cssW) <= 1 && Math.abs(box.blockSize - cssH) <= 1
      stage.setSize(exact ? box.inlineSize : Math.round(cssW), exact ? box.blockSize : Math.round(cssH))
      draw()
    })
    resize.observe(canvas)
    const unsubscribe = useStudio.subscribe(draw)

    // Re-measure when the pixel ratio changes (browser zoom, moving to another monitor).
    let dprQuery: MediaQueryList | null = null
    const watchDpr = () => {
      dprQuery?.removeEventListener('change', onDprChange)
      dprQuery = matchMedia(`(resolution: ${window.devicePixelRatio}dppx)`)
      dprQuery.addEventListener('change', onDprChange)
    }
    const onDprChange = () => {
      resize.unobserve(canvas)
      resize.observe(canvas)
      watchDpr()
    }
    watchDpr()

    return () => {
      dprQuery?.removeEventListener('change', onDprChange)
      unsubscribe()
      resize.disconnect()
      stage.dispose()
      canvas.remove()
    }
  }, [])

  // Playback clock: only advances `time`; drawing happens through the store subscription.
  useEffect(() => {
    if (!playing) return
    let last = performance.now()
    let frame = requestAnimationFrame(function tick(now) {
      const state = useStudio.getState()
      const { time, loop, setTime, setPlaying } = state
      const length = playbackLength(state)
      let next = time + (now - last) / 1000
      last = now
      if (next >= length) {
        if (loop) next %= length
        else {
          setTime(length)
          setPlaying(false)
          return
        }
      }
      setTime(next)
      frame = requestAnimationFrame(tick)
    })
    return () => cancelAnimationFrame(frame)
  }, [playing])

  return (
    <div
      ref={containerRef}
      className="relative aspect-video w-full overflow-hidden rounded-lg bg-neutral-900 shadow-2xl ring-1 ring-white/10"
    />
  )
}
