import { logoIssues } from '../state/issues'
import { CLIP_DURATION, entryDurationOf, selectedLogo, useStudio } from '../state/store'
import { Notice, Row, Segmented, Slider } from './controls'
import { EFFECT_OPTIONS } from './effectOptions'
import { Thumbnail } from './Thumbnail'

/** Settings of the selected logo. */
export function LogoDetails() {
  const logo = useStudio(selectedLogo)
  const resolution = useStudio((s) => s.resolution)
  const { updateLogoOptions, setLogoEffect } = useStudio.getState()
  if (!logo) return null

  const { id, options, processed } = logo
  const analysis = processed?.analysis
  const issues = logoIssues(logo)
  const update = (patch: Parameters<typeof updateLogoOptions>[1]) => updateLogoOptions(id, patch)

  return (
    <div className="flex flex-col gap-3 rounded-lg bg-white/[0.03] p-3 ring-1 ring-white/10">
      <Thumbnail logo={processed?.stage ?? null} />
      <p className="truncate text-sm text-neutral-200" title={logo.name}>
        {logo.name}
      </p>

      <Segmented label="Efecto" value={options.effect} options={EFFECT_OPTIONS} onChange={(e) => setLogoEffect(id, e)} />
      <Slider
        label="Duración de entrada"
        value={entryDurationOf(options)}
        min={0.5}
        max={Math.min(3, CLIP_DURATION - 1)}
        step={0.05}
        format={(v) => `${v.toFixed(2)} s`}
        onChange={(entryDuration) => update({ entryDuration })}
        onReset={() => update({ entryDuration: null })}
      />

      {logo.error && <Notice tone="error">{logo.error}</Notice>}
      {analysis?.hasTransparency && !options.removeWhite && <Notice tone="ok">Fondo transparente</Notice>}
      {analysis && issues.opaque && (
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
      {issues.upscale && (
        <Notice tone="warn">
          Resolución baja: a {resolution}p este logo se ampliará {issues.upscale.toFixed(1)}× y se verá borroso.
          Usa una versión más grande o un SVG.
        </Notice>
      )}

      {analysis && (!analysis.hasTransparency || options.removeWhite) && (
        <Row label="Quitar fondo blanco">
          <input
            type="checkbox"
            checked={options.removeWhite}
            onChange={(e) => update({ removeWhite: e.target.checked })}
            className="accent-white"
          />
        </Row>
      )}
      {options.removeWhite && (
        <>
          <Row label="También huecos interiores">
            <input
              type="checkbox"
              checked={options.removeEnclosedWhite}
              onChange={(e) => update({ removeEnclosedWhite: e.target.checked })}
              className="accent-white"
              title="Quita el blanco dentro de letras como o, a, e. También quitaría elementos blancos del logo."
            />
          </Row>
          <Slider
            label="Umbral de blanco"
            value={options.whiteThreshold}
            min={0}
            max={60}
            step={1}
            format={(v) => String(v)}
            onChange={(whiteThreshold) => update({ whiteThreshold })}
          />
        </>
      )}

      <Slider
        label="Escala"
        value={options.scale}
        min={0.5}
        max={1.5}
        step={0.01}
        format={(v) => `${Math.round(v * 100)}%`}
        onChange={(scale) => update({ scale })}
        onReset={() => update({ scale: 1 })}
      />
    </div>
  )
}
