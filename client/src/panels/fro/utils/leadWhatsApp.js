import { api } from '../../../api/auth';
import { requestLeadWhatsAppChoice } from './leadWhatsAppPickerStore';

// Digits in the form the WhatsApp gateway resolves: international, no plus, India assumed
// for a bare 10-digit CRM number. Mirrors how the dashboard's new-chat panel reads a number.
export function whatsappDigits(mobile) {
  let digits = String(mobile || '').replace(/\D/g, '');
  if (!digits) return '';
  if (digits.startsWith('00')) digits = digits.slice(2);
  if (digits.length === 10) digits = `91${digits}`;
  else if (digits.length === 11 && digits.startsWith('0')) digits = `91${digits.slice(1)}`;
  return digits;
}

// The stations one assignment covers. /openwa-assignments/mine groups a number that serves
// several stations into one entry (`stations`); older responses carried a single `station`.
function stationsOf(assignment) {
  return assignment?.stations?.length
    ? assignment.stations
    : [{ ngoId: assignment?.ngoId, ngoName: assignment?.ngoName, station: assignment?.station }];
}

// The session this FRO may open for a lead: the one assigned to the lead's station, preferring
// the exact (station, NGO) pair. Temporary grants are included by /openwa-assignments/mine, so a
// lead on a station the FRO only holds temporarily still opens in that station's WhatsApp.
export async function findLeadWhatsApp({ station, ngoId }) {
  if (!station) return null;
  try {
    const data = await api('/openwa-assignments/mine');
    const list = data?.assignments || [];
    const exact = list.find(assignment =>
      stationsOf(assignment).some(row => (!ngoId || row.ngoId === ngoId) && row.station === station),
    );
    if (exact) {
      const pair = stationsOf(exact).find(row => (!ngoId || row.ngoId === ngoId) && row.station === station);
      return { ...exact, station: pair.station, ngoId: pair.ngoId, ngoName: pair.ngoName ?? exact.ngoName };
    }
    const byStation = list.find(assignment =>
      stationsOf(assignment).some(row => row.station === station),
    );
    if (!byStation) return null;
    const pair = stationsOf(byStation).find(row => row.station === station);
    return { ...byStation, station: pair.station, ngoId: pair.ngoId, ngoName: pair.ngoName ?? byStation.ngoName };
  } catch {
    return null;
  }
}

// Ask the backend which number to use. It ranks the FRO's numbers for this lead from each one's
// recent history with the donor: a reply or a delivered receipt means "reachable", a send stuck
// undelivered means "probably blocked". Returns null when the lookup is unavailable, so the
// caller can fall back to findLeadWhatsApp.
export async function routeLeadWhatsApp({ station, ngoId, mobile }) {
  if (!station) return null;
  const digits = whatsappDigits(mobile);
  if (!digits) return null;
  const params = new URLSearchParams({ station, mobile: digits });
  if (ngoId) params.set('ngoId', ngoId);
  try {
    // A click should not hang on a slow gateway: the caller falls back to the first match.
    return await api(`/openwa-assignments/lead-route?${params.toString()}`, {
      cache: 'no-store',
      timeout: 8000,
    });
  } catch {
    return null;
  }
}

// Every number this FRO may use for the lead, with the routing hints the picker shows.
// The numbers come from the CRM assignments even when the gateway cannot be read, so the
// picker still offers a choice during a gateway problem.
export async function loadLeadWhatsAppOptions({ station, ngoId, mobile }) {
  if (!station) return { options: [], allBlocked: false, checked: 0 };
  const digits = whatsappDigits(mobile);
  if (!digits) return { options: [], allBlocked: false, checked: 0 };

  let route = await routeLeadWhatsApp({ station, ngoId, mobile });
  if (!route || !Array.isArray(route.candidates) || route.candidates.length === 0) {
    // Routing is unavailable (older backend, gateway down): fall back to the assignment list.
    const assignment = await findLeadWhatsApp({ station, ngoId });
    if (!assignment) return { options: [], allBlocked: false, checked: 0 };
    return {
      options: [
        {
          sessionId: assignment.sessionId,
          sessionName: assignment.sessionName,
          station: assignment.station || station,
          ngoId: assignment.ngoId || ngoId || null,
          phone: null,
          status: null,
          state: 'unknown',
          recommended: true,
        },
      ],
      allBlocked: false,
      checked: 1,
    };
  }

  return {
    options: route.candidates,
    allBlocked: Boolean(route.allBlocked),
    checked: Number(route.checked) || route.candidates.length,
  };
}

// Open My Leads' WhatsApp action. With one assigned number it opens it; with several it asks
// the FRO which number to use, showing what each one's history with this donor says.
export async function openLeadWhatsApp(
  navigate,
  { station, ngoId, mobile, donorName },
  onError,
  onNotice,
) {
  if (!station) {
    onError?.("No WhatsApp is assigned to this lead's station.");
    return false;
  }
  const digits = whatsappDigits(mobile);
  if (!digits) {
    onError?.('This lead has no phone number.');
    return false;
  }

  const { options, allBlocked } = await loadLeadWhatsAppOptions({ station, ngoId, mobile });
  if (options.length === 0) {
    onError?.("No WhatsApp is assigned to this lead's station.");
    return false;
  }

  let chosen = options[0];
  if (options.length > 1) {
    chosen = await requestLeadWhatsAppChoice({
      donorName: donorName || 'this donor',
      mobile: digits,
      options,
      allBlocked,
    });
    // The user closed the picker: nothing to open.
    if (!chosen) return false;
  }

  if (allBlocked) {
    onNotice?.(
      `Every assigned number looks blocked for this donor. Opened ${chosen.sessionName || 'the chosen number'} — check delivery after sending.`,
    );
  }

  const params = new URLSearchParams({
    session: chosen.sessionId,
    station: chosen.station || station,
    chat: digits,
  });
  navigate(`/fro/station-whatsapp?${params.toString()}`);
  return true;
}
