const superAdminData = {
  "id": "super-admin",
  "title": "Super Admin Panel",
  "icon": "Shield",
  "roles": [
    "super_admin"
  ],
  "description": "Central oversight of all NGOs, workers, attendance, salary, incentives, data import, and system-wide configuration.",
  "architectureNotes": `The Super Admin Panel is the highest-privilege interface in the CRM, providing cross-NGO visibility and control.

Architecture:
- Permission model: Only users with role 'super_admin' can access. This role bypasses NGO-level data isolation and sees all records across all organizations.
- Dashboard data aggregation: KPI data (NGOs count, workers, attendance %, events, FRO activity, leads, collections) is aggregated server-side via the superAdminController. The backend queries across all NGO scopes and returns pre-computed metrics for the Recharts visualizations.
- Risk & Alert System: 14 alert types across attendance, targets, and collections. Each alert has a severity (high/medium/low) and is computed server-side by comparing actual vs expected metrics. The Super Admin sees a consolidated Risk & Alerts panel (expandable from 10 to 25 metrics).
- FRO Live Monitoring: Real-time FRO activity (online/on_call/break/offline) is tracked via server-side status updates. The dashboard auto-refreshes to show current FRO state across all stations.
- Data Import Pipeline: XLSX/CSV uploads are parsed server-side using the xlsx library. Each import batch is tracked with status (pending/processing/completed/failed) and error details.`,
  "diagrams": {
    "architecture": "graph TB\n    subgraph Frontend[React CRM SPA]\n        SA[Super Admin Panel]\n    end\n    subgraph Backend[Express.js API]\n        SAC[Super Admin Controller]\n        DC[Dashboard Controller]\n        IC[Import Controller]\n    end\n    subgraph DB[(PostgreSQL)]\n        NGOs[NGOs]\n        Workers[Workers]\n        Attendance[Attendance]\n        FROs[FRO Status]\n    end\n    subgraph External[External Services]\n        Vercel[Vercel Hosting]\n    end\n    SA --> SAC\n    SA --> DC\n    SA --> IC\n    SAC --> DB\n    DC --> DB\n    IC --> DB\n    Frontend --> Vercel",
    "flowchart": "graph TD\n    A[Super Admin Logs In] --> B{Dashboard}\n    B --> C[View KPIs]\n    B --> D[Manage NGOs]\n    B --> E[Manage Workers]\n    B --> F[View FRO Live Status]\n    B --> G[Risk & Alerts]\n    B --> H[Data Import]\n    E --> I[CRUD Operations]\n    H --> J[Upload XLSX/CSV]\n    J --> K[Batch Processing]\n    K --> L[Success/Failure Report]"
  },
  "keyFeatures": [
    "KPI dashboards with Recharts visualizations (bar, donut, line charts)",
    "Cross-NGO worker and attendance management",
    "3-stage ticket approval workflow (Worker / HR / Super Admin)",
    "Data import from XLSX/CSV with batch tracking",
    "Salary and incentive monthly summaries across all NGOs",
    "FRO live activity monitoring across all stations",
    "NGO, user, HR, holiday, notice, and achievement CRUD"
  ],
  "screens": [
    {
      "name": "Dashboard",
      "path": "/sa/dashboard",
      "description": "KPI metrics, charts, alerts, FRO live status",
      "features": [
        {
          "name": "Dashboard APIs",
          "description": "",
          "apis": [
            {
              "method": "GET",
              "path": "/api/dashboard/super-admin",
              "auth": "super_admin",
              "description": "Fetch dashboard KPIs: NGOs count, workers, attendance %, events, etc.",
              "curl": "curl -X GET \"https://ucs-crm-backend.vercel.app/api/dashboard/super-admin?period=30d\" -H \"Authorization: Bearer <token>\"",
              "requestBody": null,
              "responseBody": {
                "ngos": 3,
                "workers": 150,
                "attendanceRate": 87.5,
                "activeFROs": 12,
                "totalLeads": 450,
                "totalCollections": 125000
              }
            },
            {
              "method": "GET",
              "path": "/api/dashboard/super-admin-alerts",
              "auth": "super_admin",
              "description": "Get risk alerts across all categories (14 types).",
              "curl": "curl -X GET \"https://ucs-crm-backend.vercel.app/api/dashboard/super-admin-alerts\" -H \"Authorization: Bearer <token>\"",
              "requestBody": null,
              "responseBody": {
                "alerts": [
                  {
                    "type": "low_attendance",
                    "count": 5,
                    "severity": "high"
                  },
                  {
                    "type": "missed_target",
                    "count": 3,
                    "severity": "medium"
                  }
                ]
              }
            },
            {
              "method": "GET",
              "path": "/api/dashboard/fro-live",
              "auth": "super_admin",
              "description": "Get live FRO activity status (online/on_call/break/offline).",
              "curl": "curl -X GET \"https://ucs-crm-backend.vercel.app/api/dashboard/fro-live\" -H \"Authorization: Bearer <token>\"",
              "requestBody": null,
              "responseBody": {
                "fros": [
                  {
                    "id": 1,
                    "name": "FRO 1",
                    "status": "on_call",
                    "today_calls": 15,
                    "today_talk_seconds": 3600
                  }
                ]
              }
            }
          ],
          "businessRules": [],
          "workflow": []
        }
      ]
    },
    {
      "name": "Workers",
      "path": "/sa/employees",
      "description": "Manage all workers across NGOs",
      "features": [
        {
          "name": "Worker CRUD",
          "description": "",
          "apis": [
            {
              "method": "GET",
              "path": "/api/workers",
              "auth": "super_admin,admin,hr,accounts",
              "description": "List all workers with optional filters.",
              "curl": "curl -X GET \"https://ucs-crm-backend.vercel.app/api/workers?department=FRO&is_active=true\" -H \"Authorization: Bearer <token>\"",
              "requestBody": null,
              "responseBody": [
                {
                  "id": 1,
                  "name": "John",
                  "department": "FRO",
                  "phone": "9876543210",
                  "is_active": true
                }
              ]
            },
            {
              "method": "POST",
              "path": "/api/workers",
              "auth": "super_admin,admin,hr",
              "description": "Create a new worker.",
              "curl": "curl -X POST \"https://ucs-crm-backend.vercel.app/api/workers\" -H \"Content-Type: application/json\" -H \"Authorization: Bearer <token>\" -d '{\"name\":\"Jane\",\"email\":\"jane@test.com\",\"login_id\":\"jane2026\",\"password\":\"secret\",\"department\":\"FRO\"}'",
              "requestBody": {
                "name": "Jane",
                "email": "jane@test.com",
                "login_id": "jane2026",
                "password": "secret",
                "department": "FRO"
              },
              "responseBody": {
                "id": 2,
                "message": "Worker created"
              }
            },
            {
              "method": "PUT",
              "path": "/api/workers/:id",
              "auth": "super_admin,admin,hr",
              "description": "Update worker details.",
              "curl": "curl -X PUT \"https://ucs-crm-backend.vercel.app/api/workers/2\" -H \"Content-Type: application/json\" -H \"Authorization: Bearer <token>\" -d '{\"name\":\"Jane Updated\",\"phone\":\"9876543211\"}'",
              "requestBody": {
                "name": "Jane Updated",
                "phone": "9876543211"
              },
              "responseBody": {
                "message": "Worker updated"
              }
            },
            {
              "method": "DELETE",
              "path": "/api/workers/:id",
              "auth": "super_admin,admin,hr",
              "description": "Delete (deactivate) a worker.",
              "curl": "curl -X DELETE \"https://ucs-crm-backend.vercel.app/api/workers/2\" -H \"Authorization: Bearer <token>\"",
              "requestBody": null,
              "responseBody": {
                "message": "Worker removed"
              }
            }
          ],
          "businessRules": [],
          "workflow": []
        }
      ]
    },
    {
      "name": "Users",
      "path": "/sa/users",
      "description": "Panel user management",
      "features": [
        {
          "name": "User Management",
          "description": "",
          "apis": [
            {
              "method": "GET",
              "path": "/api/users",
              "auth": "super_admin,admin,hr",
              "description": "List all panel users.",
              "curl": "curl -X GET \"https://ucs-crm-backend.vercel.app/api/users\" -H \"Authorization: Bearer <token>\"",
              "requestBody": null,
              "responseBody": [
                {
                  "id": 1,
                  "name": "Admin",
                  "email": "admin@ngo.com",
                  "role": "admin"
                }
              ]
            },
            {
              "method": "POST",
              "path": "/api/users",
              "auth": "super_admin,admin,hr",
              "description": "Create panel user.",
              "curl": "curl -X POST \"https://ucs-crm-backend.vercel.app/api/users\" -H \"Content-Type: application/json\" -H \"Authorization: Bearer <token>\" -d '{\"name\":\"HR User\",\"email\":\"hr@ngo.com\",\"password\":\"secret\",\"role\":\"hr\",\"ngo_id\":1}'",
              "requestBody": {
                "name": "HR User",
                "email": "hr@ngo.com",
                "password": "secret",
                "role": "hr",
                "ngo_id": 1
              },
              "responseBody": {
                "id": 5,
                "message": "User created"
              }
            }
          ],
          "businessRules": [],
          "workflow": []
        }
      ]
    }
  ]
};

export default superAdminData;
