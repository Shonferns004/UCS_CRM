# Local media storage

AWS S3 is no longer the media backend for this deployment. The bucket dump at
`C:\UcsCrmMedia` is the live store: uploads write there, and the backend serves
those bytes at `GET /api/media/*`.

## Why the dump needs no migration

Keys keep the exact S3 layout (`<prefix>/<file>`):

```
C:\UcsCrmMedia\
  beneficiary-documents\
  certificates\
  chat-media\
  event\
  fro-audio\
  hr-letters\
  media-library\
  receipts\
  sevak-library\
  whatsapp-media\
  worker-documents\
```

An old database value such as

```
https://ucs-crm-uploads-mumbai.s3.ap-south-1.amazonaws.com/worker-documents/selfies/a.jpg
```

maps to `C:\UcsCrmMedia\worker-documents\selfies\a.jpg`. `services/mediaProxy.js`
does that mapping at read time, so no `UPDATE` over the media columns is needed.

## Configuration (`backend/.env`)

```env
MEDIA_STORAGE=local
LOCAL_MEDIA_DIR=C:\UcsCrmMedia
MEDIA_PUBLIC_BASE_URL=http://192.168.1.100:5000
```

- `MEDIA_STORAGE=local` is the default. Set `MEDIA_STORAGE=s3` only to roll back
  to the old implementation.
- `LOCAL_MEDIA_DIR` must be readable and writable by the account that runs the
  backend. Without write access new uploads fail.
- `MEDIA_PUBLIC_BASE_URL` is what stored URLs are built from. Use the address
  clients open the CRM with:
  - office LAN: `http://192.168.1.100:5000`
  - Tailscale: `http://100.111.12.17:5000`
  - public tunnel/domain (needed for WhatsApp/Meta): the HTTPS URL

Empty `MEDIA_PUBLIC_BASE_URL` yields same-origin `/api/media/...` links. They
work in a browser but not for consumers outside this deployment (Meta fetches
template headers and receipt PDFs itself).

## What happens to missing files

Some rows reference objects that were created after the dump was taken. They
cannot be fetched because AWS is suspended. `scripts/media/report-missing-media.mjs`
writes the worklist:

```powershell
cd backend
node scripts/media/report-missing-media.mjs
```

It writes `backend/missing-media-report.csv` (git-ignored, contains PII) and
prints resolved/missing totals. A missing file answers `404` from
`/api/media/*`; staff re-upload it from the CRM and the new file is written to
the local folder.

## Verification

```powershell
cd backend
node scripts/media/smoke-local-storage.mjs   # driver smoke test (temp folder)
node --test src/services/localMedia.test.js
node --test src/routes/mediaRoutes.test.js
```

## Rollback

1. Set `MEDIA_STORAGE=s3` and restore the S3 credentials/bucket values.
2. Restart the backend.

The S3 code path is intact; local mode only changes which driver
`db.storage.from(...)` returns.
