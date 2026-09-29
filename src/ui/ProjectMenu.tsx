import { useEffect, useEffectEvent, useRef, useState, type ReactNode } from 'react'
import { downloadBlob } from '../export/download'
import {
  PROJECT_EXTENSION,
  deleteProject,
  exportProjectFile,
  importProjectFile,
  listProjects,
  newProject,
  openProject,
  saveProject,
  type ProjectSummary,
} from '../state/persistence'
import { useStudio } from '../state/store'

type Dialog = { kind: 'none' } | { kind: 'save-as' } | { kind: 'library' }

const formatDate = (ms: number) =>
  new Date(ms).toLocaleString('es', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })

/** Unsaved work is lost when another project replaces it, so ask first. */
function confirmDiscard(): boolean {
  const { project } = useStudio.getState()
  if (!project.dirty) return true
  return window.confirm(
    `«${project.name}» tiene cambios sin guardar y se perderán. ¿Continuar de todos modos?\n\n` +
      'Para conservarlos, cancela y usa «Guardar».',
  )
}

/** Name, save state and project actions, in the header. */
export function ProjectMenu() {
  const project = useStudio((s) => s.project)
  const [dialog, setDialog] = useState<Dialog>({ kind: 'none' })
  const [message, setMessage] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null)
  const [busy, setBusy] = useState(false)

  const run = async (work: () => Promise<void>, done?: string) => {
    setBusy(true)
    setMessage(null)
    try {
      await work()
      if (done) setMessage({ tone: 'ok', text: done })
    } catch (e) {
      setMessage({ tone: 'error', text: e instanceof Error ? e.message : 'No se pudo completar.' })
    } finally {
      setBusy(false)
    }
  }

  const save = () => {
    if (!useStudio.getState().project.id) setDialog({ kind: 'save-as' })
    else void run(() => saveProject(), 'Proyecto guardado')
  }

  // Ctrl/Cmd + S saves, as in any editor.
  const onSaveKey = useEffectEvent(save)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault()
        onSaveKey()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  // Messages fade away on their own.
  useEffect(() => {
    if (!message) return
    const timer = setTimeout(() => setMessage(null), 3500)
    return () => clearTimeout(timer)
  }, [message])

  return (
    <div className="flex items-center gap-3">
      {message && (
        <span className={`text-xs ${message.tone === 'ok' ? 'text-emerald-300' : 'text-red-300'}`}>{message.text}</span>
      )}
      <div className="flex min-w-0 flex-col items-end leading-tight">
        <span className="max-w-64 truncate text-sm text-neutral-200" title={project.name}>
          {project.name}
        </span>
        <span className={`text-[11px] ${project.dirty ? 'text-amber-300' : 'text-neutral-500'}`}>
          {project.dirty
            ? '● Cambios sin guardar'
            : project.savedAt
              ? `Guardado ${formatDate(project.savedAt)}`
              : 'Sin cambios'}
        </span>
      </div>
      <HeaderButton primary onClick={save} disabled={busy} title="Guardar el proyecto (Ctrl+S)">
        Guardar
      </HeaderButton>
      <HeaderButton onClick={() => setDialog({ kind: 'save-as' })} disabled={busy}>
        Guardar como…
      </HeaderButton>
      <HeaderButton onClick={() => setDialog({ kind: 'library' })} disabled={busy}>
        Proyectos
      </HeaderButton>

      {dialog.kind === 'save-as' && (
        <SaveAsDialog
          initialName={project.id ? `${project.name} (copia)` : project.name === 'Sin título' ? '' : project.name}
          onCancel={() => setDialog({ kind: 'none' })}
          onSave={(name) => {
            setDialog({ kind: 'none' })
            void run(() => saveProject(name, true), `Guardado como «${name}»`)
          }}
        />
      )}
      {dialog.kind === 'library' && (
        <LibraryDialog
          onClose={() => setDialog({ kind: 'none' })}
          run={(work, done) => {
            setDialog({ kind: 'none' })
            void run(work, done)
          }}
        />
      )}
    </div>
  )
}

function HeaderButton(props: {
  onClick: () => void
  disabled?: boolean
  primary?: boolean
  title?: string
  children: ReactNode
}) {
  return (
    <button
      type="button"
      onClick={props.onClick}
      disabled={props.disabled}
      title={props.title}
      className={`rounded-md px-3 py-1.5 text-xs font-medium transition disabled:opacity-40 ${
        props.primary
          ? 'bg-white text-neutral-900 enabled:hover:bg-neutral-200'
          : 'text-neutral-200 ring-1 ring-white/20 enabled:hover:bg-white/10'
      }`}
    >
      {props.children}
    </button>
  )
}

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/60 pt-24" onMouseDown={onClose}>
      <div
        role="dialog"
        aria-label={title}
        className="flex w-[28rem] max-w-[calc(100vw-2rem)] flex-col gap-4 rounded-xl bg-neutral-900 p-5 shadow-2xl ring-1 ring-white/15"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <h2 className="text-sm font-semibold text-neutral-100">{title}</h2>
        {children}
      </div>
    </div>
  )
}

function SaveAsDialog(props: { initialName: string; onCancel: () => void; onSave: (name: string) => void }) {
  const [name, setName] = useState(props.initialName)
  const valid = name.trim().length > 0
  return (
    <Modal title="Guardar proyecto como" onClose={props.onCancel}>
      <form
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault()
          if (valid) props.onSave(name.trim())
        }}
      >
        <label className="flex flex-col gap-1.5 text-sm text-neutral-300">
          Nombre
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Ej.: BarCamp 2026 — patrocinadores"
            className="rounded-md bg-black/40 px-3 py-2 text-sm text-neutral-100 ring-1 ring-white/15 outline-none focus:ring-white/40"
          />
        </label>
        <p className="text-xs leading-relaxed text-neutral-500">
          Se guardan los logos, sus ajustes, las animaciones, la secuencia, la escena y el export. Queda en este
          navegador; para llevarlo a otro equipo usa «Exportar archivo» en Proyectos.
        </p>
        <div className="flex justify-end gap-2">
          <HeaderButton onClick={props.onCancel}>Cancelar</HeaderButton>
          <button
            type="submit"
            disabled={!valid}
            className="rounded-md bg-white px-3 py-1.5 text-xs font-medium text-neutral-900 transition enabled:hover:bg-neutral-200 disabled:opacity-40"
          >
            Guardar
          </button>
        </div>
      </form>
    </Modal>
  )
}

function LibraryDialog(props: {
  onClose: () => void
  run: (work: () => Promise<void>, done?: string) => void
}) {
  const current = useStudio((s) => s.project)
  const [projects, setProjects] = useState<ProjectSummary[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const fileInput = useRef<HTMLInputElement>(null)

  const refresh = () =>
    listProjects()
      .then(setProjects)
      .catch(() => setError('No se pudo leer la lista de proyectos de este navegador.'))
  useEffect(() => {
    void refresh()
  }, [])

  return (
    <Modal title="Proyectos" onClose={props.onClose}>
      <div className="flex flex-wrap gap-2">
        <HeaderButton
          onClick={() => confirmDiscard() && props.run(() => newProject(), 'Proyecto nuevo')}
        >
          Nuevo proyecto
        </HeaderButton>
        <HeaderButton onClick={() => fileInput.current?.click()}>Importar archivo…</HeaderButton>
        <HeaderButton
          onClick={() =>
            props.run(async () => {
              const { blob, fileName } = await exportProjectFile()
              downloadBlob(blob, fileName)
            }, 'Archivo del proyecto descargado')
          }
        >
          Exportar archivo
        </HeaderButton>
        <input
          ref={fileInput}
          type="file"
          accept={`${PROJECT_EXTENSION},.zip`}
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0]
            e.target.value = ''
            if (file && confirmDiscard()) props.run(() => importProjectFile(file), `«${file.name}» importado`)
          }}
        />
      </div>

      {error && <p className="text-xs text-red-300">{error}</p>}
      {projects === null && !error && <p className="text-xs text-neutral-500">Cargando…</p>}
      {projects?.length === 0 && (
        <p className="text-xs leading-relaxed text-neutral-500">
          Todavía no hay proyectos guardados. Usa «Guardar como…» para guardar el trabajo actual.
        </p>
      )}
      {projects && projects.length > 0 && (
        <ul className="flex max-h-80 flex-col gap-1.5 overflow-y-auto">
          {projects.map((p) => (
            <li
              key={p.id}
              className={`flex items-center gap-3 rounded-md px-3 py-2 ring-1 ${
                p.id === current.id ? 'bg-white/10 ring-white/30' : 'bg-white/[0.03] ring-white/10'
              }`}
            >
              <div className="flex min-w-0 flex-1 flex-col">
                <span className="truncate text-sm text-neutral-100" title={p.name}>
                  {p.name}
                  {p.id === current.id && <span className="ml-2 text-[11px] text-neutral-400">abierto</span>}
                </span>
                <span className="text-[11px] text-neutral-500">
                  {p.logoCount} {p.logoCount === 1 ? 'logo' : 'logos'} · {formatDate(p.savedAt)}
                </span>
              </div>
              <HeaderButton
                onClick={() => confirmDiscard() && props.run(() => openProject(p.id), `«${p.name}» abierto`)}
              >
                Abrir
              </HeaderButton>
              <button
                type="button"
                onClick={() => {
                  if (!window.confirm(`¿Eliminar el proyecto «${p.name}»? No se puede deshacer.`)) return
                  void deleteProject(p.id).then(refresh)
                }}
                className="rounded px-1.5 py-1 text-neutral-500 transition hover:bg-red-500/20 hover:text-red-300"
                aria-label={`Eliminar ${p.name}`}
                title="Eliminar"
              >
                ✕
              </button>
            </li>
          ))}
        </ul>
      )}
      <p className="text-xs leading-relaxed text-neutral-500">
        Los proyectos se guardan en este navegador. «Exportar archivo» descarga uno ({PROJECT_EXTENSION}) con los
        logos incluidos, para hacer copia de seguridad o abrirlo en otro equipo.
      </p>
    </Modal>
  )
}
