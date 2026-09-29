import { useEffect, useRef } from 'react'
import { LogoStage } from '../engine/stage'
import type { StageLogo } from '../engine/types'
import { CLIP_DURATION, useStudio } from '../state/store'

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
      stage.setEffect(s.effect)
      stage.renderFrame(s.time)
    }

    const resize = new ResizeObserver(([entry]) => {
      const box = entry.devicePixelContentBoxSize?.[0]
      const dpr = window.devicePixelRatio
      stage.setSize(
        box ? box.inlineSize : entry.contentRect.width * dpr,
        box ? box.blockSize : entry.contentRect.height * dpr,
      )
      draw()
    })
    resize.observe(canvas)
    const unsubscribe = useStudio.subscribe(draw)

    return () => {
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
      const { time, loop, setTime, setPlaying } = useStudio.getState()
      let next = time + (now - last) / 1000
      last = now
      if (next >= CLIP_DURATION) {
        if (loop) next %= CLIP_DURATION
        else {
          setTime(CLIP_DURATION)
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
