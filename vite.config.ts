import { defineConfig } from 'vite'
import fs from 'fs'
import path from 'path'
import react from '@vitejs/plugin-react'
import electron from 'vite-plugin-electron'
import renderer from 'vite-plugin-electron-renderer'

const aliases = {
  '@': path.resolve(__dirname, 'src/renderer/src'),
  '@main': path.resolve(__dirname, 'src/main'),
  '@shared': path.resolve(__dirname, 'src/shared')
}

// Electron loads the preload script as plain CommonJS, so it is copied rather than bundled
function copyPreload() {
  return {
    name: 'copy-preload',
    closeBundle() {
      const outDir = path.resolve(__dirname, 'dist-electron/preload')
      fs.mkdirSync(outDir, { recursive: true })
      fs.copyFileSync(path.resolve(__dirname, 'src/preload/index.cjs'), path.join(outDir, 'index.cjs'))
    }
  }
}

export default defineConfig({
  plugins: [
    react(),
    copyPreload(),
    electron([
      {
        entry: 'src/main/index.ts',
        vite: {
          resolve: { alias: aliases },
          build: {
            outDir: 'dist-electron/main',
            rollupOptions: {
              output: {
                entryFileNames: '[name].mjs'
              },
              external: [
                'electron',
                'mineflayer',
                'minecraft-protocol',
                'mineflayer-pathfinder',
                'vec3',
                'ws',
                'fsevents'
              ]
            }
          }
        }
      }
    ]),
    renderer()
  ],
  resolve: {
    alias: aliases
  },
  server: {
    port: 5173
  }
})
