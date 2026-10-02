import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'path'

export default defineConfig({
  base: '/',
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      // The observance reference calendar is plain ESM with no Node dependencies,
      // so the client imports the very same module the server uses. One source of
      // truth means festival dates can never drift between the two.
      '@observances': path.resolve(__dirname, '../backend/src/utils/observances.js'),
    },
  },
  server: {
    // The alias above points outside the client root, so the dev server must be
    // allowed to serve that file.
    fs: { allow: [path.resolve(__dirname, '..'), path.resolve(__dirname, '.')] },
  },
  build: {
    rollupOptions: {
      output: {
        // xlsx / jspdf / exceljs are only ever used behind click handlers in
        // already-lazy panel pages. Forcing them into named chunks made Rollup
        // add a static edge from the entry chunk, so every login downloaded
        // ~1.9 MB of export libraries no one had opened yet. Leaving them out
        // lets Rollup keep each library inside whichever lazy chunk needs it.
      },
    },
  },
})
