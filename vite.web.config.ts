import { resolve } from 'path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Standalone Web-Build für Browser (ohne Electron)
// Nutzt IndexedDB (via Dexie) statt SQLite
// GITHUB_PAGES=true → base wird auf /dienstplan-electron/ gesetzt (für GitHub Pages)
const base = process.env.GITHUB_PAGES === 'true' ? '/dienstplan-electron/' : '/'

export default defineConfig({
  base,
  root: resolve(__dirname, 'src/renderer'),
  build: {
    outDir: resolve(__dirname, 'dist-web'),
    emptyOutDir: true
  },
  resolve: {
    alias: {
      '@renderer': resolve(__dirname, 'src/renderer/src')
    }
  },
  plugins: [react()]
})
