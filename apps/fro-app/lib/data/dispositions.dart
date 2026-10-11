class Disposition {
  final String id;
  final String label;
  const Disposition(this.id, this.label);
}

class DispositionGroup {
  final String label;
  final List<Disposition> items;
  const DispositionGroup(this.label, this.items);
}

const notConnected = <Disposition>[
  Disposition('busy', 'Busy'),
  Disposition('ringing', 'Ringing'),
  Disposition('call_waiting', 'Call Waiting'),
  Disposition('switched_off', 'Switched Off'),
  Disposition('out_of_coverage', 'Out of Coverage'),
  Disposition('unreachable', 'Unreachable'),
  Disposition('wrong_number', 'Wrong Number'),
  Disposition('invalid', 'Invalid'),
  Disposition('rejected', 'Rejected'),
  Disposition('temporary_network_issue', 'Temporary Network Issue'),
  Disposition('voicemail', 'Voicemail'),
  Disposition('incoming_out', 'Incoming Out'),
  Disposition('busy_call_waiting', 'Busy / Call Waiting'),
  Disposition('ooc_unreachable_network', 'OOC / Unreachable / Network Issue'),
  Disposition('ringing_voicemail', 'Ringing / Voicemail'),
];

const connected = <Disposition>[
  Disposition('scheduled', 'Follow Up'),
  Disposition('callback', 'Callback'),
  Disposition('office_visit_scheduled', 'Office Visit Scheduled'),
  Disposition('program_visit_scheduled', 'Program Visit Scheduled'),
  Disposition('visit_donate', 'Visit & Donate'),
  Disposition('will_donate_online', 'Will Donate Online'),
  Disposition('promise_to_pay', 'Promise to Pay'),
  Disposition('payment_pending', 'Payment Pending'),
  Disposition('already_donated', 'Already Donated'),
  Disposition('email_sent', 'Email Sent'),
  Disposition('whatsapp_sent', 'WhatsApp Sent'),
  Disposition('csr_inquiry', 'CSR Inquiry'),
  Disposition('wants_80g_details', 'Wants 80G Details'),
  Disposition('wants_trust_documents', 'Wants Trust Documents'),
  Disposition('not_interested_now', 'Not Interested Now'),
  Disposition('not_interested', 'Not Interested'),
  Disposition('language_barrier', 'Language Barrier'),
  Disposition('transferred_senior', 'Transferred to Senior'),
  Disposition('query_complaint', 'Query/Complaint'),
  Disposition('receipt_request', 'Request Receipt/Info'),
  Disposition('dnd', 'DND (Do Not Disturb)'),
  Disposition('wrong_person', 'Wrong Person'),
  Disposition('call_disconnected', 'Call Disconnected'),
  Disposition('not_possible', 'Not Possible'),
  Disposition('office_program_visit', 'Office / Program Visit'),
  Disposition('promise_pay_wa_email', 'Promise to Pay / WA Sent / Email Sent'),
  Disposition('not_interested_np', 'Not Interested / Call Disconnected / NP'),
];

const allDispositions = <Disposition>[...notConnected, ...connected];

const connectedIds = {
  'scheduled', 'callback', 'office_visit_scheduled', 'program_visit_scheduled',
  'visit_donate', 'will_donate_online', 'promise_to_pay', 'payment_pending',
  'already_donated', 'email_sent', 'whatsapp_sent', 'csr_inquiry',
  'wants_80g_details', 'wants_trust_documents', 'not_interested_now',
  'not_interested', 'language_barrier', 'transferred_senior', 'query_complaint',
  'receipt_request', 'dnd', 'wrong_person', 'call_disconnected', 'not_possible',
  'office_program_visit', 'promise_pay_wa_email', 'not_interested_np',
};

const notConnectedIds = {
  'busy', 'ringing', 'call_waiting', 'switched_off', 'out_of_coverage',
  'unreachable', 'wrong_number', 'invalid', 'rejected',
  'temporary_network_issue', 'voicemail', 'incoming_out',
  'busy_call_waiting', 'ooc_unreachable_network', 'ringing_voicemail',
};

const othersId = 'others';
const othersDisp = Disposition('others', 'Others');

bool isConnected(String id) => connectedIds.contains(id);

const connectedGroups = <DispositionGroup>[
  DispositionGroup('Follow Up', [Disposition('scheduled', 'Follow Up')]),
  DispositionGroup('Callback', [Disposition('callback', 'Callback')]),
  DispositionGroup('Office / Program Visit', [
    Disposition('office_visit_scheduled', 'Office Visit'),
    Disposition('program_visit_scheduled', 'Program Visit'),
  ]),
  DispositionGroup('Promise to Pay / WA Sent / Email Sent', [
    Disposition('promise_to_pay', 'Promise to Pay'),
    Disposition('whatsapp_sent', 'WhatsApp Sent'),
    Disposition('email_sent', 'Email Sent'),
  ]),
  DispositionGroup('Not Interested / Call Disconnected / NP', [
    Disposition('not_interested', 'Not Interested'),
    Disposition('call_disconnected', 'Call Disconnected'),
    Disposition('not_possible', 'Not Possible'),
  ]),
  DispositionGroup('DND', [Disposition('dnd', 'DND (Do Not Disturb)')]),
  DispositionGroup('Others', [
    Disposition('visit_donate', 'Visit & Donate'),
    Disposition('will_donate_online', 'Will Donate Online'),
    Disposition('payment_pending', 'Payment Pending'),
    Disposition('already_donated', 'Already Donated'),
    Disposition('csr_inquiry', 'CSR Inquiry'),
    Disposition('wants_80g_details', 'Wants 80G Details'),
    Disposition('wants_trust_documents', 'Wants Trust Documents'),
    Disposition('not_interested_now', 'Not Interested Now'),
    Disposition('language_barrier', 'Language Barrier'),
    Disposition('transferred_senior', 'Transferred to Senior'),
    Disposition('query_complaint', 'Query/Complaint'),
    Disposition('receipt_request', 'Request Receipt/Info'),
    Disposition('wrong_person', 'Wrong Person'),
  ]),
];

const notConnectedGroups = <DispositionGroup>[
  DispositionGroup('Busy / Call Waiting', [
    Disposition('busy', 'Busy'),
    Disposition('call_waiting', 'Call Waiting'),
  ]),
  DispositionGroup('OOC / Unreachable / Network Issue', [
    Disposition('out_of_coverage', 'Out of Coverage'),
    Disposition('unreachable', 'Unreachable'),
    Disposition('temporary_network_issue', 'Temporary Network Issue'),
  ]),
  DispositionGroup('Ringing / Voicemail', [
    Disposition('ringing', 'Ringing'),
    Disposition('voicemail', 'Voicemail'),
  ]),
  DispositionGroup('Switched Off', [Disposition('switched_off', 'Switched Off')]),
  DispositionGroup('Others', [
    Disposition('wrong_number', 'Wrong Number'),
    Disposition('invalid', 'Invalid'),
    Disposition('rejected', 'Rejected'),
    Disposition('incoming_out', 'Incoming Out'),
  ]),
];

const connectedQuick = <Disposition>[
  Disposition('scheduled', 'Follow Up'),
  Disposition('callback', 'Callback'),
  Disposition('office_program_visit', 'Office / Program Visit'),
  Disposition('promise_pay_wa_email', 'Promise to Pay / WA Sent / Email Sent'),
  Disposition('not_interested_np', 'Not Interested / Call Disconnected / NP'),
  Disposition('dnd', 'DND'),
  othersDisp,
];

const notConnectedQuick = <Disposition>[
  Disposition('switched_off', 'Switched Off'),
  Disposition('busy_call_waiting', 'Busy / Call Waiting'),
  Disposition('ooc_unreachable_network', 'OOC / Unreachable / Network Issue'),
  Disposition('ringing_voicemail', 'Ringing / Voicemail'),
  othersDisp,
];

const scheduleDateTypes = {'scheduled', 'office_visit_scheduled', 'program_visit_scheduled'};
const scheduleTimeTypes = {'callback'};
const scheduleTypes = {...scheduleDateTypes, ...scheduleTimeTypes};

Disposition? findDisp(String id) {
  for (final d in allDispositions) {
    if (d.id == id) return d;
  }
  if (id == othersId) return othersDisp;
  return null;
}

String? pillColorName(String? status) {
  const map = {
    'pending': 'yellow', 'contacted': 'blue', 'scheduled': 'purple',
    'callback': 'purple', 'follow_up': 'purple', 'busy': 'gray', 'ringing': 'gray',
    'call_waiting': 'gray', 'unreachable': 'gray', 'switched_off': 'gray',
    'out_of_coverage': 'gray', 'wrong_number': 'gray', 'invalid_number': 'gray',
    'rejected': 'red', 'temporary_network_issue': 'gray', 'voicemail': 'gray',
    'incoming_out': 'gray',
    'lead_done': 'green', 'done': 'green', 'visit_donate': 'green',
    'will_donate_online': 'blue', 'donation_collected': 'green',
    'promise_to_pay': 'blue', 'payment_pending': 'yellow', 'already_donated': 'gray',
    'email_sent': 'blue', 'whatsapp_sent': 'blue', 'csr_inquiry': 'yellow',
    'wants_80g_details': 'blue', 'wants_trust_documents': 'blue',
    'not_interested': 'red', 'not_interested_now': 'red', 'language_barrier': 'gray',
    'transferred_senior': 'blue', 'query_complaint': 'yellow', 'receipt_request': 'blue',
    'dnd': 'red', 'wrong_person': 'gray', 'call_disconnected': 'gray',
    'payment_rejected': 'red', 'office_program_visit': 'purple',
    'promise_pay_wa_email': 'blue', 'not_interested_np': 'red',
    'busy_call_waiting': 'gray', 'ooc_unreachable_network': 'gray',
    'ringing_voicemail': 'gray', 'others': 'gray',
  };
  return map[status ?? ''];
}
