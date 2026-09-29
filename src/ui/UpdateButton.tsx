import { useCallback, useEffect, useState } from 'react'

/*
 * «Actualizar» in the header: appears when the repository has new commits on GitHub and,
 * on click, brings them in and reloads. Talks to the dev server (scripts/updater.ts), so
 * it only exists with `npm run dev`. The work in progress survives the reload (it's saved
 * in the browser).
 */

interface Status {
  state: 'up-to-date' | 'behind' | 'diverged' | 'unavailable'
  behind?: number
  commits?: { hash: string; subject: string }[]
  reason?: string
}

type Phase =
  | { kind: 'idle' }
  | { kind: 'updating' }
  | { kind: 'reloading'; installed: boolean }
  | { kind: 'error'; message: string }

const CHECK_EVERY_MS = 10 * 60_000
const CHECK_ON_FOCUS_AFTER_MS = 2 * 60_000

async function fetchStatus(): Promise<Status> {
  const response = await fetch('/__update/status', { cache: 'no-store' })
  if (!response.ok) throw new Error(String(response.status))
  return response.json()
}

/** After an update the dev server may restart: wait until it answers again, then reload. */
async function reloadWhenServerIsBack(): Promise<void> {
  for (let attempt = 0; attempt < 120; attempt++) {
    await new Promise((resolve) => setTimeout(resolve, attempt === 0 ? 800 : 1000))
    try {
      await fetchStatus()
      break
    } catch {
      // Still restarting.
    }
  }
  location.reload()
}

export function UpdateButton() {
  if (!import.meta.env.DEV) return null
  return <Updater />
}

function Updater() {
  const [status, setStatus] = useState<Status | null>(null)
  const [phase, setPhase] = useState<Phase>({ kind: 'idle' })

  const check = useCallback(() => {
    fetchStatus()
      .then(setStatus)
      .catch(() => setStatus(null))
  }, [])

  useEffect(() => {
    check()
    let lastCheck = Date.now()
    const timer = setInterval(() => {
      lastCheck = Date.now()
      check()
    }, CHECK_EVERY_MS)
    const onFocus = () => {
      if (Date.now() - lastCheck < CHECK_ON_FOCUS_AFTER_MS) return
      lastCheck = Date.now()
      check()
    }
    window.addEventListener('focus', onFocus)
    return () => {
      clearInterval(timer)
      window.removeEventListener('focus', onFocus)
    }
  }, [check])

  const update = async () => {
    setPhase({ kind: 'updating' })
    let result: { ok: boolean; installed?: boolean; message?: string }
    try {
      const response = await fetch('/__update/apply', { method: 'POST', headers: { 'X-Logo-Reveal-Update': '1' } })
      result = await response.json()
    } catch {
      // The server restarted mid-answer (its own config changed): the update went through.
      result = { ok: true }
    }
    if (!result.ok) {
      setPhase({ kind: 'error', message: result.message ?? 'No se pudo actualizar.' })
      check()
      return
    }
    setPhase({ kind: 'reloading', installed: !!result.installed })
    await reloadWhenServerIsBack()
  }

  if (phase.kind === 'updating' || phase.kind === 'reloading') {
    return (
      <span className="flex items-center gap-2 text-xs text-sky-300">
        <span className="size-3 animate-spin rounded-full border-2 border-sky-300 border-t-transparent" />
        {phase.kind === 'updating' ? 'Actualizando…' : 'Actualizado, recargando…'}
      </span>
    )
  }

  if (phase.kind === 'error') {
    return (
      <button
        type="button"
        onClick={() => setPhase({ kind: 'idle' })}
        title={phase.message}
        className="max-w-72 truncate rounded-md px-2 py-1 text-xs text-red-300 ring-1 ring-red-400/40 hover:bg-red-500/10"
      >
        ⚠ {phase.message}
      </button>
    )
  }

  if (!status || (status.state !== 'behind' && status.state !== 'diverged')) return null

  const list = (status.commits ?? []).map((c) => `• ${c.subject}`).join('\n')
  const count = status.behind === 1 ? '1 cambio nuevo' : `${status.behind} cambios nuevos`

  if (status.state === 'diverged') {
    return (
      <span className="text-xs text-amber-300" title={`${status.reason}\n\n${list}`}>
        Hay una actualización ({count}), pero {status.reason?.charAt(0).toLowerCase()}
        {status.reason?.slice(1)}
      </span>
    )
  }

  return (
    <button
      type="button"
      onClick={() => void update()}
      title={`Trae la última versión de GitHub y recarga la app. Tu trabajo se conserva.\n\n${list}`}
      className="flex items-center gap-1.5 rounded-md bg-sky-500 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-sky-400"
    >
      <span aria-hidden>↻</span> Actualizar
      <span className="rounded bg-white/20 px-1.5 text-[11px]">{count}</span>
    </button>
  )
}
