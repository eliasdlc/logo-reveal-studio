import { PAD_SECONDS, useStudio, type Fps, type Resolution } from '../state/store'
import { Row, Section, Select } from './controls'
import { DropZone } from './DropZone'
import { LogoDetails } from './LogoDetails'
import { LogoList } from './LogoList'

export function Sidebar() {
  const count = useStudio((s) => s.logos.length)
  const settings = useStudio((s) => s.settings)
  const resolution = useStudio((s) => s.resolution)
  const fps = useStudio((s) => s.fps)
  const padEnds = useStudio((s) => s.padEnds)
  const { updateSettings, setResolution, setFps, setPadEnds } = useStudio.getState()

  return (
    <aside className="flex w-80 shrink-0 flex-col gap-6 overflow-y-auto border-r border-white/10 bg-neutral-950 p-5">
      <Section title={`Logos${count ? ` (${count})` : ''}`}>
        <DropZone />
        <LogoList />
        {count > 1 && <p className="text-[11px] text-neutral-500">Arrastra ⠿ para cambiar el orden de la secuencia.</p>}
      </Section>

      <Section title="Logo seleccionado">
        <LogoDetails />
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
      </Section>

      <Section title="Export">
        <Row label="Resolución">
          <Select<Resolution>
            value={resolution}
            options={[
              { value: 1080, label: '1920 × 1080' },
              { value: 2160, label: '3840 × 2160 (4K)' },
            ]}
            onChange={setResolution}
          />
        </Row>
        <Row label="Fotogramas por segundo">
          <Select<Fps>
            value={fps}
            options={[
              { value: 30, label: '30 fps' },
              { value: 60, label: '60 fps' },
            ]}
            onChange={setFps}
          />
        </Row>
        <Row label={`${PAD_SECONDS} s de fondo vacío al inicio y al final (videos individuales)`}>
          <input
            type="checkbox"
            checked={padEnds}
            onChange={(e) => setPadEnds(e.target.checked)}
            className="accent-white"
          />
        </Row>
        {padEnds && (
          <p className="text-xs leading-relaxed text-neutral-500">
            El video empieza y termina con el fondo vacío. Elige una salida en «Animación» para que el logo no
            desaparezca de golpe.
          </p>
        )}
      </Section>
    </aside>
  )
}
