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
        manualChunks(id) {
          if (id.includes('node_modules/jspdf') || id.includes('node_modules/canvg') || id.includes('node_modules/dompurify')) return 'pdf'
          if (id.includes('node_modules/xlsx-js-style') || id.includes('node_modules/xlsx')) return 'excel'
          if (id.includes('node_modules/exceljs')) return 'exceljs'
        },
      },
    },
  },
})
