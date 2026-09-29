import { useRef, useState } from 'react'
import { hasWebCodecs } from '../export/codec'
import { baseName, downloadBlob } from '../export/download'
import { exportLogoMp4 } from '../export/exportLogo'
import { clipSpecOf, useStudio } from '../state/store'

type ExportStatus =
  | { kind: 'idle' }
  | { kind: 'running'; done: number; total: number; fps: number; remaining: number }
  | { kind: 'done'; fileName: string; bytes: number; seconds: number }
  | { kind: 'canceled' }
  | { kind: 'error'; message: string }

const PROGRESS_INTERVAL_MS = 100

export function ExportPanel() {
  const ready = useStudio((s) => s.logo?.processed != null)
  const [status, setStatus] = useState<ExportStatus>({ kind: 'idle' })
  const abortRef = useRef<AbortController | null>(null)
  const running = status.kind === 'running'

  const exportThisLogo = async () => {
    const s = useStudio.getState()
    const logo = s.logo
    if (!logo?.processed || running) return
    s.setPlaying(false)

    const controller = new AbortController()
    abortRef.current = controller
    const startedAt = performance.now()
    let lastUpdate = 0
    setStatus({ kind: 'running', done: 0, total: 1, fps: 0, remaining: 0 })

    try {
      const blob = await exportLogoMp4({
        logo: logo.processed.stage,
        scale: logo.options.scale,
        clip: clipSpecOf(logo.options, s.padEnds),
        settings: s.settings,
        format: { width: (s.resolution * 16) / 9, height: s.resolution, fps: s.fps },
        signal: controller.signal,
        onProgress: (done, total) => {
          const now = performance.now()
          if (done < total && now - lastUpdate < PROGRESS_INTERVAL_MS) return
          lastUpdate = now
          const rate = done / Math.max((now - startedAt) / 1000, 0.001)
          setStatus({ kind: 'running', done, total, fps: rate, remaining: (total - done) / rate })
        },
      })
      const fileName = `${baseName(logo.name)}_${s.resolution}p${s.fps}.mp4`
      downloadBlob(blob, fileName)
      setStatus({ kind: 'done', fileName, bytes: blob.size, seconds: (performance.now() - startedAt) / 1000 })
    } catch (e) {
      if (controller.signal.aborted) setStatus({ kind: 'canceled' })
      else setStatus({ kind: 'error', message: e instanceof Error ? e.message : 'El export falló.' })
    } finally {
      abortRef.current = null
    }
  }

  return (
    <div className="flex flex-col gap-3 rounded-lg bg-neutral-900 px-4 py-3 ring-1 ring-white/10">
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => void exportThisLogo()}
          disabled={!ready || running || !hasWebCodecs()}
          className="rounded-md bg-white px-4 py-2 text-sm font-medium text-neutral-900 transition enabled:hover:bg-neutral-200 disabled:cursor-not-allowed disabled:opacity-40"
        >
          Exportar este logo
        </button>
        {running && (
          <button
            type="button"
            onClick={() => abortRef.current?.abort()}
            className="rounded-md px-3 py-2 text-sm text-neutral-300 ring-1 ring-white/20 transition hover:bg-white/10"
          >
            Cancelar
          </button>
        )}
        <StatusLine status={status} />
      </div>
      {running && <ProgressBar value={status.done / status.total} />}
    </div>
  )
}

function StatusLine({ status }: { status: ExportStatus }) {
  const base = 'min-w-0 flex-1 truncate text-right text-xs'
  switch (status.kind) {
    case 'idle':
      return <span className={`${base} text-neutral-500`}>MP4 H.264 · se descarga al terminar</span>
    case 'running':
      return (
        <span className={`${base} font-mono tabular-nums text-neutral-400`}>
          {status.done > 0
            ? `${status.done}/${status.total} frames · ${status.fps.toFixed(0)} fps · quedan ~${Math.ceil(status.remaining)} s`
            : 'Preparando…'}
        </span>
      )
    case 'done':
      return (
        <span className={`${base} text-emerald-300`} title={status.fileName}>
          ✓ {status.fileName} · {(status.bytes / 1e6).toFixed(1)} MB · {status.seconds.toFixed(1)} s
        </span>
      )
    case 'canceled':
      return <span className={`${base} text-neutral-400`}>Export cancelado</span>
    case 'error':
      return (
        <span className={`${base} text-red-400`} title={status.message}>
          {status.message}
        </span>
      )
  }
}

function ProgressBar({ value }: { value: number }) {
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/10">
      <div className="h-full rounded-full bg-sky-400 transition-[width]" style={{ width: `${value * 100}%` }} />
    </div>
  )
}
