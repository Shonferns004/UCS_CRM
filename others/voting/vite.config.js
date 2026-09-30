import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Served by the main API at /voting (see backend/src/index.js), so `base` has to
// be the subpath or every asset URL resolves to the CRM app instead.
export default defineConfig({
  base: '/voting/',
  plugins: [react()],
  // 5180 is free: the other apps in this repo use 3001 (hr form), 5173 (the
  // default), 5175 (recruit-quizz) and 5176 (metro).
  server: { port: 5180 },
  build: { outDir: 'dist' },
})
