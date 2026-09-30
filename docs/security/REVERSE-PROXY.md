# Reverse Proxy, TLS and Edge Hardening

## Current state — read this first

**There is no reverse proxy configuration in version control.** A repository-wide
search for `*.conf`, `Caddyfile`, `add_header`, and security-header directives
returns no applicable file for `client/`. `client/` is deployed by copying
`client/dist` into `/var/www/crm` on host `13.207.47.116`
(`.github/workflows/deploy-frontend.yml:76-100`), and `backend/` runs under PM2
on the same host (`.github/workflows/deploy.yml:22-45`).

Two consequences:

1. Whatever headers are served today are unversioned, unreviewed, and cannot be
   confirmed from the repository. Treat the edge as **unknown** until audited on
   the host.
2. There is no committed record of TLS versions, cipher policy, or which
   hostnames are served — so a config change is unreviewable and a rollback is
   guesswork.

**The first action for this area is to bring the nginx site config into the
repository** under `infra/nginx/`, so it is reviewed like code.

## What the edge must do

| Concern | Requirement |
| --- | --- |
| TLS | TLS 1.2+ only, modern ciphers, HSTS with a long max-age |
| Hiding the origin | The app host must not be directly reachable; the proxy is the only ingress |
| Static hosting | Serve `client/dist` with hashed-asset caching, `index.html` never cached |
| API proxying | Proxy `/api` to the Node process; do not expose the Node port publicly |
| Upload path | Do **not** proxy or serve `/uploads` as static — it must be authorised (SEC-005) |
| Headers | Set CSP, HSTS, frame-ancestors, nosniff, referrer and permissions policy |
| Body size | Bound request bodies at the edge *before* they reach the Node parser |
| Logging | Log status, method, path, upstream status and client IP — never bodies or headers |
| Rate limiting | Coarse edge limit to absorb floods before they reach the app |

## Sample nginx configuration

Baseline for `infra/nginx/crm.conf`. Review before use; it assumes the Node
backend listens on `127.0.0.1:5000` and the site root is `/var/www/crm`.

```nginx
# Rate limit zones. Tune the numbers to real traffic before enforcing.
limit_req_zone $binary_remote_addr zone=api_limit:10m rate=20r/s;
limit_req_zone $binary_remote_addr zone=auth_limit:10m rate=12r/m;
limit_conn_zone $binary_remote_addr zone=conn_limit:10m;

server {
    listen 80;
    server_name crm.beingsevak.org api.beingsevak.org;
    # Redirect everything except the ACME challenge.
    location /.well-known/acme-challenge/ { root /var/www/certbot; }
    location / { return 301 https://$host$request_uri; }
}

server {
    listen 443 ssl;
    http2 on;
    server_name crm.beingsevak.org;

    ssl_certificate     /etc/letsencrypt/live/crm.beingsevak.org/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/crm.beingsevak.org/privkey.pem;
    ssl_protocols       TLSv1.2 TLSv1.3;
    ssl_prefer_server_ciphers off;
    ssl_session_cache   shared:SSL:10m;
    ssl_session_timeout 1d;
    ssl_stapling on;
    ssl_stapling_verify on;

    # --- Security headers (SEC-003) ---------------------------------------
    # 'unsafe-inline' for style-src is required by Tailwind v4 and the inline
    # style attributes used across the panels. Tighten to a nonce/hash as a
    # follow-up. No 'unsafe-eval': the Vite production build does not need it.
    # 'wasm-unsafe-eval' is required by the xlsx/jszip report libraries.
    add_header Content-Security-Policy "\
default-src 'self'; \
base-uri 'self'; \
object-src 'none'; \
frame-ancestors 'none'; \
form-action 'self'; \
script-src 'self' 'wasm-unsafe-eval'; \
style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; \
font-src 'self' https://fonts.gstatic.com data:; \
img-src 'self' data: blob:; \
connect-src 'self' wss://api.beingsevak.org; \
frame-src 'self' blob:; \
worker-src 'self' blob:" always;

    add_header Strict-Transport-Security "max-age=63072000; includeSubDomains; preload" always;
    add_header X-Content-Type-Options    "nosniff" always;
    add_header X-Frame-Options           "DENY" always;
    add_header Referrer-Policy           "strict-origin-when-cross-origin" always;
    add_header Permissions-Policy        "geolocation=(), microphone=(), camera=(), payment=()" always;
    add_header Cross-Origin-Opener-Policy   "same-origin" always;
    # Remove fingerprints that describe the stack.
    proxy_hide_header X-Powered-By;

    root /var/www/crm;
    index index.html;

    gzip on;
    gzip_types text/css application/javascript application/json image/svg+xml;
    client_max_body_size 12m;   # bound before Node buffers (SEC-019)

    # --- Static assets ----------------------------------------------------
    location /assets/ {
        expires 1y;
        add_header Cache-Control "public, immutable" always;
        try_files $uri =404;
    }

    # The entry point must never be cached, or clients pin an old bundle.
    location = /index.html {
        add_header Cache-Control "no-store, must-revalidate" always;
    }

    # --- API --------------------------------------------------------------
    location /api/auth/    { limit_req zone=auth_limit burst=5 nodelay; proxy_pass http://127.0.0.1:5000; include /etc/nginx/proxy_params; }
    location /api/workers/  { limit_req zone=auth_limit burst=5 nodelay; proxy_pass http://127.0.0.1:5000; include /etc/nginx/proxy_params; }
    location /api/         { limit_req zone=api_limit  burst=40 nodelay; proxy_pass http://127.0.0.1:5000; include /etc/nginx/proxy_params; }

    # /uploads must NOT be a static alias (SEC-005). Either drop it so the
    # backend decides, or proxy it to an authorising route.
    location /uploads/ { return 404; }

    location / { try_files $uri $uri/ /index.html; }
}
```

`/etc/nginx/proxy_params` should include at least:

```nginx
proxy_http_version 1.1;
proxy_set_header Host              $host;
proxy_set_header X-Real-IP         $remote_addr;
proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;
proxy_set_header X-Forwarded-Proto $scheme;
proxy_set_header Upgrade           $http_upgrade;   # websockets
proxy_set_header Connection        "upgrade";
proxy_read_timeout 120s;
```

`X-Forwarded-For`/`X-Forwarded-Proto` matter: the backend sets
`app.set('trust proxy', 'loopback')` (`backend/src/index.js:116`), so the hop
count must match reality or `req.ip` is wrong — which breaks any rate limiter
or audit log (SEC-015). If the Node process ever binds a non-loopback interface,
firewall it so only nginx can reach it.

## CSP rollout

Ship CSP in report-only mode first, then enforce:

1. `Content-Security-Policy-Report-Only` with `report-uri`/`report-to`, collect
   violations for a week.
2. Fix the violations — expect the three `dangerouslySetInnerHTML` sinks
   (SEC-002, SEC-010) to surface here.
3. Enforce with the policy above.

Do not skip straight to enforcement: the panels use inline `style` attributes
extensively, so `style-src` will need `'unsafe-inline'` or a nonce strategy.

## Certificate handling

- Use certbot with a renewal timer; confirm the deploy hook reloads nginx.
- Cover every hostname served, including any `*.sslip.io` names.
- Enable OCSP stapling and monitor expiry — an expired certificate on this host
  takes the CRM down entirely.

## Verification checklist

Run from outside the app network:

```bash
curl -sI https://crm.beingsevak.org | grep -iE 'strict-transport|content-security|x-frame|x-content-type|referrer-policy'
curl -sI --tlsv1.2 --tls-max 1.1 https://crm.beingsevak.org   # must fail
curl -sI https://13.207.47.116 -H 'Host: crm.beingsevak.org'  # must not serve content
curl -s  https://crm.beingsevak.org/uploads/../package.json   # path traversal, must 400/404
```

Also confirm the Node port is unreachable from outside (see SEC-005) and that
`/uploads` no longer serves files.
