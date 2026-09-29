import { useState } from 'react'
import { ACCEPTED_TYPES, decodeFile } from '../processing/decode'
import { useStudio, type NewLogo } from '../state/store'

/** Accepts several logos at once, by drag & drop or file picker. */
export function DropZone() {
  const addLogos = useStudio((s) => s.addLogos)
  const [errors, setErrors] = useState<string[]>([])
  const [busy, setBusy] = useState(false)
  const [over, setOver] = useState(false)

  const onFiles = async (files: File[]) => {
    if (files.length === 0) return
    setErrors([])
    setBusy(true)
    const results = await Promise.allSettled(files.map(decodeFile))
    const added: NewLogo[] = []
    const failed: string[] = []
    results.forEach((r, i) => {
      if (r.status === 'fulfilled') added.push({ name: files[i].name, source: r.value, file: files[i] })
      else failed.push(`${files[i].name}: ${r.reason instanceof Error ? r.reason.message : 'no se pudo leer'}`)
    })
    addLogos(added)
    setErrors(failed)
    setBusy(false)
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
          void onFiles([...e.dataTransfer.files])
        }}
        className={`flex cursor-pointer flex-col items-center justify-center gap-1 rounded-md border border-dashed px-3 py-4 text-center text-sm transition ${
          over ? 'border-white/60 bg-white/10' : 'border-white/20 text-neutral-300 hover:border-white/40 hover:bg-white/5'
        }`}
      >
        <span>{busy ? 'Cargando…' : 'Arrastra logos o haz clic'}</span>
        <span className="text-xs text-neutral-500">PNG o SVG con fondo transparente · varios a la vez</span>
        <input
          type="file"
          multiple
          accept={[...ACCEPTED_TYPES, '.svg'].join(',')}
          className="hidden"
          onChange={(e) => {
            void onFiles([...(e.target.files ?? [])])
            e.target.value = ''
          }}
        />
      </label>
      {errors.map((error) => (
        <p key={error} className="text-xs text-red-400">
          {error}
        </p>
      ))}
    </>
  )
}
