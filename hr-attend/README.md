# HR Attend

A dedicated mobile app for HR / admins to punch employees **in** and **out**
with a geo-tagged selfie, for cases where an employee is unable to punch
themselves via the main attendance app.

## How it works

1. An HR / admin / super-admin logs in with their normal credentials
   (`POST /api/auth/worker/login`).
2. The app lists all workers (`GET /api/workers`).
3. Selecting a worker auto-detects the required action from today's status
   (`GET /api/attendance/today-all`):
   - no punch-in yet &rarr; **Punch In**
   - punched in but not out &rarr; **Punch Out**
   - already punched out &rarr; nothing to do
4. The HR captures a **geo-tagged selfie** and submits it.
5. Location is resolved by the **Google Geolocation API** (WiFi / cell-tower,
   works indoors without GPS) with an automatic **GPS fallback**.
6. The punch is recorded immediately (`POST /api/attendance/hr-selfie-punch`)
   with a `selfie_status` of `approved` and the selfie stored in Supabase
   storage.

## Backend endpoint

`POST /api/attendance/hr-selfie-punch`
- Auth: `super_admin`, `admin`, `hr`
- Body: `{ worker_id, type, selfie_base64, mime_type, latitude, longitude }`
- `type` is `punch_in` or `punch_out`.
- Validates the punch location against the configured office geofence.

## Configuration

- API base URL and the Google Geolocation API key are in
  `lib/config.dart` (`Config.apiBaseUrl`, `Config.googleGeolocationKey`).

## Build

```bash
flutter pub get
flutter build apk --release
```

App package: `com.ucs.hrattend`.
