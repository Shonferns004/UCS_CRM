# Submitted Form

The volunteer-facing form a worker uses to log in, declare which documents they
handed over, read the current Trust policy, and sign for it. It is a standalone
React app served separately from the HR admin panel, but it is styled to read as
the same product as the HR form in `client/` (see `client/src/index.css`).

## Running it

```bash
npm install
cp .env.example .env     # then edit VITE_API_URL if you need to
npm run dev              # http://localhost:3002
```

Other commands:

```bash
npm run build            # production build into dist/
npm run preview          # serve the built output locally
npm test                 # document parser, design layer, and form flows
```

## Configuration

| Variable | Required | Default | Notes |
| --- | --- | --- | --- |
| `VITE_API_URL` | no | `https://api.beingsevak.org/api` | Backend base URL, `/api` prefix, no trailing slash. Read in `src/api.js`. |

`.env` is git-ignored. There is deliberately **no** `VITE_API_BASE` — an earlier
`src/config.js` used that name, was never imported, and silently did nothing.

## The signing flow

Signing is two-phase, and the phase is stored server-side as
`signature_status` in `draft` or `signed`.

1. **Save Signature** uploads a PNG and stores it as a `draft`. The volunteer can
   still leave and come back.
2. **Submit Signature** commits the draft to `signed` and stamps
   `signature_signed_at`.

A `draft` does **not** lock the form; only `signed` does. A signed record shows
a locked placeholder with an **Update signature** action, which sends
`re_sign: true`. If a save races a signature made in another tab, the backend
answers `409` with `can_resign`, and the form switches to the locked view rather
than losing the lock state — see `src/api.js` and the upload handler in
`backend/src/controllers/onboardingController.js`.

## Where the policy text comes from

Policies are rows in `company_policies`, read by the signature endpoint and
ordered by their sort column. The form renders whatever the server returns.

There is a built-in fallback policy, used **only** when the server responds
successfully with an empty list (HR has not seeded the table). A *failed* request
is deliberately treated differently: the form shows an error with a **Try again**
button and refuses to offer the accept checkbox, because falling back on a
network error would let a volunteer sign a policy the Trust has already replaced.
`scripts/test-flows.mjs` asserts both halves of that distinction.

## Tests

`npm test` runs three suites, all dependency-light and all offline:

| Suite | What it covers |
| --- | --- |
| `scripts/test-documents.mjs` | `src/documents.js` round-trips, including values written by the multi-select HR form. |
| `scripts/test-css-layer.mjs` | Every class used in `src/components/*.jsx` has a rule and every rule is used, and the PWA theme colour agrees across `index.html`, `vite.config.js` and the CSS tokens. |
| `scripts/test-app-shell.mjs` | `main.jsx` → `ErrorBoundary` → `App` → routes mounts, and the boundary really does catch a render throw. |
| `scripts/test-flows.mjs` | Mounts the real component in jsdom and drives login, documents, policies, draw, draft save, commit, locked view, re-sign, the 409 path, and the policy-fetch failure. |

`test-flows.mjs` and `test-app-shell.mjs` bundle the component with esbuild
against a mock `../api`, so they never touch the network or a database. Both
import `react` and `react-dom/client` **dynamically, after** the jsdom globals
are installed — `react-dom` binds its event system to the global `document` at
module-eval time, so a static import silently breaks controlled inputs.

## Notes for whoever edits this next

- **Styling.** There is no `tailwind.config.js`; Tailwind v4 is configured
  through `@tailwindcss/vite` plus an `@theme` block at the top of
  `src/index.css`. The `--sage` / `--sand` / `--paper` tokens there are remapped
  onto Tailwind's colour scales so utility classes match the HR palette. Adding a
  Tailwind config file will not do anything.
- **Theme colour** is declared in three places with no shared source: the
  `--sage` and `--sand` tokens in `src/index.css`, the `<meta name="theme-color">`
  in `index.html`, and the manifest in `vite.config.js`. The CSS suite asserts
  they agree — update all three together.
- **Fonts.** Poppins is self-hosted in `public/fonts/` (latin subset only, four
  weights, ~31 KB) rather than loaded from Google Fonts, because the service
  worker cannot precache a remote stylesheet. `workbox.globPatterns` already
  includes `woff2`, so the files are cached on install. If you add a weight or a
  script range, add the file and a matching `@font-face`.
- **Deploying.** This is a single-route SPA. The host must rewrite unknown paths
  to `index.html`; the service worker expects a `navigateFallback` of `/index.html`.
