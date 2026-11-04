import { api } from '../../../../../api/auth';

// CRM-side assignment endpoints (not the OpenWA gateway): which NGO + FRO station
// owns each gateway session.
export interface OpenwaAssignment {
  id?: string;
  session_id: string;
  session_name?: string | null;
  ngo_id: string;
  ngo_name?: string | null;
  station?: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface OpenwaNgo {
  id: string;
  name: string;
  code?: string | null;
}

export interface OpenwaStation {
  ngo_id: string;
  station: string;
  worker_id?: string | null;
  worker_name?: string | null;
  login_id?: string | null;
}

/** One station a WhatsApp number serves. A number can serve several. */
export interface MyAssignmentStation {
  ngoId: string;
  ngoName?: string | null;
  station: string;
  /** True when this station is reachable only through a live temporary grant. */
  viaTemporaryAccess?: boolean;
}

export interface MyAssignment {
  sessionId: string;
  sessionName?: string | null;
  /** Every station this number serves. One session = one WhatsApp, so it appears once. */
  stations?: MyAssignmentStation[];
  /** First station, kept for callers that predate the grouped response. */
  station: string;
  ngoId: string;
  ngoName?: string | null;
  /** Station names joined for a tab label, e.g. "BFD-1 · BOD-1". */
  stationLabel?: string;
  /** True when every station on this number is a temporary grant. */
  viaTemporaryAccess?: boolean;
}

export const openwaAssignmentsApi = {
  meta: () =>
    api('/openwa-assignments/meta', { cache: 'no-store' }) as Promise<{ ngos: OpenwaNgo[]; stations: OpenwaStation[] }>,

  list: () =>
    api('/openwa-assignments', { cache: 'no-store' }) as Promise<{ assignments: OpenwaAssignment[] }>,

  assign: (payload: {
    sessionId: string;
    sessionName?: string;
    ngoId: string;
    station?: string;
  }) =>
    api('/openwa-assignments', {
      method: 'POST',
      body: JSON.stringify(payload),
    }) as Promise<{ assignments: OpenwaAssignment[] }>,

  // Replace the session's station set for one NGO (add / remove / move in one save).
  replace: (sessionId: string, payload: { sessionName?: string; ngoId: string; stations: string[] }) =>
    api(`/openwa-assignments/${encodeURIComponent(sessionId)}`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    }) as Promise<{ assignments: OpenwaAssignment[] }>,

  unassign: (sessionId: string) =>
    api(`/openwa-assignments/${encodeURIComponent(sessionId)}`, {
      method: 'DELETE',
    }) as Promise<{ success: boolean }>,

  mine: () =>
    api('/openwa-assignments/mine', { cache: 'no-store' }) as Promise<{ assignments: MyAssignment[] }>,
};
