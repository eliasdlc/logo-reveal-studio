import { DEFAULT_STAGE_SETTINGS, type StageSettings } from '../engine/types'
import { decodeFile, type LogoSource } from '../processing/decode'
import { normalizeAnimation, normalizeSequence, type AnimationSettings, type SequenceSettings } from './animation'
import {
  DEFAULT_LOGO_OPTIONS,
  UNTITLED_PROJECT,
  useStudio,
  type LogoItem,
  type LogoOptions,
  type PreviewMode,
  type ProjectInfo,
} from './store'

/*
 * The session survives a reload: settings and the list of logos go to localStorage as
 * JSON, the uploaded files themselves (possibly large) to IndexedDB. On start the files
 * are decoded again and reprocessed, exactly as if they had just been dropped in.
 *
 * Projects are named snapshots of a session (settings + files) kept in IndexedDB, which
 * can be opened again later or exported to a file.
 */

const SESSION_KEY = 'logo-reveal-studio:session'
const DB_NAME = 'logo-reveal-studio'
const FILES = 'files'
const PROJECTS = 'projects'
const SAVE_DELAY_MS = 300

type State = ReturnType<typeof useStudio.getState>

/** What is saved, in JSON. */
export interface SavedSession {
  version: 1
  project: ProjectInfo
  logos: { id: string; name: string; demo: boolean; options: LogoOptions }[]
  selectedId: string | null
  animation: AnimationSettings
  sequence: SequenceSettings
  settings: StageSettings
  resolution: State['resolution']
  fps: State['fps']
  padEnds: boolean
  previewMode: PreviewMode
  loop: boolean
}

/**
 * The parts of the state the user edits (a change marks the project as modified). Per
 * logo only what the user sets counts, not the processing results that arrive later.
 */
const edited = (s: State): unknown[] => [
  ...s.logos.flatMap((logo) => [logo.id, logo.name, logo.options, logo.file]),
  s.selectedId,
  s.animation,
  s.sequence,
  s.settings,
  s.resolution,
  s.fps,
  s.padEnds,
  s.previewMode,
  s.loop,
]

export function toSession(s: State): SavedSession {
  return {
    version: 1,
    project: s.project,
    logos: s.logos.map((logo) => ({ id: logo.id, name: logo.name, demo: !!logo.demo, options: logo.options })),
    selectedId: s.selectedId,
    animation: s.animation,
    sequence: s.sequence,
    settings: s.settings,
    resolution: s.resolution,
    fps: s.fps,
    padEnds: s.padEnds,
    previewMode: s.previewMode,
    loop: s.loop,
  }
}

type Loose = Record<string, unknown>
const isObject = (v: unknown): v is Loose => typeof v === 'object' && v !== null
const pick = <T>(value: unknown, allowed: readonly T[], fallback: T): T =>
  allowed.includes(value as T) ? (value as T) : fallback

function parseOptions(raw: unknown): LogoOptions {
  const o = isObject(raw) ? raw : {}
  const num = (v: unknown, fallback: number) => (typeof v === 'number' && Number.isFinite(v) ? v : fallback)
  return {
    removeWhite: typeof o.removeWhite === 'boolean' ? o.removeWhite : DEFAULT_LOGO_OPTIONS.removeWhite,
    whiteThreshold: num(o.whiteThreshold, DEFAULT_LOGO_OPTIONS.whiteThreshold),
    removeEnclosedWhite:
      typeof o.removeEnclosedWhite === 'boolean' ? o.removeEnclosedWhite : DEFAULT_LOGO_OPTIONS.removeEnclosedWhite,
    scale: num(o.scale, DEFAULT_LOGO_OPTIONS.scale),
    animation: isObject(o.animation) ? normalizeAnimation(o.animation) : null,
  }
}

/**
 * A saved session read back, tolerating anything an older (or newer) version may have
 * written: unknown values fall back to the defaults. Null if there's nothing usable.
 */
export function parseSession(json: string | null): SavedSession | null {
  if (!json) return null
  let raw: unknown
  try {
    raw = JSON.parse(json)
  } catch {
    return null
  }
  if (!isObject(raw) || raw.version !== 1 || !Array.isArray(raw.logos)) return null
  const settings = isObject(raw.settings) ? raw.settings : {}
  const logos = raw.logos.flatMap((entry) =>
    isObject(entry) && typeof entry.id === 'string' && typeof entry.name === 'string'
      ? [{ id: entry.id, name: entry.name, demo: entry.demo === true, options: parseOptions(entry.options) }]
      : [],
  )
  const project = isObject(raw.project) ? raw.project : null
  return {
    version: 1,
    project: project
      ? {
          id: typeof project.id === 'string' ? project.id : null,
          name: typeof project.name === 'string' && project.name.trim() ? project.name : UNTITLED_PROJECT.name,
          savedAt: typeof project.savedAt === 'number' ? project.savedAt : null,
          dirty: project.dirty === true,
        }
      : // Work from before projects existed: nothing has saved it yet.
        { ...UNTITLED_PROJECT, dirty: logos.some((logo) => !logo.demo) },
    logos,
    selectedId: typeof raw.selectedId === 'string' ? raw.selectedId : null,
    animation: normalizeAnimation(raw.animation),
    sequence: normalizeSequence(raw.sequence),
    settings: {
      background:
        typeof settings.background === 'string' && /^#[0-9a-f]{6}$/i.test(settings.background)
          ? settings.background
          : DEFAULT_STAGE_SETTINGS.background,
      shadow: typeof settings.shadow === 'boolean' ? settings.shadow : DEFAULT_STAGE_SETTINGS.shadow,
    },
    resolution: pick(raw.resolution, [1080, 2160] as const, 1080),
    fps: pick(raw.fps, [30, 60] as const, 60),
    padEnds: raw.padEnds === true,
    previewMode: pick(raw.previewMode, ['logo', 'sequence'] as const, 'logo'),
    loop: raw.loop !== false,
  }
}

// ─── IndexedDB: uploaded files and the project library ──────────────────────

let database: Promise<IDBDatabase> | null = null

function db(): Promise<IDBDatabase> {
  database ??= new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 2)
    request.onupgradeneeded = () => {
      const names = request.result.objectStoreNames
      if (!names.contains(FILES)) request.result.createObjectStore(FILES)
      if (!names.contains(PROJECTS)) request.result.createObjectStore(PROJECTS, { keyPath: 'id' })
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
  return database
}

async function inStore<T>(
  name: string,
  mode: IDBTransactionMode,
  run: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  const store = (await db()).transaction(name, mode).objectStore(name)
  return new Promise((resolve, reject) => {
    const request = run(store)
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

const getFile = (id: string) => inStore<Blob | undefined>(FILES, 'readonly', (s) => s.get(id) as IDBRequest<Blob | undefined>)
const putFile = (id: string, blob: Blob) => inStore(FILES, 'readwrite', (s) => s.put(blob, id))
const deleteFile = (id: string) => inStore(FILES, 'readwrite', (s) => s.delete(id))
const fileIds = () => inStore<IDBValidKey[]>(FILES, 'readonly', (s) => s.getAllKeys())

// ─── Loading a session ──────────────────────────────────────────────────────

/** Ids whose file is already in the session's file store. */
const storedFiles = new Set<string>()

let demoSource: () => Promise<LogoSource> = () => Promise.reject(new Error('No sample logo'))

/** While a session is being put in place, its changes don't count as edits. */
let loading = false

/**
 * Puts a saved session into the store, decoding each logo's file from `fileFor`.
 * Returns how many logos came back.
 */
async function applySession(
  saved: SavedSession,
  fileFor: (id: string) => Promise<Blob | undefined>,
  project: ProjectInfo = saved.project,
): Promise<number> {
  const logos = await Promise.all(
    saved.logos.map(async (entry): Promise<LogoItem | null> => {
      try {
        const base = { id: entry.id, name: entry.name, options: entry.options, processed: null, error: null }
        if (entry.demo) return { ...base, source: await demoSource(), file: null, demo: true }
        const blob = await fileFor(entry.id)
        if (!blob) return null
        const source = await decodeFile(new File([blob], entry.name, { type: blob.type }))
        return { ...base, source, file: blob }
      } catch {
        return null
      }
    }),
  )
  const restored = logos.filter((logo): logo is LogoItem => logo !== null)
  const { selectedId } = saved
  loading = true
  try {
    useStudio.setState({
      project,
      logos: restored,
      selectedId: restored.some((logo) => logo.id === selectedId) ? selectedId : (restored[0]?.id ?? null),
      animation: saved.animation,
      sequence: saved.sequence,
      settings: saved.settings,
      resolution: saved.resolution,
      fps: saved.fps,
      padEnds: saved.padEnds,
      previewMode: saved.previewMode,
      loop: saved.loop,
      time: 0,
      playing: true,
    })
  } finally {
    loading = false
  }
  return restored.length
}

/**
 * Puts the saved session back into the store. Returns false when there is none (or
 * nothing in it could be restored), so the caller can show the sample logo instead.
 */
export async function restoreSession(): Promise<boolean> {
  let saved: SavedSession | null = null
  try {
    saved = parseSession(localStorage.getItem(SESSION_KEY))
  } catch {
    return false
  }
  if (!saved) return false

  const fileFor = async (id: string) => {
    const blob = await getFile(id)
    if (blob) storedFiles.add(id)
    return blob
  }
  const count = await applySession(saved, fileFor)
  if (saved.logos.length > 0 && count === 0) return false

  // Files left behind by logos that no longer exist.
  try {
    const keep = new Set(useStudio.getState().logos.map((logo) => logo.id))
    for (const id of await fileIds()) if (typeof id === 'string' && !keep.has(id)) await deleteFile(id)
  } catch {
    // Storage unavailable: nothing to clean.
  }
  return true
}

/** Stores new uploads and forgets removed ones. */
async function syncFiles(logos: LogoItem[]): Promise<void> {
  const alive = new Set(logos.map((logo) => logo.id))
  for (const logo of logos) {
    if (!logo.file || storedFiles.has(logo.id)) continue
    storedFiles.add(logo.id)
    await putFile(logo.id, logo.file)
  }
  for (const id of [...storedFiles]) {
    if (alive.has(id)) continue
    storedFiles.delete(id)
    await deleteFile(id)
  }
}

let session: Promise<void> | null = null
let freshStart: () => Promise<void> = async () => {}

/**
 * Restores the saved session (or, if there is none, runs `fresh`, e.g. to add the sample
 * logo) and from then on saves every change. Safe to call more than once.
 */
export function startSession(demo: () => Promise<LogoSource>, fresh: () => Promise<void>): Promise<void> {
  demoSource = demo
  freshStart = fresh
  session ??= (async () => {
    if (!(await restoreSession())) await fresh()
    persistChanges()
  })()
  return session
}

/** Saves the session whenever something changes, and marks edits on the project. */
function persistChanges(): void {
  let last = edited(useStudio.getState())
  let lastProject = useStudio.getState().project
  let timer: ReturnType<typeof setTimeout> | undefined
  const save = () => {
    const state = useStudio.getState()
    try {
      localStorage.setItem(SESSION_KEY, JSON.stringify(toSession(state)))
    } catch {
      // Private mode or storage full: the app keeps working, it just won't be remembered.
    }
    syncFiles(state.logos).catch(() => {})
  }
  save()
  useStudio.subscribe((state) => {
    const next = edited(state)
    const changed = next.length !== last.length || next.some((value, i) => value !== last[i])
    if (!changed && state.project === lastProject) return
    last = next
    if (changed && !loading && !state.project.dirty) {
      // Sets state again: this listener runs once more and saves then.
      useStudio.setState({ project: { ...state.project, dirty: true } })
      return
    }
    lastProject = state.project
    clearTimeout(timer)
    timer = setTimeout(() => {
      timer = undefined
      save()
    }, SAVE_DELAY_MS)
  })
  // Don't lose the last change when the page is closed right after it.
  window.addEventListener('pagehide', () => {
    if (timer === undefined) return
    clearTimeout(timer)
    timer = undefined
    save()
  })
}

// ─── Project library ────────────────────────────────────────────────────────

interface ProjectRecord {
  id: string
  name: string
  savedAt: number
  session: SavedSession
  /** Uploaded files by logo id. */
  files: Record<string, Blob>
}

export interface ProjectSummary {
  id: string
  name: string
  savedAt: number
  logoCount: number
}

const newProjectId = () => globalThis.crypto?.randomUUID?.() ?? `project-${Date.now().toString(36)}`

export async function listProjects(): Promise<ProjectSummary[]> {
  const records = await inStore<ProjectRecord[]>(PROJECTS, 'readonly', (s) => s.getAll())
  return records
    .map((r) => ({ id: r.id, name: r.name, savedAt: r.savedAt, logoCount: r.session.logos.filter((l) => !l.demo).length }))
    .sort((a, b) => b.savedAt - a.savedAt)
}

/** A snapshot of the current work, as a project record. */
function snapshot(id: string, name: string, savedAt: number): ProjectRecord {
  const state = useStudio.getState()
  const project: ProjectInfo = { id, name, savedAt, dirty: false }
  const files: Record<string, Blob> = {}
  for (const logo of state.logos) if (logo.file) files[logo.id] = logo.file
  return { id, name, savedAt, session: { ...toSession(state), project }, files }
}

/**
 * Saves the current work into the library: over the project it came from, or as a new
 * project when `asNew` (or when it was never saved).
 */
export async function saveProject(name?: string, asNew = false): Promise<void> {
  const current = useStudio.getState().project
  const id = !asNew && current.id ? current.id : newProjectId()
  const record = snapshot(id, (name ?? current.name).trim() || UNTITLED_PROJECT.name, Date.now())
  await inStore(PROJECTS, 'readwrite', (s) => s.put(record))
  loading = true
  try {
    useStudio.setState({ project: record.session.project })
  } finally {
    loading = false
  }
}

/** Replaces the current work with a project from the library. */
export async function openProject(id: string): Promise<void> {
  const record = await inStore<ProjectRecord | undefined>(PROJECTS, 'readonly', (s) => s.get(id))
  if (!record) throw new Error('El proyecto ya no existe.')
  const saved = parseSession(JSON.stringify(record.session))
  if (!saved) throw new Error('El proyecto está dañado.')
  await applySession(saved, async (logoId) => record.files[logoId], { ...saved.project, id, dirty: false })
}

export async function deleteProject(id: string): Promise<void> {
  await inStore(PROJECTS, 'readwrite', (s) => s.delete(id))
  const project = useStudio.getState().project
  // The work stays open; it's just no longer linked to a saved project.
  if (project.id === id) useStudio.setState({ project: { ...project, id: null, savedAt: null, dirty: true } })
}

/** Starts over with the sample logo and default settings. */
export async function newProject(): Promise<void> {
  const { getInitialState } = useStudio
  loading = true
  try {
    const initial = getInitialState()
    useStudio.setState({ ...initial, logos: [], selectedId: null, project: UNTITLED_PROJECT })
  } finally {
    loading = false
  }
  await freshStart()
  loading = true
  try {
    useStudio.setState({ project: UNTITLED_PROJECT })
  } finally {
    loading = false
  }
}

// ─── Project files ──────────────────────────────────────────────────────────

const FILE_FORMAT = 'logo-reveal-studio-project'
export const PROJECT_EXTENSION = '.logoreveal'

const TYPES: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
  svg: 'image/svg+xml',
}

export const typeFromName = (name: string): string => TYPES[name.split('.').pop()?.toLowerCase() ?? ''] ?? ''

/** The current work as a single file (a zip with the settings and the logo files). */
export async function exportProjectFile(): Promise<{ blob: Blob; fileName: string }> {
  const { default: JSZip } = await import('jszip')
  const state = useStudio.getState()
  const zip = new JSZip()
  zip.file('project.json', JSON.stringify({ format: FILE_FORMAT, name: state.project.name, session: toSession(state) }, null, 2))
  for (const logo of state.logos) if (logo.file) zip.file(`files/${logo.id}`, logo.file, { binary: true })
  const blob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE', mimeType: 'application/zip' })
  const safeName = state.project.name.replace(/[\\/:*?"<>|]+/g, '-').trim() || 'proyecto'
  return { blob, fileName: `${safeName}${PROJECT_EXTENSION}` }
}

/** Adds a project file to the library and opens it. */
export async function importProjectFile(file: File): Promise<void> {
  const { default: JSZip } = await import('jszip')
  let zip: InstanceType<typeof JSZip>
  try {
    zip = await JSZip.loadAsync(file)
  } catch {
    throw new Error('Este archivo no es un proyecto de Logo Reveal Studio.')
  }
  const manifest = zip.file('project.json')
  const raw: unknown = manifest ? JSON.parse(await manifest.async('string')) : null
  if (!isObject(raw) || raw.format !== FILE_FORMAT) throw new Error('Este archivo no es un proyecto de Logo Reveal Studio.')
  const saved = parseSession(JSON.stringify(raw.session))
  if (!saved) throw new Error('El proyecto está dañado.')
  const files: Record<string, Blob> = {}
  for (const logo of saved.logos) {
    const entry = zip.file(`files/${logo.id}`)
    // Zip entries carry no type: recover it from the file name, as the decoder needs it.
    if (entry) files[logo.id] = new Blob([await entry.async('arraybuffer')], { type: typeFromName(logo.name) })
  }
  const id = newProjectId()
  const name = typeof raw.name === 'string' && raw.name.trim() ? raw.name : file.name.replace(/\.[^.]+$/, '')
  const project: ProjectInfo = { id, name, savedAt: Date.now(), dirty: false }
  const record: ProjectRecord = { id, name, savedAt: project.savedAt!, session: { ...saved, project }, files }
  await inStore(PROJECTS, 'readwrite', (s) => s.put(record))
  await applySession(saved, async (logoId) => files[logoId], project)
}
