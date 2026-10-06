// Disposition vocabulary shared by the NGO admin surfaces.
//
// WHY a lib. The station-donor list (StationManagement.jsx) and the dashboard
// station popup (Dashboard.jsx) both render a donor's `fro_assignments.status`.
// That status is a raw snake_case key, so each surface needs a human label and a
// colour. When the two surfaces each carried their own copy they could drift:
// a status coloured green on the dashboard could render as raw snake_case in the
// station list. One source, both import it.
//
// GROUP MEMBERSHIP IS THE RENDERING CONTRACT. `DISPOSITION_GROUPS` drives the
// status pills and the dashboard's disposition bar, so every status a donor can
// actually hold should land in exactly one group. A status missing from all four
// groups still renders (the group lookup falls back to grey "Other") but stops
// counting towards any group total on the dashboard — check `staged_statuses`
// below if the dashboard bar and the modal pill ever disagree.

export const DISPOSITION_LABELS = {
  pending: 'Pending', contacted: 'Contacted', follow_up: 'Follow Up', scheduled: 'Scheduled',
  busy: 'Busy', ringing: 'Ringing', call_waiting: 'Call Waiting', unreachable: 'Unreachable',
  switched_off: 'Switched Off', out_of_coverage: 'Out of Coverage', wrong_number: 'Wrong Number',
  invalid_number: 'Invalid', rejected: 'Rejected', temporary_network_issue: 'Temporary Network Issue', voicemail: 'Voicemail',
  lead_done: 'Lead Done', done: 'Done', visit_donate: 'Visit & Donate', will_donate_online: 'Will Donate Online',
  promise_to_pay: 'Promise to Pay', payment_pending: 'Payment Pending', already_donated: 'Already Donated',
  email_sent: 'Email Sent', whatsapp_sent: 'WhatsApp Sent', csr_inquiry: 'CSR Inquiry',
  wants_80g_details: 'Wants 80G Details', wants_trust_documents: 'Wants Trust Documents',
  not_interested: 'Not Interested', not_interested_now: 'Not Interested Now', dnd: 'DND',
  wrong_person: 'Wrong Person', call_disconnected: 'Call Disconnected',
  language_barrier: 'Language Barrier', transferred_senior: 'Transferred to Senior',
  query_complaint: 'Query/Complaint', receipt_request: 'Receipt Request',
  donation_collected: 'Lead Done',
  office_program_visit: 'Office / Program Visit',
  promise_pay_wa_email: 'Promise To Pay / WA / Email',
  not_interested_np: 'Not Interested / Disconnected / NP',
  busy_call_waiting: 'Busy / Call Waiting',
  ooc_unreachable_network: 'OOC / Unreachable / Network',
  ringing_voicemail: 'Ringing / Voicemail',
  resolved_suspense: 'Resolved Suspense', others: 'Others',
  overdue_followup: 'Follow-Up Overdue', overdue_callback: 'Callback Overdue',
};

export const DISPOSITION_GROUPS = [
  { label: 'Converted', color: '#16a34a', bg: '#f0fdf4', statuses: ['donation_collected', 'promise_to_pay', 'lead_done', 'done', 'visit_donate', 'will_donate_online', 'payment_pending', 'already_donated', 'promise_pay_wa_email'] },
  { label: 'In Progress', color: '#d97706', bg: '#fffbeb', statuses: ['pending', 'contacted', 'follow_up', 'scheduled', 'email_sent', 'whatsapp_sent', 'csr_inquiry', 'wants_80g_details', 'wants_trust_documents', 'office_program_visit'] },
  { label: 'Negative', color: '#dc2626', bg: '#fef2f2', statuses: ['not_interested', 'not_interested_now', 'dnd', 'wrong_person', 'call_disconnected', 'rejected', 'busy', 'ringing', 'call_waiting', 'unreachable', 'switched_off', 'out_of_coverage', 'wrong_number', 'invalid_number', 'temporary_network_issue', 'voicemail', 'language_barrier', 'busy_call_waiting', 'ooc_unreachable_network', 'ringing_voicemail', 'not_interested_np'] },
  { label: 'Other', color: '#5B6B4E', bg: '#f0f2ee', statuses: ['transferred_senior', 'query_complaint', 'receipt_request'] },
];

// Group lookup by raw status key. Falls back to null, which every caller already
// renders as grey — so an unmapped status degrades to "unrecognised", never to a
// wrong group colour.
export const dispositionGroupOf = (status) =>
  DISPOSITION_GROUPS.find(g => g.statuses.includes(status)) || null;

export const dispositionLabelOf = (status) => DISPOSITION_LABELS[status] || status || '—';
