import { EFFECTS, EFFECT_GROUPS, EFFECT_IDS, type Direction, type EffectId } from '../engine/effects'
import { TRANSITIONS, TRANSITION_IDS, type TransitionId } from '../engine/transitions'
import { Caption, OptionGrid, Segmented } from './controls'

const effectOption = (id: EffectId) => ({ value: id, label: EFFECTS[id].label, title: EFFECTS[id].description })

/** Every effect, grouped by style. With `allowNone`, also "Ninguna" (for exits). */
export function EffectPicker(props: {
  value: EffectId | 'none'
  onChange: (value: EffectId | 'none') => void
  label: string
  allowNone?: boolean
}) {
  return (
    <div className="flex flex-col gap-2.5">
      {props.allowNone && (
        <OptionGrid<EffectId | 'none'>
          label={props.label}
          value={props.value}
          columns={1}
          options={[{ value: 'none', label: 'Ninguna (termina con el logo en pantalla)' }]}
          onChange={props.onChange}
        />
      )}
      {EFFECT_GROUPS.map((group) => (
        <div key={group.id} className="flex flex-col gap-1">
          <Caption>{group.label}</Caption>
          <OptionGrid<EffectId | 'none'>
            label={`${props.label}: ${group.label}`}
            value={props.value}
            options={EFFECT_IDS.filter((id) => EFFECTS[id].group === group.id).map(effectOption)}
            onChange={props.onChange}
          />
        </div>
      ))}
    </div>
  )
}

export function TransitionPicker(props: { value: TransitionId; onChange: (value: TransitionId) => void }) {
  return (
    <OptionGrid<TransitionId>
      label="Transición"
      value={props.value}
      columns={2}
      options={TRANSITION_IDS.map((id) => ({ value: id, label: TRANSITIONS[id].label, title: TRANSITIONS[id].description }))}
      onChange={props.onChange}
    />
  )
}

const ARROWS: Record<Direction, { label: string; title: string }> = {
  left: { label: '←', title: 'Hacia la izquierda' },
  right: { label: '→', title: 'Hacia la derecha' },
  up: { label: '↑', title: 'Hacia arriba' },
  down: { label: '↓', title: 'Hacia abajo' },
}

/** Which way the motion travels. */
export function DirectionPicker(props: {
  value: Direction
  options: readonly Direction[]
  onChange: (value: Direction) => void
}) {
  return (
    <div className="flex items-center justify-between gap-3 text-sm text-neutral-300">
      <span>Dirección</span>
      <div className="w-40">
        <Segmented<Direction>
          label="Dirección"
          value={props.value}
          options={props.options.map((d) => ({ value: d, ...ARROWS[d] }))}
          onChange={props.onChange}
        />
      </div>
    </div>
  )
}

const ANGLES = [
  { angle: 0, label: '→', title: 'Hacia la derecha' },
  { angle: 45, label: '↗', title: 'Diagonal hacia arriba' },
  { angle: 90, label: '↑', title: 'Hacia arriba' },
  { angle: 135, label: '↖', title: 'Diagonal hacia arriba e izquierda' },
  { angle: 180, label: '←', title: 'Hacia la izquierda' },
  { angle: 225, label: '↙', title: 'Diagonal hacia abajo e izquierda' },
  { angle: 270, label: '↓', title: 'Hacia abajo' },
  { angle: 315, label: '↘', title: 'Diagonal hacia abajo' },
]

/** Travel direction of the shine, in 45° steps. */
export function AnglePicker(props: { value: number; onChange: (angle: number) => void }) {
  const current = ANGLES.find((a) => a.angle === ((props.value % 360) + 360) % 360)
  return (
    <Segmented<string>
      label="Dirección del brillo"
      value={current ? String(current.angle) : null}
      options={ANGLES.map((a) => ({ value: String(a.angle), label: a.label, title: a.title }))}
      onChange={(v) => props.onChange(Number(v))}
    />
  )
}
