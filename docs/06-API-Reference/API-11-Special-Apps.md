# API Reference — 11-Special-Apps

> Sub-app routers (metropad, sevak-library, aadhaar). Extracted recursively from their own route files.

> Paths are relative to each sub-app mount; see sub-mount lists for full paths. Status: Verified (routes read); chained sub-routers not expanded.

## MetroPad (backend/src/metropad)

Self-contained app with its own routers under routes/*.route.js, mounted in router.js.

**Mount prefix:** `/api/metropad`

**Sub-mounts (from meta router):** `/auth`, `/metro-lines`, `/stations`, `/machines`, `/refills`, `/stock-issues`, `/maintenance`, `/dashboard`, `/monthly-data`, `/reports`, `/cash-collections`, `/stock`, `/import`, `/users`, `/audit-logs`


### backend\src\metropad\routes\audit.route.js

| Method | Path | Auth / controller |
| --- | --- | --- |

### backend\src\metropad\routes\auth.route.js

| Method | Path | Auth / controller |
| --- | --- | --- |

### backend\src\metropad\routes\cashCollection.route.js

| Method | Path | Auth / controller |
| --- | --- | --- |

### backend\src\metropad\routes\dashboard.route.js

| Method | Path | Auth / controller |
| --- | --- | --- |

### backend\src\metropad\routes\import.route.js

| Method | Path | Auth / controller |
| --- | --- | --- |

### backend\src\metropad\routes\machine.route.js

| Method | Path | Auth / controller |
| --- | --- | --- |

### backend\src\metropad\routes\maintenance.route.js

| Method | Path | Auth / controller |
| --- | --- | --- |

### backend\src\metropad\routes\metroLine.route.js

| Method | Path | Auth / controller |
| --- | --- | --- |

### backend\src\metropad\routes\monthlyData.route.js

| Method | Path | Auth / controller |
| --- | --- | --- |

### backend\src\metropad\routes\refill.route.js

| Method | Path | Auth / controller |
| --- | --- | --- |

### backend\src\metropad\routes\report.route.js

| Method | Path | Auth / controller |
| --- | --- | --- |

### backend\src\metropad\routes\station.route.js

| Method | Path | Auth / controller |
| --- | --- | --- |

### backend\src\metropad\routes\stock.route.js

| Method | Path | Auth / controller |
| --- | --- | --- |

### backend\src\metropad\routes\stockIssue.route.js

| Method | Path | Auth / controller |
| --- | --- | --- |

### backend\src\metropad\routes\user.route.js

| Method | Path | Auth / controller |
| --- | --- | --- |

## Sevak Library (backend/src/sevakLibrary)

Supabase-backed membership library sub-app.

**Mount prefix:** `/api/sevak-library`


### backend/src/sevakLibrary/config/supabase.js

| Method | Path | Auth / controller |
| --- | --- | --- |

### backend/src/sevakLibrary/controllers/application.controller.js

| Method | Path | Auth / controller |
| --- | --- | --- |

### backend/src/sevakLibrary/controllers/coupon.controller.js

| Method | Path | Auth / controller |
| --- | --- | --- |

### backend/src/sevakLibrary/controllers/email.controller.js

| Method | Path | Auth / controller |
| --- | --- | --- |

### backend/src/sevakLibrary/middleware/errorHandler.js

| Method | Path | Auth / controller |
| --- | --- | --- |

### backend/src/sevakLibrary/middleware/upload.js

| Method | Path | Auth / controller |
| --- | --- | --- |

### backend/src/sevakLibrary/router.js

| Method | Path | Auth / controller |
| --- | --- | --- |

### backend/src/sevakLibrary/routes/router.js

| Method | Path | Auth / controller |
| --- | --- | --- |

### backend/src/sevakLibrary/services/application.service.js

| Method | Path | Auth / controller |
| --- | --- | --- |

### backend/src/sevakLibrary/services/coupon.service.js

| Method | Path | Auth / controller |
| --- | --- | --- |

### backend/src/sevakLibrary/services/email.service.js

| Method | Path | Auth / controller |
| --- | --- | --- |

### backend/src/sevakLibrary/services/report.service.js

| Method | Path | Auth / controller |
| --- | --- | --- |

## Aadhaar (backend/src/aadhaar)

Aadhaar image/XML decode endpoints.

**Mount prefix:** `/api/aadhaar`


### backend/src/aadhaar/aadhaar.test.js

| Method | Path | Auth / controller |
| --- | --- | --- |

### backend/src/aadhaar/decoder.js

| Method | Path | Auth / controller |
| --- | --- | --- |

### backend/src/aadhaar/fixture.js

| Method | Path | Auth / controller |
| --- | --- | --- |

### backend/src/aadhaar/routes.js

| Method | Path | Auth / controller |
| --- | --- | --- |
| POST | `/decode-qr` | `authenticateRole('super_admin', 'admin', 'ngo', 'accounts', 'event_head', 'worker'), (req, res) => { const qrData = req.` |
