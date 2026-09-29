import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'
import { updater } from './scripts/updater.ts'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss(), updater()],
  // The H.264 encoder worker imports modules.
  worker: { format: 'es' },
  test: {
    include: ['src/**/*.test.ts'],
  },
})
