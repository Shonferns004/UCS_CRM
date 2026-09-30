import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  base: '/',
  plugins: [react(), tailwindcss()],
  server: {
    port: 3003,
    strictPort: true,
    proxy: {
      '/api': 'https://api.beingsevak.org',
    },
  },
})
