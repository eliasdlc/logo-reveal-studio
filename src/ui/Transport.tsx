import { CLIP_DURATION, useStudio } from '../state/store'

const FRAME = 1 / 60

export function Transport() {
  const { time, playing, loop, setTime, setPlaying, setLoop } = useStudio()

  const togglePlay = () => {
    if (!playing && time >= CLIP_DURATION) setTime(0)
    setPlaying(!playing)
  }

  return (
    <div className="flex items-center gap-4 rounded-lg bg-neutral-900 px-4 py-3 ring-1 ring-white/10">
      <button
        type="button"
        onClick={togglePlay}
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white text-neutral-900 transition hover:bg-neutral-200"
        aria-label={playing ? 'Pausar' : 'Reproducir'}
      >
        {playing ? (
          <svg viewBox="0 0 16 16" className="h-4 w-4" fill="currentColor">
            <rect x="3" y="2" width="3.5" height="12" rx="1" />
            <rect x="9.5" y="2" width="3.5" height="12" rx="1" />
          </svg>
        ) : (
          <svg viewBox="0 0 16 16" className="ml-0.5 h-4 w-4" fill="currentColor">
            <path d="M4 2.5v11a.5.5 0 0 0 .77.42l8.5-5.5a.5.5 0 0 0 0-.84l-8.5-5.5A.5.5 0 0 0 4 2.5z" />
          </svg>
        )}
      </button>

      <input
        type="range"
        min={0}
        max={CLIP_DURATION}
        step={FRAME}
        value={time}
        onChange={(e) => {
          setPlaying(false)
          setTime(Number(e.target.value))
        }}
        className="h-1 w-full cursor-pointer accent-white"
        aria-label="Tiempo"
      />

      <span className="w-24 shrink-0 text-right font-mono text-xs tabular-nums text-neutral-400">
        {time.toFixed(2)} / {CLIP_DURATION.toFixed(2)} s
      </span>

      <label className="flex shrink-0 cursor-pointer items-center gap-2 text-xs text-neutral-400 select-none">
        <input
          type="checkbox"
          checked={loop}
          onChange={(e) => setLoop(e.target.checked)}
          className="accent-white"
        />
        Loop
      </label>
    </div>
  )
}
