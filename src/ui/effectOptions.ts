import { EFFECTS, EFFECT_IDS } from '../engine/effects'

export const EFFECT_OPTIONS = EFFECT_IDS.map((id) => ({
  value: id,
  label: EFFECTS[id].label,
  title: EFFECTS[id].description,
}))
