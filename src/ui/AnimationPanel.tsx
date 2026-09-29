import type { ReactNode } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { EFFECTS, directionFor, type EffectId, type ShineStyle } from '../engine/effects'
import type { SegmentKind } from '../engine/timeline'
import { TRANSITIONS, type TransitionId } from '../engine/transitions'
import {
  DEFAULT_ANIMATION,
  motionDuration,
  transitionDuration,
  type AnimationPatch,
  type DriftSettings,
  type MotionSettings,
} from '../state/animation'
import { fullSequenceProgram, previewTimeFor } from '../state/program'
import { selectedLogo, useStudio } from '../state/store'
import { Notice, Row, Section, Segmented, Slider } from './controls'
import { AnglePicker, DirectionPicker, EffectPicker, TransitionPicker } from './pickers'

const seconds = (v: number) => `${v.toFixed(2)} s`
const percent = (v: number) => `${Math.round(v * 100)}%`

/** Jumps the preview to just before one part of the animation and plays it. */
function showPart(kind: SegmentKind) {
  const s = useStudio.getState()
  const t = previewTimeFor(s, kind)
  if (t === null) return
  s.setTime(t)
  s.setPlaying(true)
}

function PlayPart({ kind }: { kind: SegmentKind }) {
  return (
    <button
      type="button"
      onClick={() => showPart(kind)}
      className="rounded px-1.5 py-0.5 text-[11px] text-neutral-400 transition hover:bg-white/10 hover:text-white"
      title="Reproducir esta parte en el preview"
    >
      ▶ Ver
    </button>
  )
}

/** Everything about how logos move: entry, shine, hold, exit, and the sequence transitions. */
export function AnimationPanel() {
  const logo = useStudio(selectedLogo)
  const general = useStudio((s) => s.animation)
  const customCount = useStudio((s) => s.logos.filter((l) => l.options.animation).length)
  const { updateAnimation, customizeAnimation, resetAnimation, applyAnimationToAll } = useStudio.getState()

  const own = logo?.options.animation ?? null
  const animation = own ?? general
  const update = (patch: AnimationPatch) => updateAnimation(own && logo ? logo.id : null, patch)
  const { entry, exit, shine, drift } = animation
  const onScreen = motionDuration(entry) + animation.hold + (exit.enabled ? motionDuration(exit) : 0)

  const chooseEntry = (effect: EffectId | 'none') => {
    if (effect === 'none') return
    update({ entry: { effect, duration: null, direction: EFFECTS[effect].defaultDirection } })
    showPart('entry')
  }
  const chooseExit = (effect: EffectId | 'none') => {
    if (effect === 'none') update({ exit: { enabled: false } })
    else update({ exit: { enabled: true, effect, duration: null, direction: EFFECTS[effect].defaultDirection } })
    showPart('exit')
  }

  return (
    <aside className="flex w-80 shrink-0 flex-col gap-6 overflow-y-auto border-l border-white/10 bg-neutral-950 p-5">
      <Section title="Animación">
        <div className="flex flex-col gap-2 rounded-lg bg-white/[0.03] p-3 text-xs leading-relaxed text-neutral-400 ring-1 ring-white/10">
          {own && logo ? (
            <>
              <p>
                Animación propia de <span className="text-neutral-200">{logo.name}</span>: los cambios solo afectan a
                este logo.
              </p>
              <div className="flex flex-wrap gap-x-3 gap-y-1">
                <LinkButton onClick={() => resetAnimation(logo.id)}>Volver a la general</LinkButton>
                <LinkButton onClick={() => applyAnimationToAll(logo.id)}>Usarla para todos</LinkButton>
              </div>
            </>
          ) : (
            <>
              <p>
                Animación general: se aplica a todos los logos
                {customCount > 0 && ` excepto ${customCount === 1 ? '1 con animación propia' : `${customCount} con animación propia`}`}.
              </p>
              {logo && (
                <LinkButton onClick={() => customizeAnimation(logo.id)}>
                  Personalizar solo «{logo.name}»
                </LinkButton>
              )}
            </>
          )}
          <p className="text-neutral-500">
            En pantalla {onScreen.toFixed(1)} s: entrada {motionDuration(entry).toFixed(1)} + quieto{' '}
            {animation.hold.toFixed(1)}
            {exit.enabled && ` + salida ${motionDuration(exit).toFixed(1)}`}.
          </p>
        </div>
      </Section>

      <Section title="Entrada" aside={<PlayPart kind="entry" />}>
        <EffectPicker label="Efecto de entrada" value={entry.effect} onChange={chooseEntry} />
        <MotionControls motion={entry} kind="entry" onChange={(patch) => update({ entry: patch })} />
      </Section>

      <Section
        title="Brillo"
        aside={
          <label className="flex cursor-pointer items-center gap-2 text-xs text-neutral-400">
            <input
              type="checkbox"
              checked={shine.enabled}
              onChange={(e) => {
                update({ shine: { enabled: e.target.checked } })
                if (e.target.checked) showPart('hold')
              }}
              className="accent-white"
            />
            Activado
          </label>
        }
      >
        {shine.enabled ? (
          <>
            <Segmented<ShineStyle>
              label="Estilo del brillo"
              value={shine.style}
              options={[
                { value: 'soft', label: 'Suave', title: 'Una banda de luz amplia y difusa' },
                { value: 'glint', label: 'Destello', title: 'Un núcleo nítido con halo suave' },
                { value: 'double', label: 'Doble', title: 'Una banda principal seguida de un reflejo fino' },
              ]}
              onChange={(style) => {
                update({ shine: { style } })
                showPart('hold')
              }}
            />
            <div className="flex flex-col gap-1.5 text-sm text-neutral-300">
              <span>Dirección</span>
              <AnglePicker
                value={shine.angle}
                onChange={(angle) => {
                  update({ shine: { angle } })
                  showPart('hold')
                }}
              />
            </div>
            <Slider
              label="Intensidad"
              value={shine.intensity}
              min={0.1}
              max={1}
              step={0.05}
              format={percent}
              onChange={(intensity) => update({ shine: { intensity } })}
              onReset={() => update({ shine: { intensity: DEFAULT_ANIMATION.shine.intensity } })}
            />
            <Slider
              label="Ancho de la banda"
              value={shine.width}
              min={0.05}
              max={0.6}
              step={0.01}
              format={percent}
              onChange={(width) => update({ shine: { width } })}
              onReset={() => update({ shine: { width: DEFAULT_ANIMATION.shine.width } })}
            />
            <Slider
              label="Duración del cruce"
              value={shine.duration}
              min={0.3}
              max={3}
              step={0.05}
              format={seconds}
              onChange={(duration) => update({ shine: { duration } })}
              onReset={() => update({ shine: { duration: DEFAULT_ANIMATION.shine.duration } })}
            />
            <Slider
              label="Retardo tras la entrada"
              value={shine.delay}
              min={-1.5}
              max={3}
              step={0.05}
              format={(v) => `${v > 0 ? '+' : ''}${v.toFixed(2)} s`}
              onChange={(delay) => update({ shine: { delay } })}
              onReset={() => update({ shine: { delay: DEFAULT_ANIMATION.shine.delay } })}
            />
            <Slider
              label="Repetir"
              value={shine.interval}
              min={0}
              max={8}
              step={0.25}
              format={(v) => (v === 0 ? 'una vez' : `cada ${v.toFixed(2)} s`)}
              onChange={(interval) => update({ shine: { interval } })}
              onReset={() => update({ shine: { interval: 0 } })}
            />
            <p className="text-xs leading-relaxed text-neutral-500">
              Con retardo negativo el brillo cruza mientras el logo todavía está entrando. Las repeticiones solo
              ocurren mientras el logo está quieto.
            </p>
          </>
        ) : (
          <p className="text-xs leading-relaxed text-neutral-500">
            Un reflejo de luz que cruza el logo al terminar la entrada. Se puede combinar con cualquier efecto.
          </p>
        )}
      </Section>

      <Section title="Permanencia" aside={<PlayPart kind="hold" />}>
        <Slider
          label="Tiempo quieto en pantalla"
          value={animation.hold}
          min={0}
          max={12}
          step={0.1}
          format={seconds}
          onChange={(hold) => update({ hold })}
          onReset={() => update({ hold: DEFAULT_ANIMATION.hold })}
        />
        <div className="flex flex-col gap-1.5 text-sm text-neutral-300">
          <span>Movimiento mientras está en pantalla</span>
          <Segmented<DriftSettings['kind']>
            label="Movimiento mientras está en pantalla"
            value={drift.kind}
            options={[
              { value: 'none', label: 'Quieto', title: 'Sin movimiento' },
              { value: 'zoom-in', label: 'Acercar', title: 'Se acerca lentamente a la cámara' },
              { value: 'zoom-out', label: 'Alejar', title: 'Se aleja lentamente' },
              { value: 'float', label: 'Flotar', title: 'Sube y baja muy suavemente' },
            ]}
            onChange={(kind) => update({ drift: { kind } })}
          />
        </div>
        {drift.kind !== 'none' && (
          <Slider
            label="Intensidad del movimiento"
            value={drift.amount}
            min={0.25}
            max={2.5}
            step={0.05}
            format={percent}
            onChange={(amount) => update({ drift: { amount } })}
            onReset={() => update({ drift: { amount: 1 } })}
          />
        )}
      </Section>

      <Section title="Salida" aside={exit.enabled ? <PlayPart kind="exit" /> : undefined}>
        <EffectPicker label="Efecto de salida" allowNone value={exit.enabled ? exit.effect : 'none'} onChange={chooseExit} />
        {exit.enabled && <MotionControls motion={exit} kind="exit" onChange={(patch) => update({ exit: patch })} />}
      </Section>

      <SequenceSection />
    </aside>
  )
}

function LinkButton({ onClick, children }: { onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="self-start text-left text-sky-300 underline-offset-2 hover:text-sky-200 hover:underline"
    >
      {children}
    </button>
  )
}

/** Duration, intensity and direction of an entry or exit. */
function MotionControls(props: {
  motion: MotionSettings
  kind: 'entry' | 'exit'
  onChange: (patch: Partial<MotionSettings>) => void
}) {
  const { motion, kind, onChange } = props
  const def = EFFECTS[motion.effect]
  return (
    <>
      <p className="text-xs leading-relaxed text-neutral-500">
        {kind === 'entry' ? def.description : `La entrada «${def.label}» al revés: el logo se va con el mismo movimiento.`}
      </p>
      <Slider
        label="Duración"
        value={motionDuration(motion)}
        min={0.3}
        max={4}
        step={0.05}
        format={seconds}
        onChange={(duration) => onChange({ duration })}
        onReset={() => onChange({ duration: null })}
      />
      {!def.fixedIntensity && (
        <Slider
          label="Intensidad"
          value={motion.intensity}
          min={0.25}
          max={2}
          step={0.05}
          format={percent}
          onChange={(intensity) => onChange({ intensity })}
          onReset={() => onChange({ intensity: 1 })}
        />
      )}
      {def.directions && (
        <DirectionPicker
          value={directionFor(motion.effect, motion.direction)}
          options={def.directions}
          onChange={(direction) => {
            onChange({ direction })
            showPart(kind)
          }}
        />
      )}
    </>
  )
}

/** How each logo hands over to the next in the combined sequence. */
function SequenceSection() {
  const { logos, animation, sequence } = useStudio(
    useShallow((s) => ({ logos: s.logos, animation: s.animation, sequence: s.sequence })),
  )
  const { updateSequence, setPreviewMode } = useStudio.getState()
  const count = logos.filter((logo) => logo.processed).length
  const length = fullSequenceProgram(logos, animation, sequence).length
  const def = TRANSITIONS[sequence.transition]

  const preview = () => {
    if (count < 2) return
    if (useStudio.getState().previewMode !== 'sequence') setPreviewMode('sequence')
    showPart('transition')
  }
  const choose = (transition: TransitionId) => {
    updateSequence({ transition, duration: null, direction: TRANSITIONS[transition].defaultDirection })
    if (transition === 'sequential') {
      if (count >= 2 && useStudio.getState().previewMode !== 'sequence') setPreviewMode('sequence')
      showPart('exit')
    } else preview()
  }

  return (
    <Section title="Secuencia" aside={def.evaluate && count >= 2 ? <PlayPart kind="transition" /> : undefined}>
      <p className="text-xs leading-relaxed text-neutral-500">
        Cómo pasa cada logo al siguiente en «Secuencia completa».
      </p>
      <TransitionPicker value={sequence.transition} onChange={choose} />
      <p className="text-xs leading-relaxed text-neutral-500">{def.description}</p>
      {def.evaluate && (
        <Slider
          label="Duración de la transición"
          value={transitionDuration(sequence)}
          min={0.3}
          max={4}
          step={0.05}
          format={seconds}
          onChange={(duration) => updateSequence({ duration })}
          onReset={() => updateSequence({ duration: null })}
        />
      )}
      {def.directions && (
        <DirectionPicker
          value={def.directions.includes(sequence.direction) ? sequence.direction : def.defaultDirection}
          options={def.directions}
          onChange={(direction) => {
            updateSequence({ direction })
            preview()
          }}
        />
      )}
      <Row label="Loop perfecto (sin corte al repetir)">
        <input
          type="checkbox"
          checked={sequence.loop}
          onChange={(e) => updateSequence({ loop: e.target.checked })}
          className="accent-white"
        />
      </Row>
      {sequence.loop && (
        <p className="text-xs leading-relaxed text-neutral-500">
          El video empieza con el primer logo ya en pantalla y termina volviendo a él, así se puede repetir en
          una pantalla sin que se note el corte.
        </p>
      )}
      {count < 2 ? (
        <Notice tone="info">Agrega al menos 2 logos para ver las transiciones.</Notice>
      ) : (
        <p className="text-xs text-neutral-500">
          {count} logos · {length.toFixed(1)} s en total
        </p>
      )}
    </Section>
  )
}
