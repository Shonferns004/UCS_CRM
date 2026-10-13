# Plan: Remove CRM Agents + FRO Agent Attribution

**Goal:** remove the "CRM login Agents" feature (Agent N logins, agent seats, station→agent assignment) and all FRO agent attribution/idle logic, restoring pre-Oct-5 (pre-`3b6ea304`) behavior. Code **and** DB schema.

**Decisions (confirmed with user):**
- Keep WhatsApp agents (`agentTransfer*`, `bulkAgentImport*`, `authMiddleware`/`store.jsx` `'agent'` role alias) — separate feature.
- Keep `receipts.agent_name` column (pre-existing "FRO credited on receipt" concept).
- Keep the ngo-admin "Not in Use" stations tab, but restore its pre-agent definition (`fro_worker_id IS NULL` instead of `crm_agent_id IS NULL`).
- Keep `fro_donor_logs.operator_id` (+ migration 182 + `ensureFroDonorLogOperatorSchema.js`) — it's a generic work-as FK fix; only strip its `crm_agents` name-lookup in `operatorNameService.js`.
- Before dropping `crm_agents`: rewrite historical `receipts.agent_name` values (`'Agent N'`) to the real worker name; delete `worker_aliases` rows `LIKE 'Agent %'`.
- Delete the vendored `whtsapp/server/` folder (duplicate of backend); leave the rest of `whtsapp/` untouched.
- Uncommitted WIP (attendance/salary/Sunday-rules changes) stays untouched.
- Do NOT git-revert the ~381 interleaved commits — this is a forward removal.

---

## Phase 1 — Backend: CRM agent feature

### Delete files
- `backend/src/models/crmAgentModel.js`
- `backend/src/controllers/crmAgentsController.js`
- `backend/src/services/stationAgentOfRecord.js`
- `backend/src/bootstrap/ensureStationAgentOfRecordSchema.js`
- `backend/src/bootstrap/ensureFroTimeSessionsAgentSchema.js`
- `backend/src/migrations/181_fro_station_agent_of_record.sql`

### Edit files
| File | Change |
|---|---|
| `backend/src/index.js` | Remove imports + boot awaits for `ensureStationAgentOfRecordSchema` (L125, L1209) and `ensureFroTimeSessionsAgentSchema` (L111, L1193). **Keep** L64-65/L297-298 (WhatsApp agentTransfer/bulkAgentImport). |
| `backend/src/routes/ngoAdminRoutes.js` | Remove crmAgentsController imports (L5-14) and the 11 `/agents*` endpoints (L242-257). |
| `backend/src/routes/authRoutes.js` | Remove `getMyCrmAgentContext` import (L3) and `/agent-context` route (L22-23). |
| `backend/src/controllers/authController.js` | Delete `rejectIfCoveredFro` + its 4 call sites (L26-66, 630, 754, 805, 878) — FROs can log in as themselves again. Delete `issueAgentSession` (L83-228). Delete agent branch in `unifiedLogin` (L575-611), agent branch in `logout` (L425-451), agent impersonation identity override (L982-985), `agent_user_id`/`agent_label` token arms (L1210, L1233), agent cover-refresh in heartbeat + `releaseWorkAs` (L1515-1551), agent changePassword branch (L1592-1610). Restore `getFroWorkersForImpersonation` (L1255-1290) to the pre-agent query: all `department='fro'` workers, no `crm_agents` LATERAL, no `covered_by_agent`/`agent_label`/`display_name`, `ORDER BY name`. Drop `releaseConflictingCovers` call at L1133 if (verify with grep) it is only used by the agent path. |
| `backend/src/controllers/ngoAdminController.js` | Remove `dayTotalsForAgents`/`agentTotalKey` from import (L32). `getStationActivityByNgo` (L94-180): drop `crm_agent_id` select, restore inactive definition (`fro_worker_id IS NULL` / no live FRO). `getFroWorkers` (L630-700): drop `crm_agents` subquery, `agentLabelMap`, `fro_name`/`agent_label`/`display_name`, and the filter-to-agent-covered — **must return all FROs again** (used by Attendance.jsx, BankAudit.jsx). `getStations` (L1877-1961): drop `stationAgentLabelMap`/`agentLabelFor`/`crm_agent_id`/`fro_name`/`stationAgentIds`. `updateStationNgos` (L2187, 2229): drop `requestedAgentId`/`resolvedAgentId`/`crm_agent_id` upsert. `getTLDashboard` (L6403-6611): see Phase 2 idle flip. |
| `backend/src/controllers/accountsController.js` | `getFroWorkersList` (L5270-5307): drop `crm_agents` join/`agentLabelMap`/`agent_label`/`throw agentErr` → restore plain workers query. Keep `agentStamp`/`resolveOperatorName` fallback (pre-existing). |
| `backend/src/controllers/froController.js` | Remove `getAgentById` import (L194). Remove `agent: agentCtx` from all `splitWorkerContext` destructures (L1074, 2443, 3880, 3921, 5216, 5716, 5730, 5879, 5938, 6016). Remove `agentId:` from `computeTimeStatus`/`applyTimeEvent`/`transitionTimeState` calls (L1230, 3889, 5664, 5674, 5947, 5986, 6075). Delete agent heartbeat 401/validation block + `refreshCoverExpiry` (L5216-5281). Revert `getMyDisposedLeads` join (L6377-6390) to pre-`48011d69` form. **Keep** all `receipts.agent_name` code (pre-existing). |
| `backend/src/utils/workAs.js` | `liveRowWorkerId({ paintedId, operatorId })` — drop `isAgent` param (L156-169). Delete `isAgentSession` (L172-181) and the `agent` field in the returned context (L201-207). Update `backend/src/utils/workAs.test.js`: delete the "Login agents" section (L138-210) + import (L12). |
| `backend/src/models/workAsSessionModel.js` | Delete the agent heartbeat branch of `refreshCoverExpiry` (L107-146). Delete `releaseConflictingCovers` (L148-175) **iff** grep confirms no remaining non-agent caller. |
| `backend/src/services/operatorNameService.js` | Remove the `crm_agents` source (L82), `agentDisplayNames` (L28-42) and the `agent` branch in `mergeOperatorNameRows`. **Keep** `resolveOperatorNames`/`resolveOperatorName`/`resolveCreditTarget` (used by bankAudit/accounts/credit/autoMatch). Update `operatorNameService.test.js` (remove agent rows at L20/31 and agent tests L44-69). |
| `backend/src/services/froSessionEndIdle.test.js` | Delete "an agent session does not duplicate one id into two" (L70+). |
| `backend/src/controllers/froControllerScope.test.js` | Strip `agentCtx` assertions (L30, L51-58) or delete the file if that's all it covers. |
| `docs/security/BACKEND-SECURITY.md` (L320), `docs/security/DATABASE-SECURITY.md` (L248) | Remove citations of `crmAgentModel.js` / `DEFAULT_AGENT_PASSWORD`. |

### Delete test files
- `backend/src/services/froAgentAttribution.test.js`
- `backend/src/services/froCoverIdleParity.test.js`

## Phase 2 — Backend: FRO agent attribution / idle

| File | Change |
|---|---|
| `backend/src/services/froTimeSessions.js` | Remove `agentId` option in `transition` (L44) and the open-interval re-stamp block (~L50-68). Delete `sessionsForActor`. `dayTotalsForWorkers`: drop `agentFor` param (L326, L349). Delete `agentTotalKey` (L356) and `dayTotalsForAgents` (L379-410). Remove `agent_id IS NULL` predicates from `getSessionsForDay/Date/InRange`. |
| `backend/src/services/froTimeStatus.js` | Drop `agentId` threading in `computeTimeStatus`; revert `useFallback` to `getSessionsForDate()` without agent args. |
| `backend/src/services/froTimeReport.js` | Drop `agentId` params (L130, L218); remove `agent_id IS NULL` from `getFroIdleTotalsForRange` (~283), `getWorkerDayTotals` (~407), `getStationDayTotals` (~455). **Keep** the late-login/day clamp from `02903c9d` (`froLateLoginClamp.test.js`). |
| `backend/src/services/froCounterDay.js` | `ledgerIdleForDate` (L3-31): remove agent-aware fallback, restore plain query. |
| `backend/src/controllers/froReportController.js` | Remove `agentId:` args (L66-67, 77-78) and `agent_id` echo in JSON. |
| `backend/src/controllers/ngoAdminController.js` (`getTLDashboard`) | Delete `coveringAgentByTarget` + `dayTotalsForAgents` call (L6403-6417), `coveringIdle`/`idleAttributedTo` (L6515-6517). Restore `today_idle_seconds: idleDisplaySeconds` (L6608); delete `idle_attributed_to` (L6611). Fixes the live bug where manually-covered FROs show 0 idle. |
| `backend/src/controllers/dashboardController.js` | Revert the agent-era covered-FRO exclusion in `getSuperAdminAlerts` alert #11 (~L1317-1340). **Keep** alert #15 (pre-existing cover-freeze). |
| `backend/src/models/froDonorLogModel.js` | Remove agent-label resolution bits added by `c47002ad` in `getAllWorkerNameResolvers`/`receiptMatchesAgentName` context — keep `operator_id` matching (generic). Keep `mergeAttributedReceipts`/`buildAgentNameMatches` in `froCollectionMatch.js` (serves pre-existing `receipts.agent_name` grouping; works with real worker names after the Phase 4 rewrite). Verify `froCollectionMatch.test.js` after the rewrite. |

## Phase 3 — Frontend

| File | Change |
|---|---|
| `client/src/panels/ngo-admin/pages/Agents.jsx` | **Delete** (553 lines). |
| `client/src/panels/ngo-admin/NgoAdminPanel.jsx` | Remove lazy import (L23), nav item `agents` (L30), agents SVG icon (L47), route (L534). |
| `client/src/panels/ngo-admin/api/auth.js` | Delete the 9 agent API functions (L54-93). |
| `client/src/panels/ngo-admin/pages/Dashboard.jsx` | Remove `listCrmAgents` import (L4), `agentOptionLabel` (L224-234), `StationAgentMenu` (L237-280), assign-agent state (L1000-1006), effect + `handleAssignStationAgent` (L1571-1606), assign-row UI (L2349-2396), `idle_attributed_to` tooltip (L2475-2493). **Keep** the `inactive_stations` tab (restore backend definition instead). |
| `client/src/panels/ngo-admin/pages/StationManagement.jsx` | Remove `listCrmAgents` (L3), `agentOptionLabel`+`AgentSelect` (L957-1030), agents state/roster/options/handler (L2047, 2180-2186, 2207-2234, 2347-2360), header `FRO Name / Agent` → `FRO Name` (L2586), `seatAgentId`/`seatAgent`/`coveredFro` cells → plain `s.fro_worker_name` (L2601-2640). |
| `client/src/panels/fro/FROPanel.jsx` | Remove `covered_by_agent` AGENT badge (L1109), `pendingTarget.covered_by_agent` warning (L1168-1170), 409 `takeover_allowed` recovery + `opts.takeover` (L693-705). `labelOf` (L678-681) can stay. |
| `client/src/api/auth.js` | Remove `takeover: options?.takeover === true` (L144). |
| `client/src/panels/super-admin/embedPanels.js` | Remove `{ path:'agents', label:'Agents' }` (L18). |
| `client/src/panels/super-admin/SuperAdminPanel.jsx` | Trim agent comments (L380-381). |
| `client/src/index.css` | Remove `.stations-assign-row:focus-visible` rule. |
| `client/src/panels/ngo-admin/pages/Receipts.jsx` (L320), `ReceiptHistory.jsx` (L415) | Optional: trim "agent" comments. |

## Phase 4 — DB (run AFTER code deploy)

New migration file `backend/src/migrations/185_drop_crm_agents.sql` (manual-run convention, like the rest):

```sql
-- 1. Historical name rewrite (BEFORE dropping crm_agents)
UPDATE receipts r
   SET agent_name = w.name
  FROM crm_agents a
  JOIN workers w ON w.id = a.worker_id
 WHERE r.agent_name = a.label
   AND w.name IS NOT NULL;

DELETE FROM worker_aliases WHERE alias_name LIKE 'Agent %';

-- 2. Harvest agent uuids, then clear work-as residue
CREATE TEMP TABLE _agent_uuids AS
  SELECT id::text FROM crm_agents
  UNION SELECT id::text FROM crm_agent_sequence;  -- adjust to actual key shape

DELETE FROM work_as_sessions WHERE operator_user_id = ANY(ARRAY(SELECT id FROM _agent_uuids));
UPDATE fro_live_status
   SET work_as_operator_id = NULL, work_as_operator_name = NULL
 WHERE work_as_operator_id = ANY(ARRAY(SELECT id FROM _agent_uuids));

-- 3. Station agent-of-record
ALTER TABLE fro_station_assignments DROP CONSTRAINT IF EXISTS fro_station_assignments_crm_agent_id_fkey;
DROP INDEX IF EXISTS idx_fro_station_assignments_crm_agent_id;
ALTER TABLE fro_station_assignments DROP COLUMN IF EXISTS crm_agent_id;

-- 4. Time-ledger agent stamp (recreate the owner index lost with the partial one)
DROP INDEX IF EXISTS idx_fro_time_sessions_agent;
ALTER TABLE fro_time_sessions DROP COLUMN IF EXISTS agent_id;
CREATE INDEX IF NOT EXISTS idx_fro_time_sessions_worker_owner
  ON fro_time_sessions (worker_id, started_at);

-- 5. Feature tables last
DROP TABLE IF EXISTS crm_agents CASCADE;
DROP TABLE IF EXISTS crm_agent_sequence CASCADE;
```

**Keep:** `fro_donor_logs.operator_id`, migration `182_fro_donor_logs_operator_id.sql`, `ensureFroDonorLogOperatorSchema.js`.

## Phase 5 — Vendored folder

- Delete `whtsapp/server/` entirely (user request). Leave `whtsapp/frontend/` and everything else.

## Phase 6 — Verify

1. `rg -n "crm_agent|crmAgents|agent_user_id|agent_label|agentCtx|dayTotalsForAgents|idle_attributed_to|stationAgentOfRecord|agent_id" backend/src client/src` → expect zero agent-feature hits (WhatsApp `agent_id`/`assigned_agent_id` and `receipts.agent_name` are allowed).
2. Backend tests: `node --test "src/**/*.test.js"` (from `backend/`) — deleted suites gone; `froLateLoginClamp`, `froCounterDay`, cover/workAs non-agent tests must pass.
3. Client build: `npm run build` in `client/` (or repo lint/typecheck script).
4. Manual smoke (staging): agent login returns 404; `/ngo-admin/fro-workers` returns all FROs; Stations page shows plain FRO names; "Not in Use" = stations with no FRO; idle board shows real idle for manually-covered FROs; FRO self-login works; dispositions under work-as still save; bank-audit/credit name resolution works.

## Execution order & risks

1. Phases 1–3 (code) → 2. tests/build → 3. commit → 4. deploy → 5. Phase 4 DDL → 6. Phase 5 folder delete → 7. verify.
- **Boot before DDL is safe** (bootstrap files deleted), but **DDL before code deploy is NOT** (`getFroWorkers`/`getFroWorkersList` throw on missing `crm_agents`).
- Historical idle/day totals for Oct 5–13 re-attribute from agents to their FROs — numbers on those days will shift (expected).
- Removing `rejectIfCoveredFro` restores concurrent FRO login (two sessions on one panel) — pre-agent behavior.
- WIP attendance/salary files in the working tree are not part of this change; stage only agent-removal files when committing.
