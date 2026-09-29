import { clipSegments, type ClipSegment } from '../engine/timeline'
import { clipSpecOf, entryDurationOf, playbackLength, useStudio } from '../state/store'

const FRAME = 1 / 60

const SEGMENT_STYLE: Record<ClipSegment['kind'], { className: string; label: string }> = {
  empty: { className: 'bg-white/5', label: 'Vacío' },
  entry: { className: 'bg-sky-400/70', label: 'Entrada' },
  hold: { className: 'bg-white/20', label: 'Hold' },
  exit: { className: 'bg-violet-400/60', label: 'Salida' },
}

export function Transport() {
  const time = useStudio((s) => s.time)
  const playing = useStudio((s) => s.playing)
  const loop = useStudio((s) => s.loop)
  const logo = useStudio((s) => s.logo)
  const padEnds = useStudio((s) => s.padEnds)
  const { setTime, setPlaying, setLoop } = useStudio.getState()

  const length = playbackLength({ logo, padEnds })
  const segments = logo ? clipSegments(clipSpecOf(logo.options, padEnds), entryDurationOf(logo.options)) : []

  const togglePlay = () => {
    if (!playing && time >= length) setTime(0)
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

      <div className="flex w-full flex-col gap-2">
        <input
          type="range"
          min={0}
          max={length}
          step={FRAME}
          value={Math.min(time, length)}
          onChange={(e) => {
            setPlaying(false)
            setTime(Number(e.target.value))
          }}
          className="h-1 w-full cursor-pointer accent-white"
          aria-label="Tiempo"
        />
        {/* The parts of the clip: empty background, entry, hold, exit. */}
        <div className="flex h-1 w-full gap-px overflow-hidden rounded-full">
          {segments.map((seg, i) => (
            <div
              key={i}
              className={SEGMENT_STYLE[seg.kind].className}
              style={{ width: `${((seg.end - seg.start) / length) * 100}%` }}
              title={`${SEGMENT_STYLE[seg.kind].label} ${(seg.end - seg.start).toFixed(2)} s`}
            />
          ))}
        </div>
        <div className="flex gap-3 text-[10px] text-neutral-500">
          {segments
            .filter((seg) => seg.kind !== 'empty')
            .map((seg) => (
              <span key={seg.kind}>
                {SEGMENT_STYLE[seg.kind].label} {(seg.end - seg.start).toFixed(2)} s
              </span>
            ))}
        </div>
      </div>

      <span className="w-24 shrink-0 text-right font-mono text-xs tabular-nums text-neutral-400">
        {Math.min(time, length).toFixed(2)} / {length.toFixed(2)} s
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
