import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import { readFileSync, writeFileSync } from 'fs'
import { resolve } from 'path'

/** Replace BUILD_TIMESTAMP in sw.js after build so every deploy triggers a service worker update. */
function stampServiceWorker(): Plugin {
  return {
    name: 'stamp-sw',
    apply: 'build',
    closeBundle() {
      const swPath = resolve(__dirname, 'dist/sw.js')
      const content = readFileSync(swPath, 'utf-8')
      writeFileSync(swPath, content.replace('BUILD_TIMESTAMP', Date.now().toString()))
    },
  }
}

export default defineConfig({
  plugins: [react(), stampServiceWorker()],
  base: '/games/doodlebloom/',
  build: {
    outDir: 'dist',
  },
})
