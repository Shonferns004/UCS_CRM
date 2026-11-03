import { api } from '../../../api/auth';

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

// The session this FRO may open for a lead: the one assigned to the lead's station, preferring
// the exact (station, NGO) pair. Temporary grants are included by /openwa-assignments/mine, so a
// lead on a station the FRO only holds temporarily still opens in that station's WhatsApp.
export async function findLeadWhatsApp({ station, ngoId }) {
  if (!station) return null;
  try {
    const data = await api('/openwa-assignments/mine');
    const list = data?.assignments || [];
    return (
      (ngoId && list.find(a => a.ngoId === ngoId && a.station === station)) ||
      list.find(a => a.station === station) ||
      null
    );
  } catch {
    return null;
  }
}

// Open My Leads' WhatsApp action: the station tab for this lead, with the number's chat opened.
export async function openLeadWhatsApp(navigate, { station, ngoId, mobile }, onError) {
  const assignment = await findLeadWhatsApp({ station, ngoId });
  if (!assignment) {
    onError?.("No WhatsApp is assigned to this lead's station.");
    return false;
  }
  const digits = whatsappDigits(mobile);
  if (!digits) {
    onError?.('This lead has no phone number.');
    return false;
  }
  const params = new URLSearchParams({
    session: assignment.sessionId,
    station: assignment.station,
    chat: digits,
  });
  navigate(`/fro/station-whatsapp?${params.toString()}`);
  return true;
}
