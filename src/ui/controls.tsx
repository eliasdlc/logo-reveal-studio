import type { ReactNode } from 'react'

export function Section({ title, aside, children }: { title: ReactNode; aside?: ReactNode; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <h2 className="text-xs font-semibold tracking-wider text-neutral-500 uppercase">{title}</h2>
        {aside}
      </div>
      {children}
    </section>
  )
}

export function Row({ label, children }: { label: ReactNode; children: ReactNode }) {
  return (
    <label className="flex cursor-pointer items-center justify-between gap-3 text-sm text-neutral-300">
      {label}
      {children}
    </label>
  )
}

export function Select<T extends string | number>(props: {
  value: T
  options: { value: T; label: string }[]
  onChange: (value: T) => void
}) {
  return (
    <select
      value={props.value}
      onChange={(e) => {
        const option = props.options.find((o) => String(o.value) === e.target.value)
        if (option) props.onChange(option.value)
      }}
      className="rounded border border-white/20 bg-neutral-900 px-2 py-1 text-sm"
    >
      {props.options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  )
}

export function Slider(props: {
  label: string
  value: number
  min: number
  max: number
  step: number
  format: (v: number) => string
  onChange: (v: number) => void
  onReset?: () => void
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between text-sm text-neutral-300">
        <span>{props.label}</span>
        <button
          type="button"
          onClick={props.onReset}
          disabled={!props.onReset}
          className="font-mono text-xs text-neutral-400 tabular-nums enabled:hover:text-white"
          title={props.onReset ? 'Restablecer' : undefined}
        >
          {props.format(props.value)}
        </button>
      </div>
      <input
        type="range"
        min={props.min}
        max={props.max}
        step={props.step}
        value={props.value}
        onChange={(e) => props.onChange(Number(e.target.value))}
        className="h-1 w-full cursor-pointer accent-white"
        aria-label={props.label}
      />
    </div>
  )
}

export function Segmented<T extends string>(props: {
  value: T | null
  options: { value: T; label: string; title?: string }[]
  onChange: (value: T) => void
  label: string
}) {
  return (
    <div
      className="grid gap-1 rounded-md bg-black/40 p-1"
      style={{ gridTemplateColumns: `repeat(${props.options.length}, minmax(0, 1fr))` }}
      role="radiogroup"
      aria-label={props.label}
    >
      {props.options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={props.value === o.value}
          title={o.title}
          onClick={() => props.onChange(o.value)}
          className={`truncate rounded px-1.5 py-1.5 text-xs transition ${
            props.value === o.value ? 'bg-white text-neutral-900' : 'text-neutral-400 hover:bg-white/10 hover:text-white'
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

/** A grid of choices that may wrap onto two lines (effect and transition pickers). */
export function OptionGrid<T extends string>(props: {
  value: T | null
  options: { value: T; label: string; title?: string }[]
  onChange: (value: T) => void
  label: string
  columns?: number
}) {
  return (
    <div
      className="grid gap-1"
      style={{ gridTemplateColumns: `repeat(${props.columns ?? 3}, minmax(0, 1fr))` }}
      role="radiogroup"
      aria-label={props.label}
    >
      {props.options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={props.value === o.value}
          title={o.title}
          onClick={() => props.onChange(o.value)}
          className={`min-h-8 rounded-md px-1.5 py-1.5 text-center text-xs leading-tight transition ${
            props.value === o.value
              ? 'bg-white font-medium text-neutral-900'
              : 'bg-white/[0.04] text-neutral-300 ring-1 ring-white/10 hover:bg-white/10 hover:text-white'
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

/** Small uppercase caption above a group of controls. */
export function Caption({ children }: { children: ReactNode }) {
  return <p className="text-[10px] font-medium tracking-wider text-neutral-500 uppercase">{children}</p>
}

const NOTICE_STYLES = {
  ok: 'bg-emerald-500/10 text-emerald-300 ring-emerald-500/20',
  info: 'bg-sky-500/10 text-sky-200 ring-sky-500/20',
  warn: 'bg-amber-500/10 text-amber-200 ring-amber-500/25',
  error: 'bg-red-500/10 text-red-300 ring-red-500/25',
}
const NOTICE_ICONS = { ok: '✓', info: 'i', warn: '⚠', error: '✕' }

export type NoticeTone = keyof typeof NOTICE_STYLES

export function Notice({ tone, children }: { tone: NoticeTone; children: ReactNode }) {
  return (
    <div className={`flex gap-2 rounded-md px-2.5 py-2 text-xs leading-relaxed ring-1 ${NOTICE_STYLES[tone]}`}>
      <span aria-hidden className="font-semibold">
        {NOTICE_ICONS[tone]}
      </span>
      <span>{children}</span>
    </div>
  )
}
