import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    // Build-time Tailwind. This used to be served at runtime by the
    // cdn.tailwindcss.com Play CDN, which meant the built CSS shipped zero
    // utilities: the entire layout depended on a remote request that a PWA
    // service worker cannot cache, and the page showed unstyled until it
    // resolved. Compiling here makes the styles deterministic and offline-safe.
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'apple-touch-icon.png'],
      manifest: {
        name: 'Submitted Form',
        short_name: 'Submitted Form',
        description: 'UCS worker document submission form',
        lang: 'en',
        // These must match the --sage / --sand tokens in src/index.css and the
        // <meta name="theme-color"> in index.html. They live in three places
        // with no shared source, so scripts/test-css-layer.mjs asserts they
        // agree rather than trusting a human to remember.
        theme_color: '#5B6B4E',
        background_color: '#F3EFE7',
        display: 'standalone',
        orientation: 'portrait',
        start_url: '/',
        scope: '/',
        icons: [
          { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' },
          { src: 'maskable-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
          { src: 'apple-touch-icon.png', sizes: '180x180', type: 'image/png' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,png,svg,ico,woff,woff2}'],
        navigateFallback: '/index.html',
      },
    }),
  ],
  server: { port: 3002, strictPort: true },
})
