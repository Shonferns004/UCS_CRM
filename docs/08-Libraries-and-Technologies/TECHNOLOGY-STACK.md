# UCS CRM — Technology Stack

> **Document ID:** 08-Libraries-and-Technologies/TECHNOLOGY-STACK
> **Status:** Verified (versions read from lockfiles 2026-10-13)
> **Generated:** 2026-10-13
> **Related:** [DEPENDENCY-REFERENCE](DEPENDENCY-REFERENCE.md) · [PROJECT-INVENTORY](../00-Project-Overview/PROJECT-INVENTORY.md)

All versions below are the **locked** versions from `backend/package-lock.json` and `client/package-lock.json`, not the semver ranges in `package.json`.

---

## 1. Layer Summary

| Layer | Technology | Version | Where |
| --- | --- | --- | --- |
| Backend runtime | Node.js | 24.x (engines) | `backend/package.json` |
| Backend module system | ECMAScript Modules | `"type": "module"` | `backend/package.json` |
| Backend framework | Express | 4.22.2 | `backend/package.json` |
| Database | PostgreSQL | (server-managed) | `backend/src/config/db.js` |
| DB drivers | `pg` | 8.22.0 | `backend/package.json` |
| DB client | Supabase JS client (query builder) | via `db.js` | `backend/src/config/db.js` |
| ORM | none | — | — |
| Authentication | JSON Web Tokens | `jsonwebtoken` 9.0.3 | `backend/src/middleware/authMiddleware.js` |
| Password hashing | bcryptjs | 2.4.3 | `backend/src/controllers/authController.js` |
| Realtime server | Socket.IO | 4.8.3 | `backend/src/socket.js` |
| Realtime client | socket.io-client | 4.8.3 | `client/src/lib/socket.js` |
| Frontend framework | React | 19.2.7 | `client/package.json` |
| Build tool | Vite | 6.4.3 | `client/package.json` |
| Routing | React Router DOM | 7.18.1 | `client/src/App.jsx` |
| Styling | Tailwind CSS | 4.3.2 | `client/package.json` |
| Server state | TanStack React Query | 5.101.2 | `client/package.json` |
| Client state | React Context + Zustand | zustand 5.0.14 | `client/src/store.jsx` |
| Forms | React Hook Form + Zod | 7.81.0 / 4.4.3 | `client/package.json` |
| Charts | Recharts | 3.9.2 | `client/package.json` |
| Diagrams | Mermaid | 11.16.0 | `client/src/panels/documentation/components/DiagramViewer.jsx` |
| Calendar UI | FullCalendar | 6.1.21 | `client/package.json` |
| Node canvas flow | @xyflow/react | 12.11.2 | `client/package.json` |

---

## 2. Backend Key Libraries

| Package | Locked | Purpose in this project | Notable usage |
| --- | --- | --- | --- |
| `express` | 4.22.2 | HTTP API framework | `backend/src/index.js` |
| `cors` | 2.8.6 | CORS handling (`origin: '*'`) | `backend/src/index.js` |
| `jsonwebtoken` | 9.0.3 | JWT issue/verify | `authMiddleware.js`, `authController.js` |
| `bcryptjs` | 2.4.3 | Password hashing/verification | `authController.js` |
| `pg` | 8.22.0 | PostgreSQL driver / raw SQL | `config/db.js` |
| `socket.io` | 4.8.3 | Realtime transport | `socket.js` |
| `node-cron` | 4.2.1 | Scheduled jobs | scheduler services |
| `multer` | 1.4.5-lts.2 | Multipart uploads (memory storage, 50 MB limit) | `backend/src/index.js` |
| `exceljs`, `xlsx` | 4.4.0 / 0.18.5 | Spreadsheet import/export | accounts, import controllers |
| `sharp` | 0.35.5 | Image processing | media/signature services |
| `pdfkit` | 0.20.2 | PDF generation | `certificatePdf.js` |
| `docxtemplater`, `pizzip` | 3.69.3 / 3.2.0 | DOCX generation from templates | `certificateDocx.js`, `attendanceReportDocx.js` |
| `@resvg/resvg-js` | 2.6.2 | SVG rasterization | certificate rendering |
| `razorpay` | 2.9.6 | Payment gateway SDK | payment services |
| `firebase-admin` | 14.0.0 | FCM push | `config/firebase.js` |
| `groq-sdk` | 1.2.1 | AI completions | `config/groq.js` |
| `imapflow`, `mailparser` | 1.4.6 / 3.9.14 | Email import | `services/emailImporter.js` |
| `ioredis` | 5.11.1 | Redis client | `config/redis.cjs` |
| `nodemailer` | 6.10.1 | SMTP mail | notification/email services |
| `express-rate-limit` | 8.5.2 | Rate limiting (dependency present) | see security set for where applied |
| `@aws-sdk/*` | various | S3, EC2, RDS, IAM, Backup, CloudWatch | `backend/src/index.js`, `services/*` |
| `@xone-labs/aadharjs` | 0.0.2 | Aadhaar processing | `backend/src/aadhaar/` |
| `uuid` | 9.0.1 | ID generation | across services |
| `dotenv` | 16.6.1 | Env loading | `backend/src/index.js` |

---

## 3. Frontend Key Libraries

| Package | Locked | Purpose in this project |
| --- | --- | --- |
| `react`, `react-dom` | 19.2.7 | UI runtime |
| `react-router-dom` | 7.18.1 | Routing |
| `@tanstack/react-query` | 5.101.2 | Server-state caching |
| `zustand` | 5.0.14 | The single module-global store (`context/accessCodeStore.js`) |
| `react-hook-form`, `@hookform/resolvers`, `zod` | 7.81.0 / 5.4.0 / 4.4.3 | Form state + schema validation |
| `recharts` | 3.9.2 | Dashboard charts |
| `mermaid` | 11.16.0 | Renders documentation diagrams |
| `@fullcalendar/*` | 6.1.21 | Calendar views (events, attendance) |
| `@xyflow/react` | 12.11.2 | Node/flow diagrams |
| `lucide-react`, `@phosphor-icons/react` | 1.24.0 / 2.1.10 | Icons |
| `date-fns`, `react-datepicker`, `react-day-picker` | 4.4.0 / 9.1.0 / 10.0.1 | Dates |
| `exceljs`, `xlsx`, `xlsx-js-style`, `papaparse`, `file-saver` | — | Spreadsheet/CSV export |
| `jspdf`, `html2canvas` | 4.2.1 / 1.4.1 | Client PDF generation |
| `qr-code-styling`, `qrcode.react` | 1.9.2 / 4.2.0 | QR generation |
| `mammoth` | 1.12.2 | DOCX → HTML preview |
| `jszip` | 3.10.1 | Zip handling |
| `socket.io-client` | 4.8.3 | Realtime |
| `axios` | 1.20.0 | Used only by the embedded Metropad sub-app |
| `sonner` | 2.0.7 | Toasts |
| `clsx`, `tailwind-merge`, `class-variance-authority` | — | Class utilities |

---

## 4. Build & Tooling

| Tool | Locked | Scope |
| --- | --- | --- |
| `vite` | 6.4.3 | Client build/dev |
| `@vitejs/plugin-react` | 4.7.0 | React fast refresh |
| `@tailwindcss/vite`, `tailwindcss`, `postcss`, `autoprefixer` | 4.3.2 / 4.3.2 / 8.5.16 / 10.5.2 | Styling pipeline |
| `typescript` | 7.0.2 | Present as a dev dependency (source is `.jsx`) |
| `nodemon` | 3.1.14 | Backend dev reload |

---

## 5. Notes and Caveats

- `axios` is a client dependency but is used only by the self-contained Metropad sub-app (`panels/accounts/metropad/services/api.js`); the rest of the client uses the `fetch` wrapper. **Verified.**
- `typescript` is installed but the application source is JavaScript/JSX. It is not known to be run in CI. **Partially verified.**
- AWS SDK packages are numerous; some may only be used by operational scripts (backup, capacity). Treat as used-in-backend, not necessarily on every request path. **Partially verified.**
- No ORM is present; database access is Supabase client + raw SQL. **Verified.**
