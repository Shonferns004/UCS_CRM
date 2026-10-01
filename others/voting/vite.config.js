import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Two ways this app is hosted, so `base` cannot be a constant:
//
//   - Inside the CRM, the Express app serves it at /voting (backend/src/index.js).
//     Assets must resolve to /voting/assets/*, or every URL points at the CRM app
//     instead. This is the default for local dev and the in-repo deploy.
//   - On Vercel the app *is* the site root, so assets must resolve to /assets/*.
//     Vercel sets VERCEL=1 in the build, which is how this is detected — an
//     inline `VITE_BASE=/ vite build` would work on Vercel's Linux builders but
//     fail on a Windows shell, and silently produce a broken deploy either way.
//
// VITE_BASE wins when set, so a build for a specific host can be forced.
const isVercel = !!process.env.VERCEL
const base = process.env.VITE_BASE ?? (isVercel ? '/' : '/voting/')

export default defineConfig({
  base,
  plugins: [react()],
  // 5180 is free: the other apps in this repo use 3001 (hr form), 5173 (the
  // default), 5175 (recruit-quizz) and 5176 (metro).
  server: { port: 5180 },
  build: { outDir: 'dist' },
})