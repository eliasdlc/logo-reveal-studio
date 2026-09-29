import { selectedLogo, useStudio, type PreviewMode } from '../state/store'
import { Segmented } from './controls'

/** Chooses what the preview plays: the selected logo's own video, or the whole sequence. */
export function PreviewModeBar() {
  const mode = useStudio((s) => s.previewMode)
  const name = useStudio((s) => selectedLogo(s)?.name)
  const count = useStudio((s) => s.logos.length)
  const setPreviewMode = useStudio((s) => s.setPreviewMode)

  return (
    <div className="flex items-center justify-between gap-4">
      <div className="w-96">
        <Segmented<PreviewMode>
          label="Qué reproduce el preview"
          value={mode}
          onChange={setPreviewMode}
          options={[
            { value: 'logo', label: 'Logo seleccionado', title: 'Igual que «Exportar este logo»' },
            { value: 'sequence', label: `Secuencia completa (${count})`, title: 'Igual que «Exportar secuencia completa»' },
          ]}
        />
      </div>
      <span className="truncate text-xs text-neutral-500">
        {mode === 'logo' ? name : 'Todos los logos en el orden de la lista'}
      </span>
    </div>
  )
}
