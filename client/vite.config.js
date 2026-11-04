import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { existsSync, readFileSync } from 'node:fs'
import path from 'path'

// The API and the realtime listener usually run on another box on the LAN
// (e.g. 192.168.1.152) while the dev server runs here (192.168.1.154). Derive
// the proxy targets from the same variables the app itself reads, so /api,
// /uploads and /ws can never point at the wrong machine.
function originOf(value, fallback) {
  if (!value) return fallback
  try {
    return new URL(value).origin
  } catch {
    return fallback
  }
}

function wsOriginOf(value, fallback) {
  const origin = originOf(value, '')
  if (!origin) return fallback
  return origin.replace(/^ws/, 'http')
}

// Read client/.env directly. Vite otherwise lets a variable inherited from the
// terminal override the file, and a shell that carries a stale
// `VITE_API_URL=http://localhost:3000` then rewrites the proxy target and the
// bundle to a port nothing listens on. The file is the project's env config, so
// it wins here for the values this app actually ships with.
function readEnvFile(file) {
  if (!existsSync(file)) return {}
  return Object.fromEntries(
    readFileSync(file, 'utf8')
      .split(/\r?\n/)
      .filter(line => line.includes('=') && !line.trim().startsWith('#'))
      .map(line => {
        const at = line.indexOf('=')
        return [line.slice(0, at).trim(), line.slice(at + 1).trim()]
      }),
  )
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, __dirname, '')
  const fileEnv = readEnvFile(path.resolve(__dirname, '.env'))
  const apiUrl = fileEnv.VITE_API_URL || env.VITE_API_URL
  const socketUrl = fileEnv.VITE_SOCKET_URL || env.VITE_SOCKET_URL
  const wsUrl = fileEnv.VITE_WS_URL || env.VITE_WS_URL
  const apiTarget = originOf(apiUrl, 'http://127.0.0.1:5000')
  const wsTarget = wsOriginOf(wsUrl, 'http://127.0.0.1:5001')

  return {
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
    // Pin the three endpoints to the value in client/.env for BOTH dev and the build.
    // `import.meta.env.VITE_API_URL` in the app code stays the same — only the source
    // of truth is fixed: the env file, not a stray variable inherited from the shell.
    define: {
      'import.meta.env.VITE_API_URL': JSON.stringify(apiUrl ?? ''),
      'import.meta.env.VITE_SOCKET_URL': JSON.stringify(socketUrl ?? ''),
      'import.meta.env.VITE_WS_URL': JSON.stringify(wsUrl ?? ''),
    },
    server: {
      // Listen on every interface, not just localhost, so phones and other
      // machines on the LAN can open http://192.168.1.154:5173.
      host: true,
      port: 5173,
      // Filesystem events are unreliable on this machine (edits were served
      // stale until a restart), so poll instead of trusting the watcher.
      watch: { usePolling: true, interval: 400 },
      // Fail loudly instead of silently moving to 5174 - the LAN URL people
      // bookmark is http://192.168.1.154:5173 and must stay stable.
      strictPort: true,
      // Dev-only: accept whatever Host header the client used (LAN IPs, mDNS
      // names, tunnels). Vite otherwise rejects unknown hosts.
      allowedHosts: true,
      // Proxy API, uploaded chat media and the realtime upgrade to the backend
      // so relative URLs resolve when running the Vite dev server (port 5173).
      proxy: {
        '/api': { target: apiTarget, changeOrigin: true },
        '/uploads': { target: apiTarget, changeOrigin: true },
        '/ws': { target: wsTarget, ws: true, changeOrigin: true },
      },
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
  }
})
