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
    },
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
