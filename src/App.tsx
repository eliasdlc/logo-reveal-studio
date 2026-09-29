import { useEffect } from 'react'
import { loadLogoFromSvg } from './processing/load'
import { useStudio } from './state/store'
import { DEMO_LOGO_SVG } from './ui/demoLogo'
import { Preview } from './ui/Preview'
import { Sidebar } from './ui/Sidebar'
import { Transport } from './ui/Transport'

const hasWebCodecs = typeof window !== 'undefined' && 'VideoEncoder' in window

export default function App() {
  const setLogo = useStudio((s) => s.setLogo)

  useEffect(() => {
    void loadLogoFromSvg(DEMO_LOGO_SVG).then((bitmap) => {
      if (!useStudio.getState().logo) setLogo(bitmap, 'Logo de ejemplo')
    })
  }, [setLogo])

  return (
    <div className="flex h-screen flex-col bg-neutral-950 text-neutral-100">
      <header className="flex items-center justify-between border-b border-white/10 px-5 py-3">
        <h1 className="text-sm font-semibold tracking-wide">Logo Reveal Studio</h1>
        <span className="text-xs text-neutral-500">Efecto: Swing</span>
      </header>

      {!hasWebCodecs && (
        <div className="border-b border-amber-500/30 bg-amber-500/10 px-5 py-2 text-sm text-amber-200">
          Este navegador no soporta WebCodecs, así que no podrá exportar video. Usa Chrome o Edge de
          escritorio actualizados.
        </div>
      )}

      <div className="flex min-h-0 flex-1">
        <Sidebar />
        <main className="flex min-w-0 flex-1 flex-col items-center justify-center gap-4 overflow-auto p-8">
          <div className="flex w-full max-w-5xl flex-col gap-4">
            <Preview />
            <Transport />
          </div>
        </main>
      </div>
    </div>
  )
}
