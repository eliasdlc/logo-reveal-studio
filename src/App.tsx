import { useEffect } from 'react'
import { hasWebCodecs } from './export/codec'
import { decodeSvg } from './processing/decode'
import { useStudio } from './state/store'
import { useLogoProcessing } from './state/useLogoProcessing'
import { AnimationPanel } from './ui/AnimationPanel'
import { DEMO_LOGO_SVG } from './ui/demoLogo'
import { ExportPanel } from './ui/ExportPanel'
import { Preview } from './ui/Preview'
import { PreviewModeBar } from './ui/PreviewModeBar'
import { Sidebar } from './ui/Sidebar'
import { Transport } from './ui/Transport'

export default function App() {
  const addLogos = useStudio((s) => s.addLogos)
  useLogoProcessing()

  useEffect(() => {
    void decodeSvg(DEMO_LOGO_SVG).then((source) => {
      if (useStudio.getState().logos.length === 0) addLogos([{ name: 'Logo de ejemplo', source }], { demo: true })
    })
  }, [addLogos])

  return (
    <div className="flex h-screen flex-col bg-neutral-950 text-neutral-100">
      <header className="flex items-center justify-between border-b border-white/10 px-5 py-3">
        <h1 className="text-sm font-semibold tracking-wide">Logo Reveal Studio</h1>
      </header>

      {!hasWebCodecs() && (
        <div className="border-b border-amber-500/30 bg-amber-500/10 px-5 py-2 text-sm text-amber-200">
          Este navegador no soporta WebCodecs, así que no podrá exportar video. Usa Chrome o Edge de
          escritorio actualizados.
        </div>
      )}

      <div className="flex min-h-0 flex-1">
        <Sidebar />
        <main className="flex min-w-0 flex-1 flex-col items-center justify-center gap-4 overflow-auto p-6">
          <div className="flex w-full max-w-5xl flex-col gap-4">
            <PreviewModeBar />
            <Preview />
            <Transport />
            <ExportPanel />
          </div>
        </main>
        <AnimationPanel />
      </div>
    </div>
  )
}
