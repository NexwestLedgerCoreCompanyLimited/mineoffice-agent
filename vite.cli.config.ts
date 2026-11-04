import { defineConfig } from 'vite'
import fs from 'fs'
import path from 'path'

const ROLE_IDS = ['commander', 'builder', 'miner', 'defender', 'explorer', 'coder']
const AGENT_IDS = ['marlow', 'juniper', 'wren', 'kit', 'rowan', 'tove']

// The status page's images ship inside the npm package
function copyViewerAssets() {
  return {
    name: 'copy-viewer-assets',
    closeBundle() {
      const from = path.resolve(__dirname, 'public/assets')
      const to = path.resolve(__dirname, 'dist-cli/viewer-assets')
      fs.mkdirSync(path.join(to, 'icons'), { recursive: true })
      fs.mkdirSync(path.join(to, 'portraits'), { recursive: true })
      const icons = ['logo_small', ...ROLE_IDS.map(id => `role_${id}`)]
      icons.forEach(name => fs.copyFileSync(path.join(from, 'icons', `${name}.png`), path.join(to, 'icons', `${name}.png`)))
      AGENT_IDS.forEach(id => fs.copyFileSync(path.join(from, 'portraits', `${id}.png`), path.join(to, 'portraits', `${id}.png`)))
    }
  }
}

// Builds the headless command line. Electron is never imported from here, so it works on a
// server with no display and no Electron installed.
export default defineConfig({
  plugins: [copyViewerAssets()],
  publicDir: false,
  resolve: {
    alias: {
      '@main': path.resolve(__dirname, 'src/main'),
      '@shared': path.resolve(__dirname, 'src/shared')
    }
  },
  build: {
    ssr: 'src/cli/index.ts',
    outDir: 'dist-cli',
    target: 'node22',
    emptyOutDir: true,
    minify: false,
    rollupOptions: {
      output: {
        format: 'es',
        entryFileNames: 'cli.mjs',
        banner: '#!/usr/bin/env node'
      }
    }
  }
})
