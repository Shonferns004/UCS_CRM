import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// Two ways this app is hosted, so `base` cannot be a constant (same rule as
// others/voting):
//
//   - Inside the CRM, the Express app serves it at /sevak-library
//     (backend/src/index.js). Assets must resolve to /sevak-library/assets/*.
//     This is the default for local dev and the in-repo deploy.
//   - On Vercel the app *is* the site root, so assets must resolve to /assets/*.
//     Vercel sets VERCEL=1 in the build, which is how this is detected.
//
// VITE_BASE wins when set, so a build for a specific host can be forced.
const isVercel = !!process.env.VERCEL
const base = process.env.VITE_BASE ?? (isVercel ? '/' : '/sevak-library/')

export default defineConfig({
  base,
  plugins: [
    react(),
    VitePWA({
      pwaAssets: { config: true },
      registerType: 'autoUpdate',
      manifest: {
        name: 'Sevak Library',
        short_name: 'Sevak Library',
        description: 'Sevak Library membership admission form',
        theme_color: '#1a7f4b',
        background_color: '#f0f4f1',
        display: 'standalone',
        start_url: `${base}#/`,
        orientation: 'portrait'
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,ico,woff2}'],
        navigateFallback: `${base}index.html`
      },
      devOptions: {
        enabled: true
      }
    })
  ],
  server: {
    port: 5173,
    host: true,
    proxy: {
      '/api': 'http://localhost:5000'
    }
  }
})