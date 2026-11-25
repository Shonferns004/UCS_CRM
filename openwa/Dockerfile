# OpenWA — production image for Cloudflare Containers (linux/amd64)
#
# The build stage runs `npm ci` WITHOUT --ignore-scripts on purpose: the postinstall patches
# (@whiskeysockets/baileys pairing/newsletter/app-state) are part of how this app links devices.
# Its node_modules are copied into the runtime stage, since reinstalling with --omit=dev there would
# drop those patches.
FROM node:22-bookworm-slim AS build
WORKDIR /app

# sharp ships prebuilt linux-x64 binaries, but some optional deps still compile.
RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 make g++ ca-certificates \
  && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

COPY . .
RUN npm run build

FROM node:22-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production \
    PORT=3001

# The main SQLite file (API keys/audit) defaults to ./data/main.sqlite and the plugin registry to
# ./data, so the directory must exist even though nothing in it needs to survive a restart. Render
# injects its own PORT; this ENV is only a local default.
RUN mkdir -p /app/data

# Only the compiled app and the already-patched dependencies. No data dir: the auth state lives in
# Postgres (BAILEYS_AUTH_STORE=database) and media belongs in R2 (STORAGE_TYPE=s3).
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/package.json ./package.json

# Nest binds 0.0.0.0 by default; the Worker reaches it through getTcpPort(3001).
EXPOSE 3001
CMD ["node", "dist/main"]
