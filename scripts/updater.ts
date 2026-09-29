/*
 * Dev-server endpoints behind the app's «Actualizar» button (only with `npm run dev`):
 *
 *   GET  /__update/status  fetches the remote and says how many commits the local branch is behind
 *   POST /__update/apply   fast-forwards to them and installs dependencies if they changed
 *
 * Only fixed git/npm commands run, never anything taken from the request; the update is a
 * fast-forward, so it never rewrites local work (if it can't fast-forward, it says why).
 * Vite then reloads the page, or restarts itself if its own config changed.
 */
import { spawn } from 'node:child_process'
import type { IncomingMessage, ServerResponse } from 'node:http'
import type { Plugin } from 'vite'

export interface UpdateStatus {
  state: 'up-to-date' | 'behind' | 'diverged' | 'unavailable'
  branch?: string
  behind?: number
  /** Newest first: short hash and subject of each incoming commit (at most 10). */
  commits?: { hash: string; subject: string }[]
  reason?: string
}

export interface UpdateResult {
  ok: boolean
  installed?: boolean
  message?: string
}

/** Don't hit the remote more often than this; status requests in between reuse the last fetch. */
const FETCH_INTERVAL_MS = 60_000
const isWindows = process.platform === 'win32'

function run(cwd: string, command: string, args: string[], timeoutMs = 60_000): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      // npm is a .cmd script on Windows, which only runs through the shell.
      shell: isWindows && command === 'npm',
      env: { ...process.env, GIT_TERMINAL_PROMPT: '0' },
    })
    let out = ''
    let err = ''
    child.stdout.on('data', (d: Buffer) => (out += d))
    child.stderr.on('data', (d: Buffer) => (err += d))
    const timer = setTimeout(() => child.kill(), timeoutMs)
    child.on('error', (e) => {
      clearTimeout(timer)
      reject(e)
    })
    child.on('close', (code) => {
      clearTimeout(timer)
      if (code === 0) resolve(out.trim())
      else reject(new Error((err || out).trim() || `${command} terminó con código ${code}`))
    })
  })
}

export function updater(): Plugin {
  let root = process.cwd()
  let lastFetch = 0
  let busy = false
  const git = (...args: string[]) => run(root, 'git', args)

  /** The branch and the remote branch it follows (origin/<branch> when none is set). */
  async function tracking(): Promise<{ branch: string; upstream: string }> {
    const branch = await git('rev-parse', '--abbrev-ref', 'HEAD')
    if (branch === 'HEAD') throw new Error('El repositorio no está en ninguna rama.')
    const upstream = await git('rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{u}').catch(
      () => `origin/${branch}`,
    )
    return { branch, upstream }
  }

  async function fetchRemote(upstream: string, force = false) {
    if (!force && Date.now() - lastFetch < FETCH_INTERVAL_MS) return
    const slash = upstream.indexOf('/')
    await run(root, 'git', ['fetch', '--quiet', upstream.slice(0, slash), upstream.slice(slash + 1)], 60_000)
    lastFetch = Date.now()
  }

  async function status(): Promise<UpdateStatus> {
    try {
      const { branch, upstream } = await tracking()
      await fetchRemote(upstream)
      const [behind, ahead] = (await git('rev-list', '--left-right', '--count', `${upstream}...HEAD`))
        .split(/\s+/)
        .map(Number)
      if (behind === 0) return { state: 'up-to-date', branch, behind: 0 }
      const log = await git('log', '--format=%h%x09%s', '-n', '10', `HEAD..${upstream}`)
      const commits = log
        .split('\n')
        .filter(Boolean)
        .map((line) => {
          const [hash, ...subject] = line.split('\t')
          return { hash, subject: subject.join('\t') }
        })
      if (ahead > 0) {
        return {
          state: 'diverged',
          branch,
          behind,
          commits,
          reason: `Hay ${ahead} commit(s) locales que no están en ${upstream}; actualiza a mano con git.`,
        }
      }
      return { state: 'behind', branch, behind, commits }
    } catch (e) {
      return { state: 'unavailable', reason: e instanceof Error ? e.message : String(e) }
    }
  }

  async function apply(): Promise<UpdateResult> {
    const { upstream } = await tracking()
    await fetchRemote(upstream, true)
    const before = await git('rev-parse', 'HEAD')
    try {
      await git('merge', '--ff-only', upstream)
    } catch (e) {
      const detail = e instanceof Error ? e.message : String(e)
      const localChanges = /overwritten|local changes|untracked working tree/i.test(detail)
      return {
        ok: false,
        message: localChanges
          ? 'Hay cambios locales en archivos que la actualización modifica. Guárdalos o descártalos con git y vuelve a intentarlo.'
          : `No se pudo actualizar: ${detail}`,
      }
    }
    const changed = await git('diff', '--name-only', before, 'HEAD')
    const dependencies = changed.split('\n').some((file) => file === 'package.json' || file === 'package-lock.json')
    if (dependencies) await run(root, 'npm', ['install', '--no-audit', '--no-fund'], 10 * 60_000)
    return { ok: true, installed: dependencies }
  }

  const send = (res: ServerResponse, code: number, body: unknown) => {
    res.statusCode = code
    res.setHeader('Content-Type', 'application/json')
    res.setHeader('Cache-Control', 'no-store')
    res.end(JSON.stringify(body))
  }

  /** Only the app itself may trigger an update: same-origin fetch with our header. */
  const fromApp = (req: IncomingMessage) =>
    req.headers['x-logo-reveal-update'] === '1' && (req.headers['sec-fetch-site'] ?? 'same-origin') === 'same-origin'

  return {
    name: 'logo-reveal-updater',
    apply: 'serve',
    configResolved(config) {
      root = config.root
    },
    configureServer(server) {
      server.middlewares.use('/__update/status', (req, res) => {
        if (req.method !== 'GET') return send(res, 405, { error: 'GET' })
        void status().then((body) => send(res, 200, body))
      })
      server.middlewares.use('/__update/apply', (req, res) => {
        if (req.method !== 'POST' || !fromApp(req)) return send(res, 403, { ok: false, message: 'No permitido.' })
        if (busy) return send(res, 409, { ok: false, message: 'Ya se está actualizando.' })
        busy = true
        apply()
          .then((result) => send(res, result.ok ? 200 : 409, result))
          .catch((e: unknown) => send(res, 500, { ok: false, message: e instanceof Error ? e.message : String(e) }))
          .finally(() => {
            busy = false
          })
      })
    },
  }
}
