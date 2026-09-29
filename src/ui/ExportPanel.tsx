import { useRef, useState } from 'react'
import type { VideoFormat } from '../export/codec'
import { hasWebCodecs } from '../export/codec'
import { baseName, downloadBlob } from '../export/download'
import { exportProgramMp4, programFrameCount, requireCodec } from '../export/exportProgram'
import { numberedNames, zipFiles } from '../export/zip'
import { logoIssues } from '../state/issues'
import { individualItem, sequenceProgram } from '../state/program'
import { selectedLogo, useStudio } from '../state/store'

type ExportStatus =
  | { kind: 'idle' }
  | { kind: 'running'; task: string; detail: string; done: number; total: number; fps: number; remaining: number }
  | { kind: 'done'; fileName: string; bytes: number; seconds: number }
  | { kind: 'canceled' }
  | { kind: 'error'; message: string }

/** Reports overall progress: frames done so far across the whole task. */
type Report = (done: number, total: number, detail?: string) => void

const PROGRESS_INTERVAL_MS = 100

type State = ReturnType<typeof useStudio.getState>

const formatOf = (s: State): VideoFormat => ({ width: (s.resolution * 16) / 9, height: s.resolution, fps: s.fps })
const suffixOf = (s: State) => `_${s.resolution}p${s.fps}`

export function ExportPanel() {
  const selectedReady = useStudio((s) => selectedLogo(s)?.processed != null)
  const logos = useStudio((s) => s.logos)
  const [status, setStatus] = useState<ExportStatus>({ kind: 'idle' })
  const abortRef = useRef<AbortController | null>(null)
  const running = status.kind === 'running'

  const statuses = logos.map((logo) => logoIssues(logo).status)
  const processing = statuses.includes('processing')
  const ready = statuses.filter((s) => s !== 'processing' && s !== 'error').length
  const failed = statuses.filter((s) => s === 'error').length
  const canExport = hasWebCodecs() && !running

  /** Runs one export task with progress, cancel and download handling. */
  const run = async (task: string, work: (signal: AbortSignal, report: Report) => Promise<{ blob: Blob; fileName: string }>) => {
    if (running) return
    useStudio.getState().setPlaying(false)
    const controller = new AbortController()
    abortRef.current = controller
    const startedAt = performance.now()
    let lastUpdate = 0
    let detail = ''
    setStatus({ kind: 'running', task, detail, done: 0, total: 1, fps: 0, remaining: 0 })

    const report: Report = (done, total, newDetail) => {
      const now = performance.now()
      if (newDetail !== undefined && newDetail !== detail) detail = newDetail
      else if (done < total && now - lastUpdate < PROGRESS_INTERVAL_MS) return
      lastUpdate = now
      const fps = done / Math.max((now - startedAt) / 1000, 0.001)
      setStatus({ kind: 'running', task, detail, done, total, fps, remaining: fps > 0 ? (total - done) / fps : 0 })
    }

    try {
      const { blob, fileName } = await work(controller.signal, report)
      downloadBlob(blob, fileName)
      setStatus({ kind: 'done', fileName, bytes: blob.size, seconds: (performance.now() - startedAt) / 1000 })
    } catch (e) {
      if (controller.signal.aborted) setStatus({ kind: 'canceled' })
      else setStatus({ kind: 'error', message: e instanceof Error ? e.message : 'El export falló.' })
    } finally {
      abortRef.current = null
    }
  }

  const exportSelected = () =>
    run('Este logo', async (signal, report) => {
      const s = useStudio.getState()
      const logo = selectedLogo(s)
      const item = logo && individualItem(logo, s.padEnds)
      if (!logo || !item) throw new Error('El logo todavía no está listo.')
      const blob = await exportProgramMp4({
        program: { items: [item] },
        settings: s.settings,
        format: formatOf(s),
        signal,
        onProgress: (done, total) => report(done, total),
      })
      return { blob, fileName: `${baseName(logo.name)}${suffixOf(s)}.mp4` }
    })

  const exportAllZip = () =>
    run('Todos (ZIP)', async (signal, report) => {
      const s = useStudio.getState()
      const format = formatOf(s)
      const codec = await requireCodec(format)
      const jobs = s.logos.flatMap((logo) => {
        const item = individualItem(logo, s.padEnds)
        return item ? [{ logo, program: { items: [item] } }] : []
      })
      if (jobs.length === 0) throw new Error('No hay logos listos para exportar.')
      const names = numberedNames(
        jobs.map((j) => baseName(j.logo.name)),
        `${suffixOf(s)}.mp4`,
      )
      const total = jobs.reduce((sum, j) => sum + programFrameCount(j.program, format.fps), 0)
      let offset = 0
      const files: { name: string; blob: Blob }[] = []
      for (const [i, job] of jobs.entries()) {
        const detail = `Logo ${i + 1} de ${jobs.length}: ${job.logo.name}`
        report(offset, total, detail)
        const blob = await exportProgramMp4(
          { program: job.program, settings: s.settings, format, signal, onProgress: (done) => report(offset + done, total) },
          codec,
        )
        files.push({ name: names[i], blob })
        offset += programFrameCount(job.program, format.fps)
      }
      report(total, total, 'Creando ZIP…')
      return { blob: await zipFiles(files), fileName: `logos${suffixOf(s)}.zip` }
    })

  const exportSequence = () =>
    run('Secuencia completa', async (signal, report) => {
      const s = useStudio.getState()
      const program = sequenceProgram(s.logos)
      const blob = await exportProgramMp4({
        program,
        settings: s.settings,
        format: formatOf(s),
        signal,
        onProgress: (done, total) => report(done, total),
      })
      return { blob, fileName: `secuencia-${program.items.length}-logos${suffixOf(s)}.mp4` }
    })

  const batchDisabled = !canExport || processing || ready === 0
  const batchTitle = processing ? 'Espera a que terminen de procesarse los logos' : undefined

  return (
    <div className="flex flex-col gap-3 rounded-lg bg-neutral-900 px-4 py-3 ring-1 ring-white/10">
      <div className="flex flex-wrap items-center gap-2">
        <ExportButton primary onClick={exportSelected} disabled={!canExport || !selectedReady}>
          Exportar este logo
        </ExportButton>
        <ExportButton onClick={exportAllZip} disabled={batchDisabled} title={batchTitle}>
          Exportar todos (ZIP)
        </ExportButton>
        <ExportButton onClick={exportSequence} disabled={batchDisabled} title={batchTitle}>
          Exportar secuencia completa
        </ExportButton>
        {running && (
          <button
            type="button"
            onClick={() => abortRef.current?.abort()}
            className="ml-auto rounded-md px-3 py-2 text-sm text-neutral-300 ring-1 ring-white/20 transition hover:bg-white/10"
          >
            Cancelar
          </button>
        )}
      </div>
      <StatusLine status={status} />
      {running && <ProgressBar value={status.done / status.total} />}
      {!running && failed > 0 && (
        <p className="text-xs text-amber-200">
          {failed === 1 ? '1 logo tiene' : `${failed} logos tienen`} errores y no se incluirá en «todos» ni en la
          secuencia.
        </p>
      )}
    </div>
  )
}

function ExportButton(props: {
  onClick: () => void
  disabled: boolean
  primary?: boolean
  title?: string
  children: string
}) {
  return (
    <button
      type="button"
      onClick={props.onClick}
      disabled={props.disabled}
      title={props.title}
      className={`rounded-md px-4 py-2 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-40 ${
        props.primary
          ? 'bg-white text-neutral-900 enabled:hover:bg-neutral-200'
          : 'text-neutral-100 ring-1 ring-white/25 enabled:hover:bg-white/10'
      }`}
    >
      {props.children}
    </button>
  )
}

function StatusLine({ status }: { status: ExportStatus }) {
  const base = 'min-w-0 truncate text-xs'
  switch (status.kind) {
    case 'idle':
      return <span className={`${base} text-neutral-500`}>MP4 H.264 · se descarga al terminar</span>
    case 'running':
      return (
        <span className={`${base} font-mono tabular-nums text-neutral-400`}>
          {status.task}
          {status.detail && ` · ${status.detail}`}
          {status.done > 0
            ? ` · ${status.done}/${status.total} frames · ${status.fps.toFixed(0)} fps · quedan ~${Math.ceil(status.remaining)} s`
            : ' · preparando…'}
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
