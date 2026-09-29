import { useState, type ReactNode } from 'react'
import { ACCEPTED_TYPES, decodeFile } from '../processing/decode'
import { EFFECTS, EFFECT_IDS } from '../engine/effects'
import { CLIP_DURATION, entryDurationOf, useStudio, type Resolution } from '../state/store'
import { Thumbnail } from './Thumbnail'

export function Sidebar() {
  const settings = useStudio((s) => s.settings)
  const resolution = useStudio((s) => s.resolution)
  const { updateSettings, setResolution } = useStudio.getState()

  return (
    <aside className="flex w-80 shrink-0 flex-col gap-6 overflow-y-auto border-r border-white/10 bg-neutral-950 p-5">
      <Section title="Logo">
        <DropZone />
        <LogoPanel />
      </Section>

      <Section title="Escena">
        <Row label="Color de fondo">
          <input
            type="color"
            value={settings.background}
            onChange={(e) => updateSettings({ background: e.target.value })}
            className="h-7 w-10 cursor-pointer rounded border border-white/20 bg-transparent"
          />
        </Row>
        <Row label="Sombra de contacto">
          <input
            type="checkbox"
            checked={settings.shadow}
            onChange={(e) => updateSettings({ shadow: e.target.checked })}
            className="accent-white"
          />
        </Row>
        <Row label="Resolución de export">
          <select
            value={resolution}
            onChange={(e) => setResolution(Number(e.target.value) as Resolution)}
            className="rounded border border-white/20 bg-neutral-900 px-2 py-1 text-sm"
          >
            <option value={1080}>1920 × 1080</option>
            <option value={2160}>3840 × 2160 (4K)</option>
          </select>
        </Row>
      </Section>
    </aside>
  )
}

function DropZone() {
  const loadLogo = useStudio((s) => s.loadLogo)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [over, setOver] = useState(false)

  const onFile = async (file: File | undefined) => {
    if (!file) return
    setError(null)
    setBusy(true)
    try {
      loadLogo(file.name, await decodeFile(file))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo leer la imagen.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <label
        onDragOver={(e) => {
          e.preventDefault()
          setOver(true)
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          e.preventDefault()
          setOver(false)
          void onFile(e.dataTransfer.files[0])
        }}
        className={`flex cursor-pointer flex-col items-center justify-center gap-1 rounded-md border border-dashed px-3 py-5 text-center text-sm transition ${
          over ? 'border-white/60 bg-white/10' : 'border-white/20 text-neutral-300 hover:border-white/40 hover:bg-white/5'
        }`}
      >
        <span>{busy ? 'Cargando…' : 'Arrastra un logo o haz clic'}</span>
        <span className="text-xs text-neutral-500">PNG o SVG con fondo transparente</span>
        <input
          type="file"
          accept={[...ACCEPTED_TYPES, '.svg'].join(',')}
          className="hidden"
          onChange={(e) => {
            void onFile(e.target.files?.[0])
            e.target.value = ''
          }}
        />
      </label>
      {error && <p className="text-sm text-red-400">{error}</p>}
    </>
  )
}

function LogoPanel() {
  const logo = useStudio((s) => s.logo)
  const resolution = useStudio((s) => s.resolution)
  const updateLogoOptions = useStudio((s) => s.updateLogoOptions)
  const setLogoEffect = useStudio((s) => s.setLogoEffect)
  if (!logo) return null

  const { options, processed } = logo
  const analysis = processed?.analysis
  const density = processed ? processed.baseDensity / options.scale : null

  return (
    <div className="flex flex-col gap-3 rounded-lg bg-white/[0.03] p-3 ring-1 ring-white/10">
      <Thumbnail logo={processed?.stage ?? null} />
      <p className="truncate text-sm text-neutral-200" title={logo.name}>
        {logo.name}
      </p>

      <div className="grid grid-cols-3 gap-1 rounded-md bg-black/40 p-1" role="radiogroup" aria-label="Efecto">
        {EFFECT_IDS.map((id) => (
          <button
            key={id}
            type="button"
            role="radio"
            aria-checked={options.effect === id}
            title={EFFECTS[id].description}
            onClick={() => setLogoEffect(id)}
            className={`rounded px-1.5 py-1.5 text-xs transition ${
              options.effect === id ? 'bg-white text-neutral-900' : 'text-neutral-400 hover:bg-white/10 hover:text-white'
            }`}
          >
            {EFFECTS[id].label}
          </button>
        ))}
      </div>
      <Slider
        label="Duración de entrada"
        value={entryDurationOf(options)}
        min={0.5}
        max={Math.min(3, CLIP_DURATION - 1)}
        step={0.05}
        format={(v) => `${v.toFixed(2)} s`}
        onChange={(entryDuration) => updateLogoOptions({ entryDuration })}
        onReset={() => updateLogoOptions({ entryDuration: null })}
      />

      {logo.error && <Notice tone="error">{logo.error}</Notice>}

      {analysis?.hasTransparency && !options.removeWhite && <Notice tone="ok">Fondo transparente</Notice>}
      {analysis && !analysis.hasTransparency && !options.removeWhite && (
        <Notice tone="warn">
          Esta imagen no tiene fondo transparente: se verá como un recuadro sobre el fondo del video.{' '}
          {analysis.lightBorder
            ? 'Sube un PNG o SVG transparente, o activa «Quitar fondo blanco».'
            : 'El fondo no es blanco, así que no se puede quitar automáticamente. Sube un PNG o SVG transparente.'}
        </Notice>
      )}
      {options.removeWhite && (
        <Notice tone="info">
          Fondo blanco quitado automáticamente. Revisa los bordes; para fidelidad total usa un archivo
          transparente.
        </Notice>
      )}
      {density !== null && density < 1 && (
        <Notice tone="warn">
          Resolución baja: a {resolution}p este logo se ampliará {(1 / density).toFixed(1)}× y se verá
          borroso. Usa una versión más grande o un SVG.
        </Notice>
      )}

      {analysis && (!analysis.hasTransparency || options.removeWhite) && (
        <Row label="Quitar fondo blanco">
          <input
            type="checkbox"
            checked={options.removeWhite}
            onChange={(e) => updateLogoOptions({ removeWhite: e.target.checked })}
            className="accent-white"
          />
        </Row>
      )}
      {options.removeWhite && (
        <Row label="También huecos interiores">
          <input
            type="checkbox"
            checked={options.removeEnclosedWhite}
            onChange={(e) => updateLogoOptions({ removeEnclosedWhite: e.target.checked })}
            className="accent-white"
            title="Quita el blanco dentro de letras como o, a, e. También quitaría elementos blancos del logo."
          />
        </Row>
      )}
      {options.removeWhite && (
        <Slider
          label="Umbral de blanco"
          value={options.whiteThreshold}
          min={0}
          max={60}
          step={1}
          format={(v) => String(v)}
          onChange={(whiteThreshold) => updateLogoOptions({ whiteThreshold })}
        />
      )}

      <Slider
        label="Escala"
        value={options.scale}
        min={0.5}
        max={1.5}
        step={0.01}
        format={(v) => `${Math.round(v * 100)}%`}
        onChange={(scale) => updateLogoOptions({ scale })}
        onReset={() => updateLogoOptions({ scale: 1 })}
      />
    </div>
  )
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-xs font-semibold tracking-wider text-neutral-500 uppercase">{title}</h2>
      {children}
    </section>
  )
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="flex cursor-pointer items-center justify-between gap-3 text-sm text-neutral-300">
      {label}
      {children}
    </label>
  )
}

function Slider(props: {
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
      />
    </div>
  )
}

const NOTICE_STYLES = {
  ok: 'bg-emerald-500/10 text-emerald-300 ring-emerald-500/20',
  info: 'bg-sky-500/10 text-sky-200 ring-sky-500/20',
  warn: 'bg-amber-500/10 text-amber-200 ring-amber-500/25',
  error: 'bg-red-500/10 text-red-300 ring-red-500/25',
}
const NOTICE_ICONS = { ok: '✓', info: 'i', warn: '⚠', error: '✕' }

function Notice({ tone, children }: { tone: keyof typeof NOTICE_STYLES; children: ReactNode }) {
  return (
    <div className={`flex gap-2 rounded-md px-2.5 py-2 text-xs leading-relaxed ring-1 ${NOTICE_STYLES[tone]}`}>
      <span aria-hidden className="font-semibold">
        {NOTICE_ICONS[tone]}
      </span>
      <span>{children}</span>
    </div>
  )
}
