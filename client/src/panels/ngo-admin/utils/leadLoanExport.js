import * as XLSX from 'xlsx';

// ─── Lead-loan Excel export ──────────────────────────────────────────────────
// Shared by the single and bulk lend modals. The admin downloads this before
// confirming a loan to verify exactly which donors (name + mobile) from which
// station are about to be handed to the receiving FRO.

const BUCKET_LABEL = {
  follow_up: 'Follow up',
  promise: 'Promise',
  callback: 'Callback',
};

const DUE_FMT = new Intl.DateTimeFormat('en-IN', {
  timeZone: 'Asia/Kolkata',
  day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
});

function dueLabel(row) {
  const value = row.scheduled_at || row.next_follow_up;
  if (!value) return '';
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? '' : `${DUE_FMT.format(d)} IST`;
}

export function exportLoanLeadsXlsx(rows, filename) {
  const data = (rows || []).map(r => ({
    Station: r.station || '',
    'Donor Name': r.donor_name || '',
    'Mobile Number': r.mobile_number || '',
    Category: BUCKET_LABEL[r.bucket] || r.bucket || '',
    Status: r.status || '',
    'Due At': dueLabel(r),
    Overdue: r.is_overdue ? 'Yes' : 'No',
  }));

  const ws = XLSX.utils.json_to_sheet(data);
  ws['!cols'] = [
    { wch: 12 }, { wch: 30 }, { wch: 16 }, { wch: 12 },
    { wch: 18 }, { wch: 22 }, { wch: 9 },
  ];
  // Mobile numbers must stay text so Excel never turns them into 9.87E+09.
  for (let i = 0; i < data.length; i += 1) {
    const cell = ws[XLSX.utils.encode_cell({ r: i + 1, c: 2 })];
    if (cell && cell.v != null) { cell.t = 's'; cell.v = String(cell.v); }
  }

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Leads to lend');
  const stamp = new Date().toISOString().slice(0, 10);
  XLSX.writeFile(wb, filename || `leads-to-lend-${stamp}.xlsx`);
}
