# Workflow — Attendance Lifecycle

> **Document ID:** 04-Module-Workflows/WF-ATTENDANCE
> **Status:** Partially verified (endpoints + helpers verified; exact geo validation read at util level)
> **Generated:** 2026-10-13
> **Related:** HR panel doc · `backend/src/controllers/attendanceController.js`, `qrController.js`, `utils/geo.js`

## 1. Purpose
Workers punch in/out (or use selfie punch), HR manages the records, and corrections flow through verify → approve.

## 2. Flow

![wf-attendance-1](../diagrams/wf-attendance-1.png "Flowchart — 04-Module-Workflows/WF-ATTENDANCE.md #1")
<details><summary>Show diagram source (Mermaid)</summary>

```mermaid
flowchart LR
    A[Worker] --> B{punch mode}
    B -->|QR + geo| C[validateQRAndLocation]
    B -->|manual bulk| D[POST /api/attendance]
    B -->|selfie| E[selfiePunch / hrSelfiePunch]
    C --> E
    E --> F[attendance table - today]
    F --> G[today-status / today-all]
    G --> H[Worker raises correction]
    H --> I[attendance_corrections pending]
    I --> J[HR verify]
    J --> K[Super admin approve/reject]
    K --> L[attendance history / reports]
    F --> M[Salary present-days export]
```

</details>


## 3. Key endpoints

| Action | Endpoint | Notes |
| --- | --- | --- |
| Punch in | `POST /api/attendance/punch-in` | `authenticate` |
| Punch out | `POST /api/attendance/punch-out` | `authenticate` |
| Selfie punch | `POST /api/attendance/selfie-punch` | `authenticate` |
| QR validate | `POST /api/qr/validate` | `authenticateWorker` + geo |
| Corrections | `POST /api/attendance-corrections` | raises ticket |
| Verify correction | `PUT /api/attendance-corrections/:id/verify` | HR/admin |
| Approve correction | `PUT /api/attendance-corrections/:id/approve` | super_admin |
| Present days | `GET /api/salary/present-days` | `authenticateSalary` |

## 4. Business rules

- Geo/QR validation happens server-side in `geo.js`/`qrController.js` (verified util level).
- Attendance feeds `salary present-days` export and `attendanceReportDocx.js` (payer export downloadable from salary route).
- Corrections are immutable after approval (state machine in `attendanceCorrectionModel`).

## 5. Related workflows
- Payroll: `WF-PAYROLL.md`
- FRO time: `WF-FRO-TIME.md`