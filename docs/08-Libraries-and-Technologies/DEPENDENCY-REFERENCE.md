# UCS CRM — Dependency Reference

> **Document ID:** 08-Libraries-and-Technologies/DEPENDENCY-REFERENCE
> **Status:** Verified (direct dependencies + locked versions)
> **Generated:** 2026-10-13
> **Sources:** `backend/package.json`, `backend/package-lock.json`, `client/package.json`, `client/package-lock.json`
> **Related:** [TECHNOLOGY-STACK](TECHNOLOGY-STACK.md)

This document lists **direct** dependencies only, with the exact version resolved by the lockfile. Transitive dependencies are numerous and are intentionally not enumerated here; they live in the respective `package-lock.json` files. A dependency appearing here does **not** imply it is exercised on every request path.

Legend: **prod** = runtime dependency · **dev** = development-only.

---

## 1. Backend — Direct Dependencies

| Package | Range | Locked | Kind |
| --- | --- | --- | --- |
| `@aws-sdk/client-backup` | ^3.1113.0 | 3.1113.0 | prod |
| `@aws-sdk/client-cloudwatch` | ^3.1102.0 | 3.1102.0 | prod |
| `@aws-sdk/client-cloudwatch-logs` | ^3.1113.0 | 3.1113.0 | prod |
| `@aws-sdk/client-cost-explorer` | ^3.1113.0 | 3.1113.0 | prod |
| `@aws-sdk/client-ec2` | ^3.1102.0 | 3.1102.0 | prod |
| `@aws-sdk/client-iam` | ^3.1102.0 | 3.1102.0 | prod |
| `@aws-sdk/client-rds` | ^3.1113.0 | 3.1113.0 | prod |
| `@aws-sdk/client-s3` | ^3.1113.0 | 3.1113.0 | prod |
| `@aws-sdk/client-secrets-manager` | ^3.1113.0 | 3.1113.0 | prod |
| `@aws-sdk/s3-request-presigner` | ^3.1146.0 | 3.1146.0 | prod |
| `@resvg/resvg-js` | ^2.6.2 | 2.6.2 | prod |
| `@xone-labs/aadharjs` | ^0.0.2 | 0.0.2 | prod |
| `bcryptjs` | ^2.4.3 | 2.4.3 | prod |
| `cors` | ^2.8.5 | 2.8.6 | prod |
| `docxtemplater` | ^3.69.3 | 3.69.3 | prod |
| `dotenv` | ^16.3.1 | 16.6.1 | prod |
| `exceljs` | ^4.4.0 | 4.4.0 | prod |
| `express` | ^4.18.2 | 4.22.2 | prod |
| `express-rate-limit` | ^8.5.2 | 8.5.2 | prod |
| `firebase-admin` | ^14.0.0 | 14.0.0 | prod |
| `groq-sdk` | ^1.2.1 | 1.2.1 | prod |
| `imapflow` | ^1.4.6 | 1.4.6 | prod |
| `ioredis` | ^5.11.1 | 5.11.1 | prod |
| `jsonwebtoken` | ^9.0.2 | 9.0.3 | prod |
| `mailparser` | ^3.9.14 | 3.9.14 | prod |
| `multer` | ^1.4.5-lts.1 | 1.4.5-lts.2 | prod |
| `node-cron` | ^4.2.1 | 4.2.1 | prod |
| `nodemailer` | ^6.10.0 | 6.10.1 | prod |
| `pdfkit` | ^0.20.2 | 0.20.2 | prod |
| `pg` | ^8.22.0 | 8.22.0 | prod |
| `pizzip` | ^3.2.0 | 3.2.0 | prod |
| `razorpay` | ^2.9.6 | 2.9.6 | prod |
| `sharp` | ^0.35.5 | 0.35.5 | prod |
| `socket.io` | ^4.8.3 | 4.8.3 | prod |
| `uuid` | ^9.0.1 | 9.0.1 | prod |
| `xlsx` | ^0.18.5 | 0.18.5 | prod |
| `nodemon` | ^3.0.2 | 3.1.14 | dev |

---

## 2. Client — Direct Dependencies

| Package | Range | Locked | Kind |
| --- | --- | --- | --- |
| `@fullcalendar/core` | ^6.1.21 | 6.1.21 | prod |
| `@fullcalendar/daygrid` | ^6.1.21 | 6.1.21 | prod |
| `@fullcalendar/interaction` | ^6.1.21 | 6.1.21 | prod |
| `@fullcalendar/list` | ^6.1.21 | 6.1.21 | prod |
| `@fullcalendar/react` | ^6.1.21 | 6.1.21 | prod |
| `@fullcalendar/timegrid` | ^6.1.21 | 6.1.21 | prod |
| `@hookform/resolvers` | ^5.4.0 | 5.4.0 | prod |
| `@phosphor-icons/react` | ^2.1.10 | 2.1.10 | prod |
| `@tanstack/react-query` | ^5.101.2 | 5.101.2 | prod |
| `@xyflow/react` | ^12.11.2 | 12.11.2 | prod |
| `axios` | ^1.20.0 | 1.20.0 | prod |
| `class-variance-authority` | ^0.7.1 | 0.7.1 | prod |
| `clsx` | ^2.1.1 | 2.1.1 | prod |
| `date-fns` | ^4.4.0 | 4.4.0 | prod |
| `exceljs` | ^4.4.0 | 4.4.0 | prod |
| `file-saver` | ^2.0.5 | 2.0.5 | prod |
| `html2canvas` | ^1.4.1 | 1.4.1 | prod |
| `jspdf` | ^4.2.1 | 4.2.1 | prod |
| `jszip` | ^3.10.1 | 3.10.1 | prod |
| `lucide-react` | ^1.24.0 | 1.24.0 | prod |
| `mammoth` | ^1.12.2 | 1.12.2 | prod |
| `mermaid` | ^11.16.0 | 11.16.0 | prod |
| `papaparse` | ^5.5.4 | 5.5.4 | prod |
| `qr-code-styling` | ^1.9.2 | 1.9.2 | prod |
| `qrcode.react` | ^4.2.0 | 4.2.0 | prod |
| `react` | ^19.2.6 | 19.2.7 | prod |
| `react-datepicker` | ^9.1.0 | 9.1.0 | prod |
| `react-day-picker` | ^10.0.1 | 10.0.1 | prod |
| `react-dom` | ^19.2.6 | 19.2.7 | prod |
| `react-hook-form` | ^7.81.0 | 7.81.0 | prod |
| `react-router-dom` | ^7.18.1 | 7.18.1 | prod |
| `recharts` | ^3.9.2 | 3.9.2 | prod |
| `socket.io-client` | ^4.8.3 | 4.8.3 | prod |
| `sonner` | ^2.0.7 | 2.0.7 | prod |
| `tailwind-merge` | ^3.6.0 | 3.6.0 | prod |
| `xlsx` | ^0.18.5 | 0.18.5 | prod |
| `xlsx-js-style` | ^1.2.0 | 1.2.0 | prod |
| `zod` | ^4.4.3 | 4.4.3 | prod |
| `zustand` | ^5.0.14 | 5.0.14 | prod |
| `@tailwindcss/vite` | ^4.3.2 | 4.3.2 | dev |
| `@vitejs/plugin-react` | ^4.7.0 | 4.7.0 | dev |
| `autoprefixer` | ^10.5.2 | 10.5.2 | dev |
| `postcss` | ^8.5.16 | 8.5.16 | dev |
| `tailwindcss` | ^4.3.2 | 4.3.2 | dev |
| `typescript` | ^7.0.2 | 7.0.2 | dev |
| `vite` | ^6.4.3 | 6.4.3 | dev |

---

## 3. Maintenance & Security Notes

- **`xlsx` 0.18.5** is the community (SheetJS CE) release; versions in this range have had published advisories. Confirm before production update. **Inferred** — flagged for review, not verified against a specific advisory database in this build.
- **`multer` 1.4.5-lts.2** is the LTS line; the 1.x series is older than the 2.x line. Track for upgrade.
- **AWS SDK v3** packages are numerous and version-skewed (3.1102.0 ↔ 3.1146.0); pinning/aligning them reduces drift.
- **`express` 4.22.2** — Express 5 exists upstream; no pressure to migrate found in code.
- **`bcryptjs`** is pure-JS (no native build), which suits the deployment model.
- Run `npm audit` in each of `backend/` and `client/` before release. Not run during this documentation build (**not executed**).
