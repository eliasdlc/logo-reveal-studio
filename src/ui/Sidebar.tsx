import { useState } from 'react'
import { ACCEPTED_TYPES, loadLogoFile } from '../processing/load'
import { useStudio } from '../state/store'

export function Sidebar() {
  const { logoName, settings, setLogo, updateSettings } = useStudio()
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const onFile = async (file: File | undefined) => {
    if (!file) return
    setError(null)
    setLoading(true)
    try {
      setLogo(await loadLogoFile(file), file.name)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo leer la imagen.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <aside className="flex w-72 shrink-0 flex-col gap-6 border-r border-white/10 bg-neutral-950 p-5">
      <section className="flex flex-col gap-3">
        <h2 className="text-xs font-semibold tracking-wider text-neutral-500 uppercase">Logo</h2>
        <label className="flex cursor-pointer items-center justify-center rounded-md border border-dashed border-white/20 px-3 py-4 text-sm text-neutral-300 transition hover:border-white/40 hover:bg-white/5">
          {loading ? 'Procesando…' : 'Cargar logo (PNG o SVG)'}
          <input
            type="file"
            accept={ACCEPTED_TYPES.join(',')}
            className="hidden"
            onChange={(e) => {
              void onFile(e.target.files?.[0])
              e.target.value = ''
            }}
          />
        </label>
        {logoName && <p className="truncate text-sm text-neutral-200">{logoName}</p>}
        {error && <p className="text-sm text-red-400">{error}</p>}
        <p className="text-xs leading-relaxed text-neutral-500">
          Usa logos con <span className="text-neutral-300">fondo transparente</span>. Si la imagen
          trae fondo blanco, se verá como un recuadro sobre el fondo del video.
        </p>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-xs font-semibold tracking-wider text-neutral-500 uppercase">Escena</h2>
        <label className="flex items-center justify-between text-sm text-neutral-300">
          Color de fondo
          <input
            type="color"
            value={settings.background}
            onChange={(e) => updateSettings({ background: e.target.value })}
            className="h-7 w-10 cursor-pointer rounded border border-white/20 bg-transparent"
          />
        </label>
        <label className="flex cursor-pointer items-center justify-between text-sm text-neutral-300">
          Sombra de contacto
          <input
            type="checkbox"
            checked={settings.shadow}
            onChange={(e) => updateSettings({ shadow: e.target.checked })}
            className="accent-white"
          />
        </label>
      </section>
    </aside>
  )
}
