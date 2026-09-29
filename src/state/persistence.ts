import { DEFAULT_STAGE_SETTINGS, type StageSettings } from '../engine/types'
import { decodeFile, type LogoSource } from '../processing/decode'
import { normalizeAnimation, normalizeSequence, type AnimationSettings, type SequenceSettings } from './animation'
import { DEFAULT_LOGO_OPTIONS, useStudio, type LogoItem, type LogoOptions, type PreviewMode } from './store'

/*
 * The session survives a reload: settings and the list of logos go to localStorage as
 * JSON, the uploaded files themselves (possibly large) to IndexedDB. On start the files
 * are decoded again and reprocessed, exactly as if they had just been dropped in.
 */

const SESSION_KEY = 'logo-reveal-studio:session'
const DB_NAME = 'logo-reveal-studio'
const FILES = 'files'
const SAVE_DELAY_MS = 300

type State = ReturnType<typeof useStudio.getState>

/** What is saved, in JSON. */
export interface SavedSession {
  version: 1
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

/** The parts of the state that are saved (a change to any of them triggers a save). */
const persisted = (s: State) =>
  [s.logos, s.selectedId, s.animation, s.sequence, s.settings, s.resolution, s.fps, s.padEnds, s.previewMode, s.loop] as const

export function toSession(s: State): SavedSession {
  return {
    version: 1,
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
  return {
    version: 1,
    logos: raw.logos.flatMap((entry) =>
      isObject(entry) && typeof entry.id === 'string' && typeof entry.name === 'string'
        ? [{ id: entry.id, name: entry.name, demo: entry.demo === true, options: parseOptions(entry.options) }]
        : [],
    ),
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

// ─── Uploaded files (IndexedDB) ─────────────────────────────────────────────

let database: Promise<IDBDatabase> | null = null

function db(): Promise<IDBDatabase> {
  database ??= new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1)
    request.onupgradeneeded = () => request.result.createObjectStore(FILES)
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
  return database
}

async function files<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const store = (await db()).transaction(FILES, mode).objectStore(FILES)
  return new Promise((resolve, reject) => {
    const request = run(store)
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

const getFile = (id: string) => files<Blob | undefined>('readonly', (s) => s.get(id) as IDBRequest<Blob | undefined>)
const putFile = (id: string, blob: Blob) => files('readwrite', (s) => s.put(blob, id))
const deleteFile = (id: string) => files('readwrite', (s) => s.delete(id))
const fileIds = () => files<IDBValidKey[]>('readonly', (s) => s.getAllKeys())

// ─── Restore and save ───────────────────────────────────────────────────────

/** Ids whose file is already in IndexedDB. */
const storedFiles = new Set<string>()

/**
 * Puts the saved session back into the store. Returns false when there is none (or
 * nothing in it could be restored), so the caller can show the sample logo instead.
 */
export async function restoreSession(demoSource: () => Promise<LogoSource>): Promise<boolean> {
  let saved: SavedSession | null = null
  try {
    saved = parseSession(localStorage.getItem(SESSION_KEY))
  } catch {
    return false
  }
  if (!saved) return false

  const logos = await Promise.all(
    saved.logos.map(async (entry): Promise<LogoItem | null> => {
      try {
        const base = { id: entry.id, name: entry.name, options: entry.options, processed: null, error: null }
        if (entry.demo) return { ...base, source: await demoSource(), file: null, demo: true }
        const blob = await getFile(entry.id)
        if (!blob) return null
        const source = await decodeFile(new File([blob], entry.name, { type: blob.type }))
        storedFiles.add(entry.id)
        return { ...base, source, file: blob }
      } catch {
        return null
      }
    }),
  )
  const restored = logos.filter((logo): logo is LogoItem => logo !== null)
  if (saved.logos.length > 0 && restored.length === 0) return false

  const { selectedId } = saved
  useStudio.setState({
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
  })

  // Files left behind by logos that no longer exist.
  try {
    const keep = new Set(restored.map((logo) => logo.id))
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

/**
 * Restores the saved session (or, if there is none, runs `fresh`, e.g. to add the sample
 * logo) and from then on saves every change. Safe to call more than once.
 */
export function startSession(demoSource: () => Promise<LogoSource>, fresh: () => Promise<void>): Promise<void> {
  session ??= (async () => {
    if (!(await restoreSession(demoSource))) await fresh()
    persistChanges()
  })()
  return session
}

/** Saves the session whenever something worth keeping changes. Returns the unsubscribe. */
export function persistChanges(): () => void {
  let last = persisted(useStudio.getState())
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
  const unsubscribe = useStudio.subscribe((state) => {
    const next = persisted(state)
    if (next.every((value, i) => value === last[i])) return
    last = next
    clearTimeout(timer)
    timer = setTimeout(() => {
      timer = undefined
      save()
    }, SAVE_DELAY_MS)
  })
  // Don't lose the last change when the page is closed right after it.
  const flush = () => {
    if (timer === undefined) return
    clearTimeout(timer)
    timer = undefined
    save()
  }
  window.addEventListener('pagehide', flush)
  return () => {
    flush()
    unsubscribe()
    window.removeEventListener('pagehide', flush)
  }
}
