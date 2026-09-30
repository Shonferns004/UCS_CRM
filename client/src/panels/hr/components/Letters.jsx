import { useState, useEffect, useRef } from 'react';
import { useHR, apiGet, sendHrWhatsAppLetter, sendHrWhatsAppText } from '../store';
import { api } from '../../../api/auth';
import { useSalaryPrivacy } from '../../../context/SalaryPrivacyContext';
import { Dropdown } from './ui';
import { FileTxt, WhatsApp, Send } from '../icons';
import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';
import { deptLabel } from '../../../lib/labels';
import { toast } from '../../../components/Toast';

const TYPES = ['Offer letter','Experience letter','Promotion letter','Warning letter','Relieving letter','Joining letter','NOBSD','NOBSD2','ODAR','Doc Submitted','Volunteer Termination Letter','Blank Letter'];

const HR_MESSAGES = [
  {
    key: 'm1',
    label: 'Day 1 – Normal Warning',
    heading: 'A. Volunteer Absent Without Prior Information',
    subject: 'Subject: Absence without Prior Information',
    body: 'Dear [Volunteer Name],\n\nYou were absent from work today without informing your Reporting Manager or the HR Department. Kindly share the reason for your absence immediately and confirm your availability to resume work. Timely communication is mandatory as per work policy. Please respond to this message at the earliest.\n\nRegards,\nHR Department'
  },
  {
    key: 'm2',
    label: 'Day 2 – Final Warning',
    subject: 'Subject: Final Warning for Continuous Unauthorized Absence',
    body: 'Dear [Volunteer Name],\n\nThis is your second consecutive day of absence without prior approval or valid communication. Despite our previous communication, we have not received a satisfactory response from your side. You are instructed to report to work immediately or provide a valid explanation along with supporting documents (if applicable) within 24 hours. Failure to do so may lead to disciplinary action, including termination of your work & position.\n\nRegards,\nHR Department'
  },
  {
    key: 'm3',
    label: 'Day 3 – Termination Message',
    subject: 'Subject: Termination Due to Unauthorized Absence',
    body: 'Dear [Volunteer Name],\n\nAs you have remained absent for three consecutive working days without prior approval and have failed to provide a valid explanation despite repeated communications, the management has decided to terminate your work & position with immediate effect. You are requested to complete the exit formalities and return all company property (if any). We wish you the very best for your future.\n\nRegards,\nHR Department'
  },
  {
    key: 'm4',
    label: 'Day 1 – Acknowledgement Message',
    heading: 'B. Volunteer Informed HR Before Taking Leave',
    body: 'Dear [Volunteer Name],\n\nThank you for informing the HR Department regarding your absence. We understand your situation and hope everything is fine. Your leave request has been noted. Please keep us updated regarding your condition and inform us about your expected date of joining. Take care, and we wish you a speedy recovery (if applicable change this line as per the situation).\n\nRegards,\nHR Department'
  },
  {
    key: 'm5',
    label: 'Day 2 – Request for Supporting Documents',
    body: 'Dear [Volunteer Name],\n\nWe hope you are doing well. As your leave has continued, kindly share the relevant supporting document (such as a medical certificate or any emergency proof) and confirm your expected date of rejoining. This will help us process your leave as per policy. Thank you for your cooperation.\n\nRegards,\nHR Department'
  },
  {
    key: 'm6',
    label: 'Day 3 – Follow-up Message',
    body: 'Dear [Volunteer Name],\n\nThis is a reminder regarding your continued absence. Kindly update us on your current situation and confirm your joining date. If you have not yet submitted the required supporting documents, please do so immediately. Failure to respond may result in your leave being treated as unauthorized, and further action may be taken as per policy.\n\nRegards,\nHR Department'
  },
  {
    key: 'm7',
    label: 'Reminder Notice – No Leave Application Form',
    body: 'Dear Volunteer,\n\nYou have remained absent from work without informing the HR Department, and no Leave Application Form has been submitted. This is a violation of the attendance policy. You are instructed to immediately raise a leave request through the mobile app and inform your reporting manager or the HR Department with the reason for your absence. Please treat this as an official message. Repeated unauthorized absence or failure to follow the leave procedure may lead to disciplinary action as per the organization\'s HR policy.\n\nHR Department'
  }
];

const NGO_CONFIG = {
  BSCT: { name: 'BEING SEVAK CHARITABLE TRUST', logo: '/logo/beingsevak-logo.png', alt: 'Being Sevak Charitable Trust', footer: 'Being Sevak Charitable Trust', address: '506, Sanjar Enclave, Bhadran Nagar, Kandivali (West), Mumbai, Maharashtra 400067.' },
  AFLF: { name: 'ASHRAY FOR LIFE FOUNDATION', logo: '/logo/aflf-logo.png', alt: 'Ashray for Life Foundation', footer: 'Ashray for Life Foundation', address: 'Unit - 218, 2nd Floor, Auris Galleria, S.V Road, Andheri (West), Mumbai 400058.', logoSize: 140 },
  MANN: { name: 'MANN CARE FOUNDATION', logo: '/logo/mann-logo.png', alt: 'Mann Care Foundation', footer: 'Mann Care Foundation', address: '1708 ONE WORLD, SV ROAD NEAR NL HIGH SCHOOL MALAD WEST MUMBAI 400064.', logoSize: 140 },
  UCS: { name: 'ULTIMATE CONSULTANCY SERVICES', displayName: 'Ultimate Consultancy Services', logo: '/logo/ucs-logo.png', alt: 'Ultimate Consultancy Services', footer: 'Ultimate Consultancy Services', address: 'Sanjar Enclave, Office no 506, S.V Road, Kandivali West, Mumbai - 400067' },
};

function getNgo(key) { return NGO_CONFIG[key] || NGO_CONFIG.BSCT; }

const LETTERHEAD_IMG = {
  BSCT: '/Letter Head BSCT (1).png',
  AFLF: '/Letter Head AFLF.png',
  MANN: '/Letter Head MANN.png',
};

const LETTERHEAD_BODY = {
  BSCT: { top: 13, bottom: 9, left: 5.5, right: 5.5 },
  AFLF: { top: 17, bottom: 8, left: 6, right: 6 },
  MANN: { top: 12, bottom: 5, left: 6, right: 6 },
};

function buildLetterheadLayout(ngoKey, innerHtml) {
  const img = LETTERHEAD_IMG[ngoKey];
  const b = LETTERHEAD_BODY[ngoKey];
  return `<div style="width:900px;height:1273px;margin:0 auto;position:relative;overflow:hidden;background:#fff;box-sizing:border-box;print-color-adjust:exact;-webkit-print-color-adjust:exact">
<img src="${img}" alt="" style="position:absolute;top:0;left:0;width:900px;height:1273px;display:block;z-index:0" />
<div style="position:absolute;top:${b.top}%;bottom:${b.bottom}%;left:${b.left}%;right:${b.right}%;box-sizing:border-box;overflow:hidden;z-index:1;font-family:'Times New Roman',Times,serif;color:#111">${innerHtml}</div>
</div>`;
}

const HAS_LH = (k) => k === 'BSCT' || k === 'AFLF' || k === 'MANN';

function esc(s) { return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

function safeImgSrc(url) {
  const s = String(url ?? '').trim();
  if (!/^https?:\/\//i.test(s)) return '';
  if (/["'<>\\s`]/.test(s)) return '';
  return s;
}

const SIG_LINE_FALLBACK = '_______________________';

function signatureImgHtml(url) {
  const src = safeImgSrc(url);
  return src
    ? `<img src="${src}" alt="" style="height:34px;vertical-align:middle;max-width:190px;object-fit:contain" />`
    : SIG_LINE_FALLBACK;
}

function waitForImage(img) {
  if (img.complete && img.naturalWidth > 0) return Promise.resolve();
  return new Promise((resolve) => {
    const done = () => resolve();
    img.addEventListener('load', done, { once: true });
    img.addEventListener('error', done, { once: true });
  });
}

function imgToDataUrl(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      const c = document.createElement('canvas');
      c.width = img.naturalWidth;
      c.height = img.naturalHeight;
      c.getContext('2d').drawImage(img, 0, 0);
      resolve(c.toDataURL('image/png'));
    };
    img.onerror = reject;
    img.src = src;
  });
}

function titleCase(s) { return String(s ?? '').replace(/\b\w/g, c => c.toUpperCase()); }

const ONES = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten',
  'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
const TENS = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

function twoDigitWords(n) {
  if (n < 20) return ONES[n];
  const t = TENS[Math.floor(n / 10)];
  const o = ONES[n % 10];
  return o ? `${t} ${o}` : t;
}

function numberToWordsIndian(num) {
  const n = Math.floor(Math.abs(Number(num) || 0));
  if (n === 0) return 'Zero';
  const parts = [];
  const crore = Math.floor(n / 10000000);
  const lakh = Math.floor((n % 10000000) / 100000);
  const thousand = Math.floor((n % 100000) / 1000);
  const hundred = Math.floor((n % 1000) / 100);
  const rest = n % 100;
  if (crore) parts.push(`${numberToWordsIndian(crore)} Crore`);
  if (lakh) parts.push(`${twoDigitWords(lakh)} Lakh`);
  if (thousand) parts.push(`${twoDigitWords(thousand)} Thousand`);
  if (hundred) parts.push(`${ONES[hundred]} Hundred`);
  if (rest) parts.push(twoDigitWords(rest));
  return parts.join(' ');
}

function parseYmd(s) {
  if (!s) return null;
  const raw = String(s).trim();
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(raw)) {
    const [dd, mm, yyyy] = raw.split('/');
    const d = new Date(Number(yyyy), Number(mm) - 1, Number(dd));
    return isNaN(d.getTime()) ? null : d;
  }
  const t = raw.includes('T') ? raw : `${raw}T00:00:00`;
  const d = new Date(t);
  return isNaN(d.getTime()) ? null : d;
}

function fmtDate(s, fallback = '______________') {
  const d = parseYmd(s);
  return d ? d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }) : fallback;
}

// Total experience between two dates. Counts whole months from the calendar,
// then the leftover days. Rendered as "X Months and Y Days" under a year, and
// as "X Years and Y Months" once a full year is reached.
function calcExperience(fromStr, toStr) {
  const a = parseYmd(fromStr);
  const b = parseYmd(toStr) || new Date();
  if (!a || !b || b < a) return null;
  let months = (b.getFullYear() - a.getFullYear()) * 12 + (b.getMonth() - a.getMonth());
  if (b.getDate() < a.getDate()) months -= 1;
  if (months < 0) months = 0;
  const years = Math.floor(months / 12);
  const remMonths = months % 12;
  const days = Math.round((b - a) / 86400000);
  // Days left over after the last completed whole month (e.g. 16 May -> 30 Sep
  // is 4 whole months, then 14 more days).
  const anniversary = new Date(a.getFullYear(), a.getMonth() + months, a.getDate());
  const remDays = Math.max(0, Math.min(30, Math.round((b - anniversary) / 86400000)));
  const text = years > 0
    ? `${years} (${years === 1 ? 'Year' : 'Years'})${remMonths ? ` and ${remMonths} (${remMonths === 1 ? 'Month' : 'Months'})` : ''}`
    : months > 0
      ? `${months} (${months === 1 ? 'Month' : 'Months'})${remDays ? ` and ${remDays} (${remDays === 1 ? 'Day' : 'Days'})` : ''}`
      : `${days} (${days === 1 ? 'Day' : 'Days'})`;
  return { months, years, remMonths, remDays, days, text };
}

// Table rows stating the tenure as readable text and as a plain month count.
function experienceRows(fromStr, toStr, firstRow) {
  const exp = calcExperience(fromStr, toStr);
  const expText = exp ? exp.text : '{{total_experience}}';
  const expMonths = exp ? exp.months : '{{total_experience_months}}';
  return {
    exp,
    expText,
    expMonths,
    rows: [
      ...(firstRow || []),
      ['Total Experience', `<strong>${esc(expText)}</strong>`],
      ['Total Experience in Months', `<strong>${esc(expMonths)}</strong> (${exp ? exp.months === 1 ? 'Month' : 'Months' : 'Months'})`],
    ],
  };
}

const REF_CODES = { 'Offer letter': 'OFR', 'Relieving letter': 'REL', 'Experience letter': 'EXP', 'Joining letter': 'JNG' };

function makeRefNo(ngoKey, type, dateStr) {
  const d = parseYmd(dateStr) || new Date();
  const fy = d.getMonth() >= 3 ? d.getFullYear() : d.getFullYear() - 1;
  const ymd = `${String(d.getDate()).padStart(2, '0')}${String(d.getMonth() + 1).padStart(2, '0')}${d.getFullYear()}`;
  return `${ngoKey}/HR/${fy}-${String(fy + 1).slice(-2)}/${REF_CODES[type] || 'LTR'}/${ymd}`;
}

function signOffBlock(ngo, hrNameText, signatoryLabel) {
  return `<div style="margin-top:14px;text-align:left">
<p style="margin:0 0 2px 0">Yours sincerely,</p>
<p style="margin:0 0 2px 0">For <strong>${ngo.name}</strong>,</p>
<p style="margin:10px 0 0 0"><strong>${esc(hrNameText)}</strong><br />${esc(signatoryLabel)}<br /><br />_______________________<br /><span style="font-size:0.9em">(Signature &amp; Organization Seal)</span></p>
</div>`;
}

function particularsTable(rows) {
  return `<table style="width:100%;border-collapse:collapse;border:1px solid #9aa7b5;margin:8px 0 10px 0">
${rows.map(([k, v]) => `<tr>
<td style="border:1px solid #9aa7b5;padding:5px 8px;width:34%;background:#f2f6fa;font-weight:700;text-align:left">${k}</td>
<td style="border:1px solid #9aa7b5;padding:5px 8px;text-align:left">${v}</td>
</tr>`).join('\n')}
</table>`;
}

function numberedTerms(items) {
  return `<ol style="margin:0 0 8px 0;padding-left:24px;text-align:justify">
${items.map(t => `<li style="margin-bottom:5px">${t}</li>`).join('\n')}
</ol>`;
}

// Gross monthly figure with the annual CTC derived from it (x12). Falls back to
// the bracketed mail-merge placeholders when no figure has been entered.
function remunerationFigures(monthlyInput) {
  const monthly = Math.max(0, Math.floor(Number(monthlyInput) || 0));
  const annual = monthly * 12;
  return {
    monthlyText: monthly > 0 ? `₹${monthly.toLocaleString('en-IN')}` : '₹[XX,XXX]',
    annualText: annual > 0 ? `₹${annual.toLocaleString('en-IN')}` : '₹[X,XX,XXX]',
  };
}

function buildOfferLetterHTML(w, dateText, joiningDateText, hrNameText, designation, ngoKey, refNo, remarks, ctcMonthly) {
  const ngo = getNgo(ngoKey);
  const r = designation || deptLabel(w.role || w.department) || 'Team Member';
  const d = deptLabel(w.dept || w.department) || 'General';
  const name = titleCase(w.name);
  const address = [w.address, w.city, w.state, w.pincode].filter(Boolean).join(', ');
  const { monthlyText, annualText } = remunerationFigures(ctcMonthly);
  const particulars = particularsTable([
    ['Name of Volunteer', `<strong>${esc(name)}</strong>`],
    ['Designation Offered', `<strong>${esc(r)}</strong>`],
    ['Department', esc(d)],
    ['Date of Joining', `<strong>${esc(joiningDateText)}</strong>`],
    ['Place of Work', esc(ngo.address)],
    ['Reporting To', 'Team Leader / Reporting Manager of the department'],
    ['Type of Engagement', 'Volunteer engagement (honorary, in the spirit of seva and social service)'],
    ['Initial Engagement Period', '2 (two) months from the date of joining, extendable by mutual consent'],
    ['Probation / Review Period', '1 (one) month from the date of joining'],
    ['Working Hours', '10:00 a.m. to 7:00 p.m., Monday to Saturday (subject to roster and operational requirement)'],
    ['Dress Code', 'Formals (Monday to Friday), Casuals (Saturday)'],
    ['Gross Monthly Remuneration', `<strong>${esc(monthlyText)}</strong> per month`],
    ['Annual CTC (approx.)', `<strong>${esc(annualText)}</strong> per annum`],
  ]);
  const terms = numberedTerms([
    `Your date of joining is <strong>${esc(joiningDateText)}</strong>. Please report at the office at 10:00 a.m. on the said date along with the documents listed in the joining checklist.`,
    `You will be assigned the duties and responsibilities of <strong>${esc(r)}</strong> in the <strong>${esc(d)}</strong> department, and any other duties reasonably assigned to you by your Team Leader or the Management from time to time.`,
    `The engagement is on a <strong>voluntary / honorary basis</strong> undertaken in the spirit of seva and social service. It does not create a contract of employment, and no guaranteed salary, wages, provident fund, bonus, or other statutory employment benefit is applicable, unless separately notified in writing.`,
    `During the initial <strong>training period</strong>, no leave shall be granted. Any absence without prior intimation and approval will be treated as unauthorised absence and will attract disciplinary action.`,
    `You are required to maintain punctuality, complete your daily attendance and task reporting, and keep your assigned CRM / records updated accurately.`,
    `You must maintain professional conduct and keep all beneficiary data, Trust information, and internal records strictly confidential.`,
    `Any breach of the code of conduct, confidentiality undertaking, or policy of ${esc(ngo.name)} may result in disciplinary action, including suspension or immediate termination of your engagement.`,
    `Original documents submitted by you will be held securely by the organization purely for verification and administrative purposes, and will be returned as per policy upon separation, subject to clearance of all dues and formalities.`,
    `Either party may terminate this engagement by giving <strong>seven (7) days'</strong> written notice, or immediately in the event of misconduct, without prejudice to the organization's rights.`,
    `You confirm that you are joining voluntarily, with no obligation on the part of ${esc(ngo.name)} to provide continuing engagement beyond the initial period.`,
  ]);
  const acceptance = `<div style="margin-top:16px;border:1px solid #0B73C4;border-radius:6px;padding:12px 14px;text-align:left">
<div style="font-weight:700;color:#082F5A;text-transform:uppercase;margin-bottom:6px">Acceptance of Offer</div>
<p style="margin:0 0 8px 0">I, <strong>${esc(name)}</strong>, hereby accept the above offer of volunteer engagement with <strong>${esc(ngo.name)}</strong> on the terms and conditions stated above, and confirm that I have read and understood them in full.</p>
<table style="width:100%;border-collapse:collapse">
<tr><td style="padding:3px 0;width:55%"><strong>Signature:</strong> _______________________</td><td style="padding:3px 0"><strong>Place:</strong> ______________</td></tr>
<tr><td style="padding:3px 0"><strong>Date:</strong> ____ / ____ / ________</td><td style="padding:3px 0"><strong>Parent / Guardian:</strong> ______________</td></tr>
</table>
</div>
${remarks ? `<p style="margin:10px 0 0 0"><strong>Note:</strong> ${esc(remarks)}</p>` : ''}`;
  const titleBlock = `<div style="text-align:center;font-size:16px;font-weight:700;color:#082F5A;text-transform:uppercase;letter-spacing:0.5px;margin:0 0 2px 0">OFFER LETTER</div>
<div style="text-align:right;font-size:0.88em;margin:0 0 8px 0"><strong>Ref. No.:</strong> ${esc(refNo)}</div>
<table style="width:100%;border-collapse:collapse"><tr><td style="padding:0 0 6px 0"><strong>Date:</strong> ${esc(dateText)}</td></tr></table>
<table style="width:100%;border-collapse:collapse;margin-bottom:6px">
<tr><td style="padding:0 0 2px 0">To,</td></tr>
<tr><td style="padding:0 0 2px 0"><strong>${esc(name)}</strong></td></tr>
${address ? `<tr><td style="padding:0 0 2px 0">${esc(address)}</td></tr>` : ''}
</table>
<div style="font-weight:700;color:#082F5A;margin:0 0 6px 0">Subject: Offer of volunteer engagement as ${esc(r)}</div>
<p style="margin:0 0 6px 0">Respected ${esc(name)},</p>
<p style="margin:0 0 6px 0">Following our discussions / interview, we are pleased to extend to you an offer of volunteer engagement with <strong>${esc(ngo.name)}</strong>. The particulars of the offer are set out below.</p>
${particulars}
<div style="font-weight:700;color:#082F5A;margin:4px 0 4px 0">Remuneration</div>
<p style="margin:0 0 6px 0">Your gross monthly remuneration will be <strong>${esc(monthlyText)}</strong> per month, equivalent to an annual CTC of approximately <strong>${esc(annualText)}</strong> per annum.</p>
<p style="margin:0 0 6px 0">The applicable salary structure, deductions, statutory contributions, and other components will be governed by the organization's policies and applicable laws.</p>
<p style="margin:0 0 6px 0">A detailed salary structure may be provided separately by the HR / Accounts Department.</p>
<div style="font-weight:700;color:#082F5A;margin:0 0 6px 0">Terms &amp; Conditions</div>
${terms}
${acceptance}`;
  if (HAS_LH(ngoKey)) {
    return buildLetterheadLayout(ngoKey, `<div style="padding:10px 0 24px;text-align:justify;font-size:15.5px;line-height:1.45">${titleBlock}${signOffBlock(ngo, hrNameText, 'Human Resources / Authorized Signatory')}</div>`);
  }
  return `${plainShell(ngoKey, ngo, titleBlock + signOffBlock(ngo, hrNameText, 'Human Resources / Authorized Signatory'), 15)}`;
}

function buildRelievingLetterHTML(w, dateText, hrNameText, designation, ngoKey, refNo, remarks, joiningDateInput) {
  const ngo = getNgo(ngoKey);
  const r = designation || deptLabel(w.role || w.department) || 'Team Member';
  const d = deptLabel(w.dept || w.department) || 'General';
  const name = titleCase(w.name);
  const jd = joiningDateInput || w.date_of_joining || w.created_at || '';
  const joiningDateText = fmtDate(jd, '{{joining_date}}');
  const { expText, expMonths, rows: expRowList } = experienceRows(jd, dateText, [
    ['Name', `<strong>${esc(name)}</strong>`],
    ['Designation', `<strong>${esc(r)}</strong>`],
    ['Department', esc(d)],
    ['Date of Joining', `<strong>${esc(joiningDateText)}</strong>`],
    ['Date of Relieving', `<strong>${esc(dateText)}</strong>`],
    ['Volunteer ID', esc((w.login_id || w.employee_id || w.id || '').toString())],
  ]);
  const particulars = particularsTable(expRowList);
  const remarksBlock = `<div style="margin:10px 0 0 0;border:1px solid #9aa7b5;border-radius:6px;padding:10px 12px;text-align:left">
<div style="font-weight:700;color:#082F5A;margin-bottom:4px">Remarks on Separation</div>
<div style="font-size:0.94em">${remarks
    ? esc(remarks)
    : 'As per records available with the Human Resources department, the volunteer has no pending monetary dues, outstanding advances, unreturned advances or organisation property, and all original documents and identity items have been accounted for.'}</div>
</div>`;
  const inner = `<div style="text-align:center;font-size:16px;font-weight:700;color:#082F5A;text-transform:uppercase;letter-spacing:0.5px;margin:0 0 2px 0">RELIEVING LETTER</div>
<div style="text-align:right;font-size:0.88em;margin:0 0 8px 0"><strong>Ref. No.:</strong> ${esc(refNo)}</div>
<table style="width:100%;border-collapse:collapse"><tr><td style="padding:0 0 6px 0"><strong>Date:</strong> ${esc(dateText)}</td></tr></table>
<table style="width:100%;border-collapse:collapse;margin-bottom:6px">
<tr><td style="padding:0 0 2px 0">To,</td></tr>
<tr><td style="padding:0 0 2px 0"><strong>${esc(name)}</strong></td></tr>
</table>
<div style="font-weight:700;color:#082F5A;margin:0 0 6px 0">Subject: Relieving from the services of ${esc(ngo.name)}</div>
<p style="margin:0 0 6px 0">Respected ${esc(name)},</p>
<p style="margin:0 0 6px 0">This is to certify that you were engaged with <strong>${esc(ngo.name)}</strong> in the capacity of <strong>${esc(r)}</strong> in the <strong>${esc(d)}</strong> department from <strong>${esc(joiningDateText)}</strong> to <strong>${esc(dateText)}</strong> &mdash; a total experience of <strong>${esc(expText)}</strong> (${esc(expMonths)}).</p>
${particulars}
<p style="margin:0 0 6px 0">Your duties, responsibilities, assigned tasks, files, records, and pending work have been duly handed over to the person nominated by the Management, and you have been <strong>relieved of all duties and responsibilities</strong> with effect from the close of working hours on <strong>${esc(dateText)}</strong>.</p>
${remarksBlock}
<p style="margin:10px 0 6px 0">All organisation property, identity cards, official documents, and any other assets in your possession must be returned to the Human Resources department on or before the date mentioned above.</p>
<p style="margin:0 0 6px 0">We request you to collect your original documents, this relieving letter, and your experience letter from the Human Resources department on confirmation of your identity. Kindly acknowledge receipt of this letter.</p>
<p style="margin:0 0 6px 0">The organization thanks you for your sincere services and contribution towards the social cause. We wish you all the very best in your future professional endeavours.</p>
<p style="margin:0 0 6px 0">For any clarification regarding this letter, please contact the Human Resources department.</p>
${signOffBlock(ngo, hrNameText, 'Human Resources / Authorized Signatory')}
<div style="margin-top:10px;border:1px solid #0B73C4;border-radius:6px;padding:10px 12px;text-align:left;font-size:0.94em">
<div style="font-weight:700;color:#082F5A;margin-bottom:4px">Acknowledgement by the Volunteer</div>
<div>I acknowledge that I have received this relieving letter from <strong>${esc(ngo.name)}</strong> and that all my dues and property have been settled as stated above.</div>
<div style="margin-top:6px"><strong>Signature:</strong> _______________________ &nbsp;&nbsp; <strong>Date:</strong> ____ / ____ / ________</div>
</div>`;
  if (HAS_LH(ngoKey)) {
    return buildLetterheadLayout(ngoKey, `<div style="padding:10px 0 24px;text-align:justify;font-size:15.5px;line-height:1.45">${inner}</div>`);
  }
  return plainShell(ngoKey, ngo, inner, 15);
}

function plainShell(ngoKey, ngo, inner, fontSize = 15) {
  return `<div style="width:900px;min-height:1273px;margin:0 auto;background:#fff;font-family:'Times New Roman',Times,serif;font-size:${fontSize}px;line-height:1.4;color:#111;position:relative;overflow:hidden;display:flex;flex-direction:column;box-sizing:border-box;print-color-adjust:exact;-webkit-print-color-adjust:exact">
<div style="width:794px;margin:0 auto;box-sizing:border-box;flex:1;padding:24px 44px 0;position:relative;z-index:1">
<div style="display:flex;align-items:center;margin-bottom:4px">
<img src="${ngo.logo}" alt="${ngo.alt}" style="width:${ngo.logoSize || 100}px;height:auto;margin-right:14px" />
<div style="flex:1;text-align:center"><div style="font-size:20px;font-weight:700;color:#082F5A;letter-spacing:2px;line-height:1.1">${ngo.name}</div></div>
</div>
<div style="height:2px;background:#0B73C4;margin-bottom:12px"></div>
${inner}
<div style="margin-top:16px;padding-top:6px"><div style="height:2px;background:#0B73C4;margin-bottom:6px"></div><div style="text-align:center;font-size:0.9em;color:#6b7280"><strong>Regd. Address:</strong> ${ngo.address}</div></div>
</div>
</div>`;
}

function buildJoiningLetterHTML(w, dateText, hrNameText, subjectText, ngoKey) {
  const ngo = getNgo(ngoKey);
  const r = deptLabel(w.role || w.department) || 'Team Member';
  const d = deptLabel(w.dept || w.department) || 'General';
  const ucs = ngoKey === 'UCS';
  const company = ngo.displayName || ngo.name;
  const subj = ucs ? 'Joining Letter' : (subjectText || `Joining as ${r}`);
  const bodyHtml = ucs ? `
<p style="margin:0 0 6px 0">We are pleased to inform you that <strong>${company}</strong>, on behalf of (BSCT), has selected you to join the organization as a <strong>Volunteer</strong> to support the Trust's various organizational and social activities.</p>
<p style="margin:0 0 6px 0">You will initially be associated with <strong>Being Sevak Charitable Trust</strong> for a one-month volunteer training and orientation period, during which your participation, conduct, learning, and overall performance will be observed and evaluated. Upon satisfactory completion of this period, your volunteer engagement may be continued based on the requirements of the Trust and mutual understanding.</p>
<p style="margin:0 0 6px 0">During your training and volunteer engagement, you will be required to perform the duties and responsibilities assigned to you by your Team Leaders/Supervisors and follow the guidelines, policies, procedures, and values of Being Sevak Charitable Trust.</p>` : `
<p style="margin:0 0 6px 0">We are delighted to welcome you to <strong>${ngo.name}</strong>. This letter confirms your joining as a <strong>${r}</strong> in the <strong>${d}</strong> department.</p>
<p style="margin:0 0 6px 0">Your date of joining is <strong>${dateText}</strong>. You will be on a probation period of <strong>one (1) month</strong> from the date of joining, during which your performance will be closely monitored and evaluated.</p>
<p style="margin:0 0 6px 0">During your probation, you are required to perform all duties and responsibilities assigned to you by your Team Leader or Reporting Manager. Your training will consist of two stages: an initial basic training period of <strong>3 (three) days</strong> from the date of joining, followed by a comprehensive training period of <strong>24 (twenty-four) days</strong>. Please note that <strong>no leave will be permitted</strong> during the training period.</p>
<p style="margin:0 0 6px 0"><u><strong>Office Timings:</strong></u> All volunteers are required to maintain office hours from <strong>10:00 a.m. to 7:00 p.m.</strong>, Monday through Saturday.</p>
<p style="margin:0 0 6px 0"><u><strong>Office Guidelines:</strong></u></p>
<ul style="margin:0 0 6px 0;padding-left:22px">
<li style="margin-bottom:4px">Dress Code (Monday to Friday): Formals</li>
<li style="margin-bottom:4px">Dress Code (Saturday): Casuals</li>
<li style="margin-bottom:4px">Personal mobile phones are not permitted during working hours, except during lunch breaks.</li>
</ul>
<p style="margin:0 0 6px 0">All volunteers are expected to adhere to the highest standards of professionalism, integrity, and confidentiality. Any breach of the company's code of conduct or confidentiality policies may result in disciplinary action, including termination of employment.</p>
<p style="margin:0 0 6px 0">Please note that during the probation period, you will not be eligible for any other monetary benefits beyond the stipulated stipend. If a volunteer absconds or voluntarily leaves during the training period, they will not be eligible for any training salary or compensation.</p>
<p style="margin:0 0 6px 0">We look forward to a long and mutually rewarding association with you. Welcome aboard!</p>`;
  const signatureHtml = ucs
    ? `<p style="margin:0 0 2px 0">Regards,</p><p style="margin:0 0 2px 0">Yours sincerely,</p><p style="margin:10px 0 0 0"><strong>HR,</strong><br />${hrNameText}<br /><strong>${company}</strong></p>`
    : `<p style="margin:0 0 2px 0">Yours sincerely,</p><p style="margin:10px 0 0 0"><strong>HR,</strong><br />${hrNameText}<br /><strong>${ngo.name}</strong></p>`;
  const centerTitle = `${ucs ? subj : `Subject: ${subj}`}`;
  if (HAS_LH(ngoKey)) {
    const inner = `<div style="padding:10px 0 24px;text-align:justify">
<div style="text-align:center;font-size:16px;font-weight:700;color:#082F5A;text-transform:uppercase;letter-spacing:0.5px;margin:0 0 8px 0">${centerTitle}</div>
<div style="margin:0 0 6px 0"><strong>Date:</strong> ${dateText}</div>
<div style="margin-bottom:6px"><strong>Dear ${titleCase(w.name)},</strong></div>
${bodyHtml}
<div style="margin-top:14px">${signatureHtml}</div>
</div>`;
    return buildLetterheadLayout(ngoKey, inner);
  }
  return `<div style="max-width:800px;margin:0 auto;font-family:'Times New Roman',Times,serif;font-size:12px;line-height:1.25;color:#000;background:#fff;padding:25px 35px">
<div style="display:flex;align-items:center;margin-bottom:4px">
<img src="${ngo.logo}" alt="${ngo.alt}" style="width:${ngo.logoSize || 100}px;height:auto;margin-right:14px" />
<div style="flex:1;text-align:center"><div style="font-size:18px;font-weight:700;color:#082F5A;letter-spacing:2px;line-height:1.1">${ngo.name}</div></div>
</div>
<svg width="100%" height="20" viewBox="0 0 700 20" preserveAspectRatio="none" style="display:block"><path d="M0,10 Q175,20 350,10 Q525,0 700,10 L700,20 L0,20 Z" fill="#0B73C4" /></svg>
<div style="height:2px;background:#F58220;margin-bottom:12px"></div>
<div style="text-align:center;font-size:14px;font-weight:700;color:#082F5A;margin:0 0 8px 0;text-transform:uppercase">${centerTitle}</div>
<table style="width:100%;border-collapse:collapse"><tr><td style="padding:0 0 6px 0;font-size:12px"><strong>Date:</strong> ${dateText}</td></tr></table>
<div style="margin-bottom:6px"><strong>Dear ${titleCase(w.name)},</strong></div>
<div style="text-align:justify">
${bodyHtml}
</div>
<div style="margin-top:12px">${signatureHtml}</div>
<div style="margin-top:14px;padding-top:4px"><svg width="100%" height="14" viewBox="0 0 700 14" preserveAspectRatio="none" style="display:block;margin-bottom:3px"><path d="M0,7 Q175,0 350,7 Q525,14 700,7 L700,14 L0,14 Z" fill="#0B73C4" /></svg><div style="height:2px;background:#F58220;margin-bottom:6px"></div><div style="text-align:center;font-size:12px;color:#6b7280">    <strong>Regd. Address:</strong> ${ngo.address}</div></div>
</div>`;
}

function buildBSCTLetterhead(innerHtml) {
  return buildLetterheadLayout('BSCT', innerHtml);
}

function buildAFLFLetterhead(innerHtml) {
  return buildLetterheadLayout('AFLF', innerHtml);
}

function buildMANNLetterhead(innerHtml) {
  return buildLetterheadLayout('MANN', innerHtml);
}

function buildNoBSDDeclarationHTML(w, dateText, hrNameText, subjectText, ngoKey) {
  const ngo = getNgo(ngoKey);
  const r = deptLabel(w.role || w.department) || 'Team Member';
  const subj = subjectText || 'NO OBJECTION & VOLUNTARY SERVICE DECLARATION';
  const subjDiv = (mTop) => `<div style="text-align:center;font-size:18px;font-weight:700;color:#134987;text-transform:uppercase;letter-spacing:0.5px;margin:${mTop} 0 6px">Subject:- ${subj}</div>`;
  const body = `<div style="padding:10px 0 24px;line-height:1.7;text-align:justify">
<table style="width:100%;border-collapse:collapse"><tr><td style="padding:0 0 8px 0"><strong>Date:</strong> ${dateText}</td></tr></table>
<p style="margin:0 0 10px 0">I, <strong>Mr./Ms. ${w.name}</strong>, residing at ____________________, have voluntarily joined <strong>${ngo.name}</strong> (Trust/Organization) as a Volunteer. I hereby declare and confirm the following:</p>
<ol style="margin:0 0 10px 0;padding-left:26px;text-align:left">
<li style="margin-bottom:8px">I understand that my performance, discipline, attendance, behaviour, and compliance with the organization's policies will be reviewed regularly by the Management.</li>
<li style="margin-bottom:8px">I understand and agree that my role with the organization is on a voluntary basis, and I shall carry out the responsibilities assigned to me sincerely and responsibly.</li>
<li style="margin-bottom:8px">I clearly understand and confirm that I shall not be entitled to any salary, wages, remuneration, honorarium, or fixed monthly payment from the organization for my voluntary services.</li>
<li style="margin-bottom:8px">I understand that my voluntary association with the organization does not create any right or claim for salary, remuneration, employment benefits, or any permanent financial entitlement.</li>
<li style="margin-bottom:8px">I accept that the Management may review my performance, attendance, conduct, and responsibilities from time to time and may take appropriate decisions regarding my continuation as a Volunteer in accordance with the organization's policies.</li>
<li style="margin-bottom:8px">I confirm that I am signing this declaration voluntarily, without any pressure, coercion, or undue influence, after fully understanding its contents.</li>
</ol>
<p style="margin:0 0 10px 0">I have read, understood, and accepted all the above terms and conditions.</p>
<div style="margin:22px 0;height:1px;background:#d1d5db"></div>
<table style="width:100%;border-collapse:collapse">
<tr><td style="padding:4px 0"><strong>Volunteer Name:</strong> ${w.name}</td><td style="padding:4px 0"><strong>Designation:</strong> ${r}</td></tr>
<tr><td style="padding:4px 0"><strong>Signature of Volunteer:</strong> _______________________</td><td style="padding:4px 0"><strong>Date:</strong> ____ / ____ / _____</td></tr>
</table>
<div style="margin:20px 0 0 0;border:1px solid #134987;border-radius:6px;padding:14px 18px">
<div style="font-weight:700;color:#134987;text-transform:uppercase;margin-bottom:8px">HR Verification</div>
<div><strong>HR Name:</strong> ${hrNameText}</div>
<div style="margin-top:6px"><strong>Signature:</strong> ______________ &nbsp;&nbsp; <strong>Date:</strong> __ / __ / __</div>
</div>
<div style="margin:16px 0 0 0;border:1px solid #134987;border-radius:6px;padding:14px 18px">
<div style="font-weight:700;color:#134987;text-transform:uppercase;margin-bottom:8px">Management Approval</div>
<div><strong>Authorized Signatory:</strong> _____________</div>
<div style="margin-top:6px"><strong>Signature:</strong> __________________ &nbsp;&nbsp; <strong>Date:</strong> ____ / ____ / ____</div>
</div>
</div>`;
  if (ngoKey === 'BSCT') {
    return buildBSCTLetterhead(subjDiv('0') + body);
  }
  if (ngoKey === 'AFLF') {
    return buildAFLFLetterhead(subjDiv('0') + body);
  }
  if (ngoKey === 'MANN') {
    return buildMANNLetterhead(subjDiv('0') + body);
  }
  return `<div style="width:900px;min-height:1273px;margin:0 auto;background:#fff;font-family:'Times New Roman',Times,serif;font-size:16px;color:#111;position:relative;overflow:hidden;display:flex;flex-direction:column;box-sizing:border-box;print-color-adjust:exact;-webkit-print-color-adjust:exact">
<div style="width:794px;margin:0 auto;box-sizing:border-box;flex:1;padding:24px 44px 0;position:relative;z-index:1">
${subjDiv('20')}
${body}
</div>
</div>`;
}

function buildNoBSD2DeclarationHTML(w, dateText, hrNameText, subjectText, ngoKey, amount) {
  const ngo = getNgo(ngoKey);
  const r = deptLabel(w.role || w.department) || 'Team Member';
  const subj = subjectText || 'NO OBJECTION & VOLUNTARY SERVICE DECLARATION';
  const amtNum = Math.floor(Number(amount) || 0);
  const amtDigits = amtNum > 0 ? amtNum.toLocaleString('en-IN') : '__________';
  const amtWords = amtNum > 0 ? numberToWordsIndian(amtNum) : '__________';
  const subjDiv = (mTop) => `<div style="text-align:center;font-size:18px;font-weight:700;color:#134987;text-transform:uppercase;letter-spacing:0.5px;margin:${mTop} 0 6px">Subject:- ${subj}</div>`;
  const body = `<div style="padding:10px 0 24px;line-height:1.7;text-align:justify">
<table style="width:100%;border-collapse:collapse"><tr><td style="padding:0 0 8px 0"><strong>Date:</strong> ${dateText}</td></tr></table>
<p style="margin:0 0 10px 0">I, <strong>Mr./Ms. ${w.name}</strong>, residing at ____________________, have voluntarily joined <strong>${ngo.name}</strong> (Trust/Organization) as a Volunteer. I hereby declare and confirm the following:</p>
<ol style="margin:0 0 10px 0;padding-left:26px;text-align:left">
<li style="margin-bottom:8px">I understand that my performance, discipline, attendance, behaviour, and compliance with the organization's policies will be reviewed regularly by the Management.</li>
<li style="margin-bottom:8px">I understand and agree that if my performance is found to be unsatisfactory, my attendance is irregular, I fail to achieve assigned responsibilities, or I violate the organization's rules and policies, the Management shall have the sole discretion to revise my remuneration.</li>
<li style="margin-bottom:8px">In such circumstances, I have no objection if the organization limits my monthly payment to ₹${amtDigits} (Rupees ${amtWords} Only) as Volunteer Expenses/Honorarium, until further review by the Management.</li>
<li style="margin-bottom:8px">I clearly understand that the payment of ₹${amtDigits} is towards volunteer expenses/honorarium and shall not be considered as a guaranteed salary or permanent entitlement.</li>
<li style="margin-bottom:8px">I accept that the Management's decision regarding my remuneration, based on my performance and conduct, shall be final and binding.</li>
<li style="margin-bottom:8px">I confirm that I am signing this declaration voluntarily, without any pressure, coercion, or undue influence, after fully understanding its contents.</li>
</ol>
<p style="margin:0 0 10px 0">I have read, understood, and accepted all the above terms and conditions.</p>
<div style="margin:22px 0;height:1px;background:#d1d5db"></div>
<table style="width:100%;border-collapse:collapse">
<tr><td style="padding:4px 0"><strong>Volunteer Name:</strong> ${w.name}</td><td style="padding:4px 0"><strong>Designation:</strong> ${r}</td></tr>
<tr><td style="padding:4px 0"><strong>Signature of Volunteer:</strong> _______________________</td><td style="padding:4px 0"><strong>Date:</strong> ____ / ____ / _____</td></tr>
</table>
<div style="margin:20px 0 0 0;border:1px solid #134987;border-radius:6px;padding:14px 18px">
<div style="font-weight:700;color:#134987;text-transform:uppercase;margin-bottom:8px">HR Verification</div>
<div><strong>HR Name:</strong> ${hrNameText}</div>
<div style="margin-top:6px"><strong>Signature:</strong> ______________ &nbsp;&nbsp; <strong>Date:</strong> __ / __ / __</div>
</div>
<div style="margin:16px 0 0 0;border:1px solid #134987;border-radius:6px;padding:14px 18px">
<div style="font-weight:700;color:#134987;text-transform:uppercase;margin-bottom:8px">Management Approval</div>
<div><strong>Authorized Signatory:</strong> _____________</div>
<div style="margin-top:6px"><strong>Signature:</strong> __________________ &nbsp;&nbsp; <strong>Date:</strong> ____ / ____ / ____</div>
</div>
</div>`;
  if (ngoKey === 'BSCT') {
    return buildBSCTLetterhead(subjDiv('0') + body);
  }
  if (ngoKey === 'AFLF') {
    return buildAFLFLetterhead(subjDiv('0') + body);
  }
  if (ngoKey === 'MANN') {
    return buildMANNLetterhead(subjDiv('0') + body);
  }
  return `<div style="width:900px;min-height:1273px;margin:0 auto;background:#fff;font-family:'Times New Roman',Times,serif;font-size:16px;color:#111;position:relative;overflow:hidden;display:flex;flex-direction:column;box-sizing:border-box;print-color-adjust:exact;-webkit-print-color-adjust:exact">
<div style="width:794px;margin:0 auto;box-sizing:border-box;flex:1;padding:24px 44px 0;position:relative;z-index:1">
${subjDiv('20')}
${body}
</div>
</div>`;
}

function buildODARDocumentHTML(w, dateText, hrNameText, subjectText, ngoKey, docRows = []) {
  const rows = docRows && docRows.length ? docRows : [{sr:1,doc:'',original:false,returned:false,remarks:''},{sr:2,doc:'',original:false,returned:false,remarks:''},{sr:3,doc:'',original:false,returned:false,remarks:''}];
  const rowsHtml = rows.map(r => `
<tr>
<td style="border:1px solid #999;padding:10px 8px;text-align:center">${esc(r.sr)}</td>
<td style="border:1px solid #999;padding:10px 8px">${esc(r.doc)}</td>
<td style="border:1px solid #999;padding:10px 8px;text-align:center">${r.original ? '✓' : ''}</td>
<td style="border:1px solid #999;padding:10px 8px;text-align:center">${r.returned ? '✓' : ''}</td>
<td style="border:1px solid #999;padding:10px 8px">${esc(r.remarks)}</td>
</tr>`).join('');
  const ngo = getNgo(ngoKey);
  const r = deptLabel(w.role || w.department) || 'Team Member';
  const d = deptLabel(w.dept || w.department) || 'General';
  const jd = w.date_of_joining || w.created_at || '';
  const joiningDate = jd ? new Date(jd + (jd.includes('T') ? '' : 'T00:00:00')).toLocaleDateString('en-GB',{ day:'numeric', month:'long', year:'numeric' }) : '______________';
  const subj = subjectText || 'ORIGINAL DOCUMENTS ACKNOWLEDGEMENT RECORD';
  const subjDiv = (mTop) => `<div style="text-align:center;font-size:18px;font-weight:700;color:#134987;text-transform:uppercase;letter-spacing:0.5px;margin:${mTop} 0 6px">Subject:- ${subj}</div>`;
  const body = `<div style="padding:10px 0 24px;line-height:1.65;text-align:justify">
<table style="width:100%;border-collapse:collapse;margin-bottom:10px">
<tr><td style="padding:4px 0"><strong>Organization Name:</strong> ${ngo.name}</td></tr>
<tr><td style="padding:4px 0"><strong>Date of Submission:</strong> ${dateText}</td></tr>
</table>
<div style="font-weight:700;color:#134987;margin:14px 0 6px 0">Volunteer Details</div>
<table style="width:100%;border-collapse:collapse;margin-bottom:10px">
<tr><td style="padding:4px 0;width:50%"><strong>Volunteer Name:</strong> ${w.name}</td><td style="padding:4px 0"><strong>Department:</strong> ${d}</td></tr>
<tr><td style="padding:4px 0"><strong>Designation:</strong> ${r}</td><td style="padding:4px 0"><strong>Date of Joining:</strong> ${joiningDate}</td></tr>
</table>
<div style="font-weight:700;color:#134987;margin:14px 0 6px 0">Original Documents Submitted</div>
<table style="width:100%;border-collapse:collapse">
<tr style="background:#134987;color:#fff">
<th style="border:1px solid #134987;color:#fff;padding:7px 6px;text-align:left;width:8%">Sr. No.</th>
<th style="border:1px solid #134987;color:#fff;padding:7px 6px;text-align:left;width:32%">Document Name</th>
<th style="border:1px solid #134987;color:#fff;padding:7px 6px;text-align:center;width:18%">Original Submitted (✓)</th>
<th style="border:1px solid #134987;color:#fff;padding:7px 6px;text-align:center;width:18%">Returned (✓)</th>
<th style="border:1px solid #134987;color:#fff;padding:7px 6px;text-align:left;width:24%">Remarks</th>
</tr>
${rowsHtml}
</table>
<div style="margin:14px 0 0 0;text-align:justify">
<p style="margin:0 0 8px 0"><strong>Volunteer Declaration:</strong> I, <strong>${w.name}</strong>, acknowledge that I have voluntarily submitted the above-mentioned original document(s) to <strong>${ngo.name}</strong> (Organization Name) for verification and employment purposes. I understand that these documents will be kept securely by the organization only for verification or administrative purposes and will be returned to me as per the organization's policy or upon separation from the organization, subject to clearance of all dues and formalities. I confirm that the details mentioned above are correct.</p>
</div>
<table style="width:100%;border-collapse:collapse;margin-top:8px">
<tr><td style="padding:4px 0"><strong>Volunteer Signature:</strong> ${signatureImgHtml(w.signature_url)}</td></tr>
</table>
<div style="margin:18px 0 0 0;border:1px solid #134987;border-radius:6px;padding:14px 18px">
<div style="font-weight:700;color:#134987;text-transform:uppercase;margin-bottom:8px">HR Acknowledgement</div>
<div><strong>Received By (HR):</strong> ${hrNameText}</div>
<div style="margin-top:6px"><strong>Signature:</strong> __________________ &nbsp;&nbsp; <strong>Date:</strong> ____ / ____ / ____</div>
</div>
<div style="margin:14px 0 0 0;border:1px solid #134987;border-radius:6px;padding:14px 18px">
<div style="font-weight:700;color:#134987;text-transform:uppercase;margin-bottom:8px">Document Return Acknowledgement <span style="font-weight:400;text-transform:none">(To be filled at the time of return)</span></div>
<div>I confirm that I have received all my original documents listed above in good condition.</div>
<div style="margin-top:6px"><strong>Volunteer Signature:</strong> ________________ &nbsp;&nbsp; <strong>Date:</strong> _____ / _____ / ______</div>
<div style="margin-top:6px"><strong>Returned By (HR):</strong> ___________________ &nbsp;&nbsp; <strong>HR Signature:</strong> ____________________</div>
</div>
</div>`;
  if (ngoKey === 'BSCT') {
    return buildBSCTLetterhead(subjDiv('0') + body);
  }
  if (ngoKey === 'AFLF') {
    return buildAFLFLetterhead(subjDiv('0') + body);
  }
  if (ngoKey === 'MANN') {
    return buildMANNLetterhead(subjDiv('0') + body);
  }
  return `<div style="width:900px;min-height:1273px;margin:0 auto;background:#fff;font-family:'Times New Roman',Times,serif;font-size:15.5px;color:#111;position:relative;overflow:hidden;display:flex;flex-direction:column;box-sizing:border-box;print-color-adjust:exact;-webkit-print-color-adjust:exact">
<div style="width:794px;margin:0 auto;box-sizing:border-box;flex:1;padding:24px 44px 0;position:relative;z-index:1">
${subjDiv('20')}
${body}
</div>
</div>`;
}

function LetterheadPreview({ ngoKey, children }) {
  const img = LETTERHEAD_IMG[ngoKey];
  const b = LETTERHEAD_BODY[ngoKey];
  return (
    <div style={{ width: 900, height: 1273, margin: '0 auto', position: 'relative', overflow: 'hidden', background: '#fff', boxSizing: 'border-box', fontFamily: "'Times New Roman', Times, serif", color: '#111', printColorAdjust: 'exact', WebkitPrintColorAdjust: 'exact' }}>
      <img src={img} alt="" style={{ position: 'absolute', top: 0, left: 0, width: 900, height: 1273, display: 'block', zIndex: 0 }} />
      <div style={{ position: 'absolute', top: `${b.top}%`, bottom: `${b.bottom}%`, left: `${b.left}%`, right: `${b.right}%`, boxSizing: 'border-box', overflow: 'hidden', zIndex: 1 }}>{children}</div>
    </div>
  );
}

function MANNLetterheadPreview({ children }) {
  return <LetterheadPreview ngoKey="MANN">{children}</LetterheadPreview>;
}

function AFLFLetterheadPreview({ children }) {
  return <LetterheadPreview ngoKey="AFLF">{children}</LetterheadPreview>;
}

function BSCTLetterheadPreview({ children }) {
  return <LetterheadPreview ngoKey="BSCT">{children}</LetterheadPreview>;
}

function ODARDocumentPreview({ w, dateText, hrNameText, subject, ngoKey, docRows, editing, onToggleEdit, onDocRowChange, onAddDocRow, onRemoveDocRow }) {
  const ngo = getNgo(ngoKey);
  const r = deptLabel(w.role || w.department) || 'Team Member';
  const d = deptLabel(w.dept || w.department) || 'General';
  const jd = w.date_of_joining || w.created_at || '';
  const joiningDate = jd ? new Date(jd + (jd.includes('T') ? '' : 'T00:00:00')).toLocaleDateString('en-GB',{ day:'numeric', month:'long', year:'numeric' }) : '______________';
  const subj = subject || 'ORIGINAL DOCUMENTS ACKNOWLEDGEMENT RECORD';
  const inputStyle = { width: '100%', boxSizing: 'border-box', border: '1px solid #999', padding: '6px 8px', fontSize: 12, fontFamily: 'inherit', background: '#fff' };
  const th = { border: '1px solid #134987', color: '#fff', padding: '7px 6px', textAlign: 'center' };
  const thL = { ...th, textAlign: 'left' };
  const td = { border: '1px solid #999', padding: editing ? '5px 8px' : '10px 8px', textAlign: 'center' };
  const tdL = { ...td, textAlign: 'left' };
  const isBSCT = ngoKey === 'BSCT';
  const isAFLF = ngoKey === 'AFLF';
  const isMANN = ngoKey === 'MANN';
  const subjMargin = (isBSCT || isAFLF || isMANN) ? '0 0 6px' : '20px 0 6px';
  const bodyWrap = (
      <>
      <div style={{ textAlign: 'center', fontSize: 18, fontWeight: 700, color: '#134987', textTransform: 'uppercase', letterSpacing: 0.5, margin: subjMargin }}>Subject:- {subj}</div>
      <div style={{ padding: '10px 0 24px', textAlign: 'justify' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 10 }}>
        <tbody>
          <tr><td style={{ padding: '4px 0' }}><strong>Organization Name:</strong> {ngo.name}</td></tr>
          <tr><td style={{ padding: '4px 0' }}><strong>Date of Submission:</strong> {dateText}</td></tr>
        </tbody>
      </table>
      <div style={{ fontWeight: 700, color: '#134987', margin: '14px 0 6px 0' }}>Volunteer Details</div>
      <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 10 }}>
        <tbody>
          <tr><td style={{ padding: '4px 0', width: '50%' }}><strong>Volunteer Name:</strong> {w.name}</td><td style={{ padding: '4px 0' }}><strong>Department:</strong> {d}</td></tr>
          <tr><td style={{ padding: '4px 0' }}><strong>Designation:</strong> {r}</td><td style={{ padding: '4px 0' }}><strong>Date of Joining:</strong> {joiningDate}</td></tr>
        </tbody>
      </table>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, fontWeight: 700, color: '#134987', margin: '14px 0 6px 0' }}>
        <span>Original Documents Submitted</span>
        <button type="button" onClick={onToggleEdit} style={{ fontSize: 11, padding: '3px 10px', borderRadius: 6, border: '1px solid #134987', background: '#fff', color: '#134987', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>{editing ? 'Done' : 'Edit'}</button>
      </div>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr style={{ background: '#134987', color: '#fff' }}>
            <th style={{ ...thL, width: '8%' }}>Sr. No.</th>
            <th style={{ ...thL, width: '32%' }}>Document Name</th>
            <th style={{ ...th, width: '18%' }}>Original Submitted (✓)</th>
            <th style={{ ...th, width: '18%' }}>Returned (✓)</th>
            <th style={{ ...thL, width: '24%' }}>Remarks</th>
          </tr>
        </thead>
        <tbody>
          {docRows.map((row, i) => (
            <tr key={i}>
              <td style={td}>
                {editing
                  ? <input type="number" value={row.sr} onChange={e => onDocRowChange(i, { sr: e.target.value })} style={{ ...inputStyle, width: 56, textAlign: 'center' }} />
                  : row.sr}
              </td>
              <td style={tdL}>
                {editing
                  ? <input type="text" value={row.doc} placeholder="Document name" onChange={e => onDocRowChange(i, { doc: e.target.value })} style={inputStyle} />
                  : (row.doc || '')}
              </td>
              <td style={td}>
                {editing
                  ? <input type="checkbox" checked={row.original} onChange={e => onDocRowChange(i, { original: e.target.checked })} style={{ cursor: 'pointer', width: 16, height: 16 }} />
                  : (row.original ? '✓' : '')}
              </td>
              <td style={td}>
                {editing
                  ? <input type="checkbox" checked={row.returned} onChange={e => onDocRowChange(i, { returned: e.target.checked })} style={{ cursor: 'pointer', width: 16, height: 16 }} />
                  : (row.returned ? '✓' : '')}
              </td>
              <td style={tdL}>
                {editing
                  ? <input type="text" value={row.remarks} placeholder="Remarks" onChange={e => onDocRowChange(i, { remarks: e.target.value })} style={inputStyle} />
                  : (row.remarks || '')}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {editing && (
        <div style={{ margin: '8px 0', display: 'flex', gap: 8 }}>
          <button type="button" onClick={onAddDocRow} style={{ fontSize: 11, padding: '4px 10px', borderRadius: 6, border: '1px solid #999', background: '#fff', color: '#134987', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>+ Add row</button>
          {docRows.length > 1 && (
            <button type="button" onClick={() => onRemoveDocRow(docRows.length - 1)} style={{ fontSize: 11, padding: '4px 10px', borderRadius: 6, border: '1px solid #999', background: '#fff', color: '#b91c1c', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>− Remove last row</button>
          )}
        </div>
      )}
      <div style={{ margin: '14px 0 0 0', textAlign: 'justify' }}>
        <p style={{ margin: '0 0 8px 0' }}><strong>Volunteer Declaration:</strong> I, <strong>{w.name}</strong>, acknowledge that I have voluntarily submitted the above-mentioned original document(s) to <strong>{ngo.name}</strong> (Organization Name) for verification and employment purposes. I understand that these documents will be kept securely by the organization only for verification or administrative purposes and will be returned to me as per the organization's policy or upon separation from the organization, subject to clearance of all dues and formalities. I confirm that the details mentioned above are correct.</p>
      </div>
      <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: 8 }}>
        <tbody>
          <tr><td style={{ padding: '4px 0' }}><strong>Volunteer Signature:</strong> {(() => { const src = safeImgSrc(w.signature_url); return src ? <img src={src} alt="" style={{ height: 34, verticalAlign: 'middle', maxWidth: 190, objectFit: 'contain' }} /> : SIG_LINE_FALLBACK; })()}</td></tr>
        </tbody>
      </table>
      <div style={{ margin: '18px 0 0 0', border: '1px solid #134987', borderRadius: 6, padding: '14px 18px' }}>
        <div style={{ fontWeight: 700, color: '#134987', textTransform: 'uppercase', marginBottom: 8 }}>HR Acknowledgement</div>
        <div><strong>Received By (HR):</strong> {hrNameText}</div>
        <div style={{ marginTop: 6 }}><strong>Signature:</strong> __________________ &nbsp;&nbsp; <strong>Date:</strong> ____ / ____ / ____</div>
      </div>
      <div style={{ margin: '14px 0 0 0', border: '1px solid #134987', borderRadius: 6, padding: '14px 18px' }}>
        <div style={{ fontWeight: 700, color: '#134987', textTransform: 'uppercase', marginBottom: 8 }}>Document Return Acknowledgement <span style={{ fontWeight: 400, textTransform: 'none' }}>(To be filled at the time of return)</span></div>
        <div>I confirm that I have received all my original documents listed above in good condition.</div>
        <div style={{ marginTop: 6 }}><strong>Volunteer Signature:</strong> ________________ &nbsp;&nbsp; <strong>Date:</strong> _____ / _____ / ______</div>
        <div style={{ marginTop: 6 }}><strong>Returned By (HR):</strong> ___________________ &nbsp;&nbsp; <strong>HR Signature:</strong> ____________________</div>
      </div>
      </div>
  </>);
  if (isBSCT) {
    return <BSCTLetterheadPreview>{bodyWrap}</BSCTLetterheadPreview>;
  }
  if (isAFLF) {
    return <AFLFLetterheadPreview>{bodyWrap}</AFLFLetterheadPreview>;
  }
  if (isMANN) {
    return <MANNLetterheadPreview>{bodyWrap}</MANNLetterheadPreview>;
  }
  return (
    <div style={{ width: 900, minHeight: 1273, margin: '0 auto', fontFamily: "'Times New Roman', Times, serif", fontSize: 15.5, lineHeight: 1.65, color: '#111', background: '#fff', position: 'relative', overflow: 'hidden', display: 'flex', flexDirection: 'column', boxSizing: 'border-box', printColorAdjust: 'exact', WebkitPrintColorAdjust: 'exact' }}>
      <div style={{ width: 794, margin: '0 auto', boxSizing: 'border-box', flex: 1, padding: '24px 44px 0', position: 'relative', zIndex: 1 }}>
        {bodyWrap}
      </div>
    </div>
  );
}

function buildExperienceLetterHTML(w, joiningDate, lastWorkingDate, hrNameText, subjectText, designation, ngoKey, refNo, remarks, joiningDateInput) {
  const ngo = getNgo(ngoKey);
  const r = designation || 'Team Member';
  const d = deptLabel(w.dept || w.department) || 'General';
  // A manual joining date overrides the volunteer's record everywhere on the
  // letter — the printed row, the sentence and the tenure calculation.
  const effJd = joiningDateInput ? fmtDate(joiningDateInput, joiningDate) : joiningDate;
  const { expText, expMonths, rows: expRowList } = experienceRows(joiningDateInput || w.date_of_joining || w.created_at || '', lastWorkingDate, [
    ['Name', `<strong>${esc(w.name)}</strong>`],
    ['Designation', `<strong>${esc(r)}</strong>`],
    ['Department', esc(d)],
    ['Date of Joining', `<strong>${esc(effJd)}</strong>`],
    ['Date of Relieving / Last Working Date', `<strong>${esc(lastWorkingDate)}</strong>`],
  ]);
  const expRows = particularsTable(expRowList);
  const remarksBlock = remarks
    ? `<p style="margin:10px 0 0 0"><strong>Remark:</strong> ${esc(remarks)}</p>`
    : '';
  const bodyCore = `<div style="margin-bottom:6px"><strong>Ref. No.:</strong> ${esc(refNo || '____________')}</div>
<div style="margin-bottom:6px"><strong>Date:</strong> ${esc(lastWorkingDate)}</div>
<div style="margin:0 0 6px 0"><strong>TO WHOM IT MAY CONCERN</strong></div>
<p style="margin:0 0 6px 0">This is to certify that <strong>${esc(titleCase(w.name))}</strong> was engaged with <strong>${ngo.name}</strong> from <strong>${esc(effJd)}</strong> to <strong>${esc(lastWorkingDate)}</strong> in the capacity of <strong>${esc(r)}</strong> (<strong>${esc(d)}</strong> Department) &mdash; a <strong>total experience of ${esc(expText)}</strong> (${esc(expMonths)}).</p>
${expRows}
<p style="margin:0 0 6px 0">During the tenure with our organization, they performed the assigned responsibilities with dedication and professionalism. The role involved managing day-to-day tasks, coordinating with clients and team members, preparing necessary documentation, and supporting organizational operations related to the assigned position. They consistently demonstrated sincerity, a positive attitude, and a commitment to delivering quality work.</p>
<p style="margin:0 0 6px 0">Throughout the period of engagement, they maintained good professional conduct, worked effectively as a team member, and carried out the assigned responsibilities to our satisfaction.</p>
<p style="margin:0 0 6px 0">We appreciate the contributions made to ${ngo.name} and thank them for their services. We wish them every success in their future professional endeavors.</p>
<p style="margin:0 0 6px 0">Should you require any further information, please feel free to contact us.</p>
${remarksBlock}`;
  const sig = `<div style="margin-top:12px"><p style="margin:0 0 2px 0">Yours sincerely,</p><p style="margin:10px 0 0 0"><strong>Authorized Signatory</strong><br />Contact No.: +91 8879035035<br />Email: being.sevak@gmail.com</p><p style="margin:8px 0 0 0"><strong>Company Seal &amp; Signature</strong><br /><strong>${ngo.name}</strong></p></div>`;
  if (HAS_LH(ngoKey)) {
    const inner = `<div style="padding:10px 0 24px;text-align:justify;font-size:15.5px;line-height:1.45">
<div style="text-align:center;font-size:16px;font-weight:700;color:#082F5A;text-transform:uppercase;letter-spacing:0.5px;margin:0 0 8px 0">EXPERIENCE LETTER</div>
${bodyCore}
${sig}
</div>`;
    return buildLetterheadLayout(ngoKey, inner);
  }
  return plainShell(ngoKey, ngo, `<div style="text-align:center;font-size:17px;font-weight:700;color:#082F5A;letter-spacing:1px;margin:0 0 8px 0;text-transform:uppercase">EXPERIENCE LETTER</div>
${bodyCore}
${sig}`, 15);
}

function buildWarningLetterHTML(w, dateText, joiningDate, subjectText, ngoKey) {
  const ngo = getNgo(ngoKey);
  const r = deptLabel(w.role || w.department) || 'Team Member';
  const body = `<strong>TO WHOM IT MAY CONCERN</strong>\n\nThis is to inform <strong>${w.name}</strong>, serving with <strong>${ngo.name}</strong> as a <strong>${subjectText || r}</strong> since <strong>${joiningDate}</strong>, regarding the following matter.\n\nIt has come to the notice of the management that on <strong>[date of incident]</strong>, the following conduct/issue was observed:\n\nThis is a violation of the standards of conduct expected from a Sevak of this organization, specifically with regard to <strong>[nature of violation — e.g., attendance, discipline, work conduct]</strong>. Despite prior guidance/counseling on this matter, the concerned conduct has continued, which is a matter of serious concern to the organization.\n\nThey are hereby cautioned to refrain from such conduct going forward.\n\nThis letter should be treated as a formal warning. Any recurrence of similar conduct, or failure to improve within <strong>[timeframe]</strong>, may result in further action, including but not limited to suspension or removal from the Sevak role.\n\nThe organization values the association and hopes this warning will be taken in the right spirit, with a renewed commitment to sincerity and discipline going forward.`;
  if (HAS_LH(ngoKey)) {
    const inner = `<div style="padding:10px 0 24px;text-align:justify">
<div style="text-align:center;font-size:16px;font-weight:700;color:#082F5A;text-transform:uppercase;letter-spacing:0.5px;margin:0 0 8px 0">WARNING LETTER</div>
<div style="text-align:justify;white-space:pre-wrap">${body.replace(/\n/g, '<br />')}</div>
<div style="margin-top:12px"><p style="margin:0 0 2px 0">Yours sincerely,</p><p style="margin:10px 0 0 0"><strong>Authorized Signatory</strong><br />Contact No.: +91 8879035035<br />Email: being.sevak@gmail.com</p><p style="margin:8px 0 0 0"><strong>Company Seal &amp; Signature</strong><br />${ngo.name}</p></div>
</div>`;
    return buildLetterheadLayout(ngoKey, inner);
  }
  return `<div style="max-width:800px;margin:0 auto;font-family:'Times New Roman',Times,serif;font-size:12px;line-height:1.25;color:#000;background:#fff;padding:25px 35px">
<div style="display:flex;align-items:center;margin-bottom:4px">
<img src="${ngo.logo}" alt="${ngo.alt}" style="width:${ngo.logoSize || 100}px;height:auto;margin-right:14px" />
<div style="flex:1;text-align:center"><div style="font-size:18px;font-weight:700;color:#082F5A;letter-spacing:2px;line-height:1.1">${ngo.name}</div></div>
</div>
<div style="height:2px;background:#0B73C4;margin-bottom:12px"></div>
<div style="text-align:center;font-size:14px;font-weight:700;color:#082F5A;margin:0 0 8px 0;text-transform:uppercase">WARNING LETTER</div>
<div style="text-align:justify;white-space:pre-wrap">${body.replace(/\n/g, '<br />')}</div>
<div style="margin-top:12px"><p style="margin:0 0 2px 0">Yours sincerely,</p><p style="margin:10px 0 0 0"><strong>Authorized Signatory</strong><br />Contact No.: +91 8879035035<br />Email: being.sevak@gmail.com</p><p style="margin:8px 0 0 0"><strong>Company Seal &amp; Signature</strong><br />${ngo.name}</p></div>
<div style="margin-top:14px;padding-top:4px"><div style="height:2px;background:#0B73C4;margin-bottom:6px"></div><div style="text-align:center;font-size:12px;color:#6b7280">    <strong>Regd. Address:</strong> ${ngo.address}</div></div>
</div>`;
}

function buildFROWarningLetterHTML(w, dateText, ngoKey, idleSeconds) {
  const ngo = getNgo(ngoKey);
  const d = deptLabel(w.dept || w.department) || 'FRO';
  const employeeId = (w.login_id || w.employee_id || w.employee_no || '').toString() || '____________________';
  // Prefer the day's own figure fetched from the daily-stats endpoint; fall back
  // to anything already on the worker record. null means genuinely unknown, so
  // print the merge placeholder rather than a misleading zero.
  const secs = Number.isFinite(Number(idleSeconds)) ? Number(idleSeconds)
    : w.idle_seconds != null ? Number(w.idle_seconds)
    : w.idle_hours != null ? Number(w.idle_hours) * 3600
    : null;
  const idleText = Number.isFinite(secs) ? (secs / 3600).toFixed(2) : '{{idle_hours}}';
  const content = `<table style="width:100%;border-collapse:collapse;margin:0 0 10px 0">
<tr><td style="padding:3px 0"><strong>Date:</strong> ${dateText}</td></tr>
<tr><td style="padding:3px 0"><strong>Employee Name:</strong> ${w.name}</td></tr>
<tr><td style="padding:3px 0"><strong>Employee ID:</strong> ${employeeId}</td></tr>
<tr><td style="padding:3px 0"><strong>Department:</strong> ${d}</td></tr>
<tr><td style="padding:3px 0"><strong>Idle Time (Working Hours):strong> ${idleText}</td></tr>
</table>
<div style="font-weight:700;color:#082F5A;margin:0 0 8px 0">Subject: Warning Regarding Poor Working Performance</div>
<p style="margin:0 0 8px 0">Dear ${titleCase(w.name)},</p>
<p style="margin:0 0 8px 0">This is to formally warn you regarding the poor performance recorded during your working hours.</p>
<p style="margin:0 0 8px 0">Every FRO is expected to record their activity for the work in hand within four (4) minutes. When that window lapses without any recorded activity, the system marks the FRO as idle and continues to record the idle time for as long as it remains unaddressed. Idle time recorded in this manner is treated as non-productive working time.</p>
<p style="margin:0 0 8px 0">You are required to remain productive throughout the office working hours and actively perform your assigned duties, including CRM activities, calling, follow-ups, data updating and other work assigned by your Team Leader/Management.</p>
<p style="margin:0 0 8px 0">You are hereby instructed to improve your performance immediately and ensure that your working hours are utilized productively. This specifically includes recording an activity within the prescribed four-minute window for each call or follow-up, so that avoidable idle time is not accumulated against you.</p>
<p style="margin:0 0 8px 0">This warning is being issued to give you an opportunity to correct your work pattern immediately. Continued poor performance may result in further disciplinary action.</p>
<p style="margin:0 0 8px 0">We expect you to take this warning seriously and show immediate improvement in your productivity and utilization of working hours.</p>
<div style="margin:16px 0 0 0">
<p style="margin:0 0 6px 0"><strong>For Management</strong></p>
<p style="margin:0 0 6px 0">Name: ____________________<br />Designation: ____________________<br />Signature: ____________________</p>
</div>
<div style="margin:18px 0 0 0;border:1px solid #999;border-radius:6px;padding:12px 16px">
<div style="font-weight:700;color:#082F5A;margin-bottom:6px">Employee Acknowledgement</div>
<p style="margin:0 0 6px 0">I have received and understood this warning letter.</p>
<p style="margin:0 0 6px 0">Employee Name: ${w.name}</p>
<p style="margin:0 0 6px 0">Signature: ____________________</p>
<p style="margin:0 0 6px 0">Date: ____________________</p>
</div>`;
  if (HAS_LH(ngoKey)) {
    const inner = `<div style="padding:10px 0 24px;text-align:justify">
<div style="text-align:center;font-size:16px;font-weight:700;color:#082F5A;text-transform:uppercase;letter-spacing:0.5px;margin:0 0 10px 0">WARNING LETTER</div>
${content}
</div>`;
    return buildLetterheadLayout(ngoKey, inner);
  }
  return `<div style="max-width:800px;margin:0 auto;font-family:'Times New Roman',Times,serif;font-size:12px;line-height:1.4;color:#000;background:#fff;padding:25px 35px">
<div style="display:flex;align-items:center;margin-bottom:4px">
<img src="${ngo.logo}" alt="${ngo.alt}" style="width:${ngo.logoSize || 100}px;height:auto;margin-right:14px" />
<div style="flex:1;text-align:center"><div style="font-size:18px;font-weight:700;color:#082F5A;letter-spacing:2px;line-height:1.1">${ngo.name}</div></div>
</div>
<div style="height:2px;background:#0B73C4;margin-bottom:12px"></div>
<div style="text-align:center;font-size:14px;font-weight:700;color:#082F5A;margin:0 0 8px 0;text-transform:uppercase">WARNING LETTER</div>
<div style="text-align:justify">
${content}
</div>
<div style="margin-top:14px;padding-top:4px"><div style="height:2px;background:#0B73C4;margin-bottom:6px"></div><div style="text-align:center;font-size:12px;color:#6b7280">    <strong>Regd. Address:</strong> ${ngo.address}</div></div>
</div>`;
}

function build(type, w, joiningDate = '', designation = '', ngoKey = 'BSCT') {
  const ngo = getNgo(ngoKey);
  const today = new Date().toLocaleDateString('en-GB',{ day:'numeric', month:'long', year:'numeric' });
  const r = deptLabel(w.role || w.department) || 'Team Member';
  const d = deptLabel(w.dept || w.department) || 'General';
  const body = {
    'Promotion letter': `Dear ${w.name},\n\nCongratulations. In recognition of your strong contribution to the ${d} team, we are pleased to confirm your promotion, effective immediately. Thank you for the energy you bring to your work.\n\nWarm regards,\nThe People Team`,
  }[type];
  return { today, body };
}

function buildStyledLetterHTML(w, letterType, bodyText, dateText, hrNameText, subjectText, showDate = true, ngoKey) {
  const ngo = getNgo(ngoKey);
  const r = deptLabel(w.role || w.department) || 'Team Member';
  const title = letterType.charAt(0).toUpperCase() + letterType.slice(1).toLowerCase();
  const bodyHtml = bodyText.replace(/\n/g, '<br />');
  if (HAS_LH(ngoKey)) {
    const inner = `<div style="padding:10px 0 24px;text-align:justify">
<div style="text-align:center;font-size:16px;font-weight:700;color:#082F5A;text-transform:uppercase;letter-spacing:0.5px;margin:0 0 8px 0">${title}</div>
${showDate ? `<div style="margin:0 0 6px 0"><strong>Date:</strong> ${dateText}</div>` : ''}
<div style="text-align:justify;white-space:pre-wrap">${bodyHtml}</div>
<div style="margin-top:12px"><p style="margin:0 0 2px 0">Yours sincerely,</p><p style="margin:10px 0 0 0"><strong>Authorized Signatory</strong><br />${hrNameText}<br /><strong>${ngo.name}</strong></p></div>
</div>`;
    return buildLetterheadLayout(ngoKey, inner);
  }
  return `<div style="max-width:800px;margin:0 auto;font-family:'Times New Roman',Times,serif;font-size:12px;line-height:1.25;color:#000;background:#fff;padding:25px 35px">
<div style="display:flex;align-items:center;margin-bottom:4px">
<img src="${ngo.logo}" alt="${ngo.alt}" style="width:${ngo.logoSize || 100}px;height:auto;margin-right:14px" />
<div style="flex:1;text-align:center"><div style="font-size:18px;font-weight:700;color:#082F5A;letter-spacing:2px;line-height:1.1">${ngo.name}</div></div>
</div>
<div style="height:2px;background:#0B73C4;margin-bottom:12px"></div>
<div style="text-align:center;font-size:14px;font-weight:700;color:#082F5A;margin:0 0 8px 0;text-transform:uppercase">${title}</div>
${showDate ? `<table style="width:100%;border-collapse:collapse"><tr><td style="padding:0 0 6px 0;font-size:12px"><strong>Date:</strong> ${dateText}</td></tr></table>` : ''}
<div style="text-align:justify;white-space:pre-wrap">${bodyHtml}</div>
<div style="margin-top:12px"><p style="margin:0 0 2px 0">Yours sincerely,</p><p style="margin:10px 0 0 0"><strong>Authorized Signatory</strong><br />${hrNameText}<br /><strong>${ngo.name}</strong></p></div>
<div style="margin-top:14px;padding-top:4px"><div style="height:2px;background:#0B73C4;margin-bottom:6px"></div><div style="text-align:center;font-size:12px;color:#6b7280">    <strong>Regd. Address:</strong> ${ngo.address}</div></div>
</div>`;
}

function buildVolunteerTerminationLetterHTML(w, dateText, hrNameText, ngoKey) {
  const ngo = getNgo(ngoKey);
  const r = deptLabel(w.role || w.department) || 'Team Member';
  const subj = 'Termination of Volunteer Engagement';
  if (HAS_LH(ngoKey)) {
    const inner = `<div style="padding:10px 0 24px;text-align:justify">
<div style="text-align:center;font-size:16px;font-weight:700;color:#082F5A;text-transform:uppercase;letter-spacing:0.5px;margin:0 0 8px 0">Termination of Volunteer Engagement</div>
<div style="margin:0 0 6px 0"><strong>Date:</strong> ${dateText}</div>
<div style="margin-bottom:6px"><strong>Dear ${titleCase(w.name)},</strong></div>
<p style="margin:0 0 6px 0">This is to formally inform you that your volunteer engagement with <strong>${ngo.name}</strong> is terminated with effect from <strong>${dateText}</strong> due to organizational requirements/non-compliance with Trust policies.</p>
<p style="margin:0 0 6px 0">Please note that your association was strictly on a voluntary basis. Therefore, the Trust shall not be liable for any volunteer compensation, termination benefits, expenses, reimbursements, allowances, or other financial claims arising from your termination.</p>
<p style="margin:0 0 6px 0">You are requested to return all Trust property, documents, ID cards, and other materials if any in your possession and discontinue representing the Trust after the effective date.</p>
<p style="margin:0 0 6px 0">We thank you for your contribution and wish you all the best for your future.</p>
<div style="margin-top:12px"><p style="margin:0 0 2px 0">Yours sincerely,</p><p style="margin:10px 0 0 0"><strong>Authorized Signatory</strong><br />Name: __________________<br />Designation: _____________<br />Signature: ______________</p></div>
</div>`;
    return buildLetterheadLayout(ngoKey, inner);
  }
  return `<div style="max-width:800px;margin:0 auto;font-family:'Times New Roman',Times,serif;font-size:12px;line-height:1.25;color:#000;background:#fff;padding:25px 35px">
<div style="display:flex;align-items:center;margin-bottom:4px">
<img src="${ngo.logo}" alt="${ngo.alt}" style="width:${ngo.logoSize || 100}px;height:auto;margin-right:14px" />
<div style="flex:1;text-align:center"><div style="font-size:18px;font-weight:700;color:#082F5A;letter-spacing:2px;line-height:1.1">${ngo.name}</div></div>
</div>
<div style="height:2px;background:#0B73C4;margin-bottom:12px"></div>
<div style="text-align:center;font-size:14px;font-weight:700;color:#082F5A;margin:0 0 8px 0;text-transform:uppercase">Volunteer Termination Letter</div>
<table style="width:100%;border-collapse:collapse"><tr><td style="padding:0 0 6px 0;font-size:12px"><strong>Date:</strong> ${dateText}</td></tr></table>
<div style="margin-bottom:6px"><strong>Dear ${titleCase(w.name)},</strong></div>
<div style="text-align:justify">
<p style="margin:0 0 6px 0">This is to formally inform you that your volunteer engagement with <strong>${ngo.name}</strong> is terminated with effect from <strong>${dateText}</strong> due to organizational requirements/non-compliance with Trust policies.</p>
<p style="margin:0 0 6px 0">Please note that your association was strictly on a voluntary basis. Therefore, the Trust shall not be liable for any volunteer compensation, termination benefits, expenses, reimbursements, allowances, or other financial claims arising from your termination.</p>
<p style="margin:0 0 6px 0">You are requested to return all Trust property, documents, ID cards, and other materials if any in your possession and discontinue representing the Trust after the effective date.</p>
<p style="margin:0 0 6px 0">We thank you for your contribution and wish you all the best for your future.</p>
</div>
<div style="margin-top:12px"><p style="margin:0 0 2px 0">Yours sincerely,</p><p style="margin:10px 0 0 0"><strong>Authorized Signatory</strong><br />Name: __________________<br />Designation: _____________<br />Signature: ______________</p></div>
<div style="margin-top:14px;padding-top:4px"><div style="height:2px;background:#0B73C4;margin-bottom:6px"></div><div style="text-align:center;font-size:12px;color:#6b7280">    <strong>Regd. Address:</strong> ${ngo.address}</div></div>
</div>`;
}

function buildBlankLetterHTML(ngoKey) {
  const ngo = getNgo(ngoKey);
  const watermark = `<div style="position:absolute;top:0;left:0;right:0;bottom:0;display:flex;align-items:center;justify-content:center;pointer-events:none;z-index:2">
<img src="${ngo.logo}" alt="" style="width:340px;height:auto;opacity:0.09;filter:grayscale(1)" />
</div>`;
  if (HAS_LH(ngoKey)) {
    return buildLetterheadLayout(ngoKey, watermark);
  }
  return `<div style="width:900px;height:1273px;margin:0 auto;position:relative;overflow:hidden;background:#fff;box-sizing:border-box;font-family:'Times New Roman',Times,serif;color:#111;print-color-adjust:exact;-webkit-print-color-adjust:exact">
<div style="position:absolute;top:0;left:0;right:0;padding:26px 44px 0">
<div style="display:flex;align-items:center;margin-bottom:4px">
<img src="${ngo.logo}" alt="${ngo.alt}" style="width:${ngo.logoSize || 120}px;height:auto;margin-right:14px" />
<div style="flex:1;text-align:center"><div style="font-size:18px;font-weight:700;color:#082F5A;letter-spacing:2px;line-height:1.1">${ngo.name}</div></div>
</div>
<svg width="100%" height="20" viewBox="0 0 700 20" preserveAspectRatio="none" style="display:block"><path d="M0,10 Q175,20 350,10 Q525,0 700,10 L700,20 L0,20 Z" fill="#0B73C4" /></svg>
<div style="height:2px;background:#F58220"></div>
</div>
${watermark}
<div style="position:absolute;bottom:0;left:0;right:0;padding:0 44px 20px">
<svg width="100%" height="14" viewBox="0 0 700 14" preserveAspectRatio="none" style="display:block;margin-bottom:3px"><path d="M0,7 Q175,0 350,7 Q525,14 700,7 L700,14 L0,14 Z" fill="#0B73C4" /></svg>
<div style="height:2px;background:#F58220;margin-bottom:6px"></div>
<div style="text-align:center;font-size:12px;color:#6b7280"><strong>Regd. Address:</strong> ${ngo.address}</div>
</div>
</div>`;
}

export default function Letters() {
  const { fetchWorkers } = useHR();
  const { isSalaryUnlocked, promptUnlock } = useSalaryPrivacy();
  const [workers, setWorkers] = useState([]);
  const [ngo, setNgo] = useState('BSCT');
  const [name, setName] = useState('');
  const [type, setType] = useState(TYPES[0]);
  const [letterDate, setLetterDate] = useState('');
  const [hrName, setHrName] = useState('');
  const [subject, setSubject] = useState('');
  const [bsd2Amount, setBsd2Amount] = useState(6000);
  const [remarks, setRemarks] = useState('');
  const [ctcMonthly, setCtcMonthly] = useState('');
  const [joiningDateInput, setJoiningDateInput] = useState('');
  const [ctcTouched, setCtcTouched] = useState(false);
  const [salaryMap, setSalaryMap] = useState({});
  const [extraRoles, setExtraRoles] = useState([]);
  const [out, setOut] = useState(null);
  const [showDownload, setShowDownload] = useState(false);
  const [loading, setLoading] = useState(true);
  const pdfRef = useRef(null);
  const pdfDocRef = useRef(null);
  const [docRows, setDocRows] = useState([
    { sr: 1, doc: '', original: false, returned: false, remarks: '' },
    { sr: 2, doc: '', original: false, returned: false, remarks: '' },
    { sr: 3, doc: '', original: false, returned: false, remarks: '' },
  ]);
  const [editDocs, setEditDocs] = useState(false);
  const [sopSel, setSopSel] = useState('');
  // '' | 'text' | 'pdf' — which send is in flight, so both buttons disable
  // instead of letting a double-click fire the same warning twice.
  const [sending, setSending] = useState('');

  useEffect(() => {
    let cancelled = false;
    fetchWorkers().then(data => { if (!cancelled) setWorkers(data); }).catch((err) => { console.error('API error:', err.message); }).finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  // Salary comes from the live payroll record (salary_history -> current_salary
  // via /salary/workers-summary), which sits behind the salary access code, so
  // it is only pulled once that has been unlocked.
  const loadSalaryFromPayroll = () => {
    api('/salary/workers-summary', { _prefix: 'ucs' })
      .then(rows => {
        const map = {};
        for (const r of (Array.isArray(rows) ? rows : [])) map[r.id] = r;
        setSalaryMap(map);
      })
      .catch((err) => { console.error('Salary fetch error:', err.message); });
  };

  const openSalaryPicker = () => promptUnlock(loadSalaryFromPayroll);

  // Auto-fill the CTC box from payroll until HR overrides it by typing.
  useEffect(() => {
    if (ctcTouched) return;
    const w = workers.find(x => x.name === name);
    if (!w) return;
    const rec = salaryMap[w.id];
    setCtcMonthly(rec && rec.current_salary ? String(Math.floor(Number(rec.current_salary) || 0)) : '');
  }, [workers, name, salaryMap, ctcTouched]);

  const capturePdf = async (bodyText, letterType, singlePage = false) => {
    const el = pdfRef.current;
    if (!el) return;
    el.style.display = 'block';
    el.style.padding = '0';
    el.style.width = singlePage ? '900px' : '800px';
    el.innerHTML = bodyText;
    await document.fonts?.ready;
    const imgs = [...el.querySelectorAll('img')];
    await Promise.all(imgs.map(waitForImage));
    await Promise.all(imgs.map(async (img) => {
      const raw = img.getAttribute('src') || '';
      if (!/^https?:\/\//i.test(raw)) return;
      try { img.src = await imgToDataUrl(raw); } catch (_) { /* fall back to CORS-less render */ }
    }));
    await Promise.all(imgs.map(waitForImage));
    const canvas = await html2canvas(el, { scale: 2, backgroundColor: '#ffffff', useCORS: true });
    el.style.display = 'none';
    const pdf = new jsPDF('p', 'mm', 'a4');
    const pdfW = pdf.internal.pageSize.getWidth();
    const pdfH = pdf.internal.pageSize.getHeight();
    const margin = 12;
    const printableW = pdfW - 2 * margin;
    if (singlePage) {
      const naturalH = (canvas.height * pdfW) / canvas.width;
      const scale = Math.min(1, pdfH / naturalH);
      const drawW = pdfW * scale;
      const drawH = naturalH * scale;
      pdf.addImage(canvas.toDataURL('image/jpeg', 0.95), 'JPEG', (pdfW - drawW) / 2, (pdfH - drawH) / 2, drawW, drawH);
    } else {
      const imgH = (canvas.height * printableW) / canvas.width;
      let remainingH = imgH;
      let offsetY = 0;
      for (let page = 0; remainingH > 0; page++) {
        if (page > 0) pdf.addPage();
        const pageH = Math.min(remainingH, pdfH - 2 * margin);
        const srcH = (pageH * canvas.height) / imgH;
        const pageCanvas = document.createElement('canvas');
        pageCanvas.width = canvas.width;
        pageCanvas.height = srcH;
        pageCanvas.getContext('2d').drawImage(canvas, 0, offsetY, canvas.width, srcH, 0, 0, canvas.width, srcH);
        pdf.addImage(pageCanvas.toDataURL('image/jpeg', 0.95), 'JPEG', margin, margin, printableW, pageH);
        offsetY += srcH;
        remainingH -= pageH;
      }
    }
    pdfDocRef.current = pdf;
  };

  const generate = async () => {
    const w = workers.find(x => x.name === name);
    if (!w) return;
    let body, today, odar = null;
    if (type === 'NOBSD') {
      const dateText = letterDate ? new Date(letterDate + 'T00:00:00').toLocaleDateString('en-GB',{ day:'numeric', month:'long', year:'numeric' }) : '{{date}}';
      const hrNameText = hrName || '{{hr_name}}';
      body = buildNoBSDDeclarationHTML(w, dateText, hrNameText, subject, ngo);
      today = dateText;
    } else if (type === 'NOBSD2') {
      const dateText = letterDate ? new Date(letterDate + 'T00:00:00').toLocaleDateString('en-GB',{ day:'numeric', month:'long', year:'numeric' }) : '{{date}}';
      const hrNameText = hrName || '{{hr_name}}';
      body = buildNoBSD2DeclarationHTML(w, dateText, hrNameText, subject, ngo, bsd2Amount);
      today = dateText;
    } else if (type === 'ODAR' || type === 'Doc Submitted') {
      const dateText = letterDate ? new Date(letterDate + 'T00:00:00').toLocaleDateString('en-GB',{ day:'numeric', month:'long', year:'numeric' }) : '{{date}}';
      const hrNameText = hrName || '{{hr_name}}';
      body = buildODARDocumentHTML(w, dateText, hrNameText, subject, ngo, docRows);
      odar = { w, dateText, hrNameText, subject, ngo };
      today = dateText;
    } else if (type === 'Joining letter') {
      const dateText = letterDate ? new Date(letterDate + 'T00:00:00').toLocaleDateString('en-GB',{ day:'numeric', month:'long', year:'numeric' }) : '{{date}}';
      const hrNameText = hrName || '{{hr_name}}';
      body = buildJoiningLetterHTML(w, dateText, hrNameText, subject, ngo);
      today = dateText;
    } else if (type === 'Offer letter') {
      const dateText = letterDate ? new Date(letterDate + 'T00:00:00').toLocaleDateString('en-GB',{ day:'numeric', month:'long', year:'numeric' }) : '{{date}}';
      const hrNameText = hrName || '{{hr_name}}';
      const joiningDateText = letterDate ? new Date(letterDate + 'T00:00:00').toLocaleDateString('en-GB',{ day:'numeric', month:'long', year:'numeric' }) : '{{date_of_joining}}';
      body = buildOfferLetterHTML(w, dateText, joiningDateText, hrNameText, subject, ngo, makeRefNo(ngo, type, letterDate), remarks, ctcMonthly);
      today = dateText;
    } else if (type === 'Relieving letter') {
      const dateText = letterDate ? new Date(letterDate + 'T00:00:00').toLocaleDateString('en-GB',{ day:'numeric', month:'long', year:'numeric' }) : '{{date}}';
      const hrNameText = hrName || '{{hr_name}}';
      body = buildRelievingLetterHTML(w, dateText, hrNameText, subject, ngo, makeRefNo(ngo, type, letterDate), remarks, joiningDateInput);
      today = dateText;
    } else if (type === 'Experience letter') {
      const jd = w.date_of_joining || w.created_at || '';
      const joiningDate = jd ? new Date(jd + (jd.includes('T') ? '' : 'T00:00:00')).toLocaleDateString('en-GB',{ day:'numeric', month:'long', year:'numeric' }) : '{{joining_date}}';
      const lastWorkingDate = letterDate ? new Date(letterDate + 'T00:00:00').toLocaleDateString('en-GB',{ day:'numeric', month:'long', year:'numeric' }) : '{{last_working_date}}';
      const hrNameText = hrName || '{{hr_name}}';
      body = buildExperienceLetterHTML(w, joiningDate, lastWorkingDate, hrNameText, subject, subject, ngo, makeRefNo(ngo, type, letterDate), remarks, joiningDateInput);
      today = lastWorkingDate;
    } else if (type === 'Warning letter') {
      const dateText = letterDate ? new Date(letterDate + 'T00:00:00').toLocaleDateString('en-GB',{ day:'numeric', month:'long', year:'numeric' }) : new Date().toLocaleDateString('en-GB',{ day:'numeric', month:'long', year:'numeric' });
      const jd = w.date_of_joining || w.created_at || '';
      const joiningDate = jd ? new Date(jd + (jd.includes('T') ? '' : 'T00:00:00')).toLocaleDateString('en-GB',{ day:'numeric', month:'long', year:'numeric' }) : '{{joining_date}}';
      const isFro = String(subject || w.role || w.department || '').toLowerCase().trim() === 'fro';
      let idleSeconds = null;
      if (isFro) {
        try {
          const statDate = letterDate || new Date().toLocaleDateString('en-CA');
          const stats = await apiGet(`/ngo-admin/fro-daily-stats?date=${statDate}`);
          const row = (Array.isArray(stats) ? stats : []).find(s => String(s.fro_id) === String(w.id));
          if (row) {
            // 0 is a real reading (worked the whole day); only a missing row or
            // a null/absent column means "unknown". Coalescing to 0 for an
            // absent row would print "0 min idle" on a warning letter, and
            // leaving null is what made these letters show a blank.
            idleSeconds = Number.isFinite(Number(row.idle_seconds)) ? Number(row.idle_seconds) : 0;
          }
        } catch (_e) { idleSeconds = null; }
      }
      body = isFro
        ? buildFROWarningLetterHTML(w, dateText, ngo, idleSeconds)
        : buildWarningLetterHTML(w, dateText, joiningDate, subject, ngo);
      today = dateText;
    } else if (type === 'Volunteer Termination Letter') {
      const dateText = letterDate ? new Date(letterDate + 'T00:00:00').toLocaleDateString('en-GB',{ day:'numeric', month:'long', year:'numeric' }) : new Date().toLocaleDateString('en-GB',{ day:'numeric', month:'long', year:'numeric' });
      const hrNameText = hrName || '{{hr_name}}';
      body = buildVolunteerTerminationLetterHTML(w, dateText, hrNameText, ngo);
      today = dateText;
    } else if (type === 'Blank Letter') {
      const dateText = letterDate ? new Date(letterDate + 'T00:00:00').toLocaleDateString('en-GB',{ day:'numeric', month:'long', year:'numeric' }) : new Date().toLocaleDateString('en-GB',{ day:'numeric', month:'long', year:'numeric' });
      body = buildBlankLetterHTML(ngo);
      today = dateText;
    } else {
      const dateText = letterDate ? new Date(letterDate + 'T00:00:00').toLocaleDateString('en-GB',{ day:'numeric', month:'long', year:'numeric' }) : new Date().toLocaleDateString('en-GB',{ day:'numeric', month:'long', year:'numeric' });
      const hrNameText = hrName || '{{hr_name}}';
      const jd = w.date_of_joining || w.created_at || '';
      const joiningDate = jd ? new Date(jd + (jd.includes('T') ? '' : 'T00:00:00')).toLocaleDateString('en-GB',{ day:'numeric', month:'long', year:'numeric' }) : '{{joining_date}}';
      const result = build(type, w, joiningDate, subject, ngo);
      body = buildStyledLetterHTML(w, type, result.body, dateText, hrNameText, subject, type !== 'Offer letter', ngo);
      today = dateText;
    }
    setOut({ today, body, type, odar });
    setShowDownload(false);
    await capturePdf(body, type, type === 'ODAR' || type === 'Doc Submitted' || type === 'NOBSD' || type === 'NOBSD2' || type === 'Blank Letter' || HAS_LH(ngo));
    setShowDownload(true);
  };

  const downloadPdf = () => {
    if (pdfDocRef.current) {
      pdfDocRef.current.save(`${type.replace(/\s+/g, '_')}.pdf`);
    }
  };

  const cleanPhone = (p) => {
    if (!p) return '';
    let d = String(p).replace(/\D/g, '');
    if (d.length === 10) d = '91' + d;
    return d;
  };

  const selectedWorker = workers.find(x => x.name === name) || null;

  // The message text is identical to what the page has always composed for the
  // wa.me link: heading, then label, then subject, then the body, with the
  // volunteer's name substituted.
  const buildMessageText = () => {
    const sel = HR_MESSAGES.find(m => m.key === sopSel);
    if (!sel) return '';
    return [sel.heading, sel.label, sel.subject, sel.body]
      .filter(Boolean)
      .join('\n\n')
      .replace(/\[Volunteer Name\]/g, name || '[Volunteer Name]');
  };

  // Manual escape hatch: the same text, handed to the volunteer's own WhatsApp
  // so HR can send it by hand when the API is blocked by the 24-hour window.
  const openManualWhatsApp = () => {
    const number = cleanPhone(selectedWorker?.phone);
    if (!number) { toast(`${name} has no phone number on record`, 'error'); return; }
    window.open(`https://wa.me/${number}?text=${encodeURIComponent(buildMessageText() || ' ')}`, '_blank');
  };

  const sendWarningText = async () => {
    if (!sopSel) { toast('Pick a Volunteer Message first', 'error'); return; }
    if (!selectedWorker) return;
    if (sending) return;
    setSending('text');
    try {
      const res = await sendHrWhatsAppText(selectedWorker.id, selectedWorker.name, buildMessageText(), sopSel);
      const label = HR_MESSAGES.find(m => m.key === sopSel)?.label || 'Message';
      toast(res.send_mode === 'template'
        ? `${label} sent (approved template)`
        : `${label} sent to ${selectedWorker.name}`, 'success');
    } catch (err) {
      // hr_outside_window / hr_template_missing are not bugs, they are the
      // documented limit of the Cloud API. Offer the manual link in that case.
      if (err.code === 'hr_outside_window' || err.code === 'hr_template_missing') {
        toast(`${err.message} Use the "Manual" button to send it by hand.`, 'error');
      } else if (err.code === 'hr_phone_missing') {
        toast(err.message, 'error');
      } else {
        toast(err.message || 'Could not send the message', 'error');
      }
    } finally {
      setSending('');
    }
  };

  const sendLetterPdf = async () => {
    if (!selectedWorker) return;
    if (!pdfDocRef.current) { toast('Generate the letter first', 'error'); return; }
    if (sending) return;
    setSending('pdf');
    try {
      // jsPDF's datauristring is base64 with a data: prefix, which is not what
      // the endpoint expects.
      const base64 = String(pdfDocRef.current.output('datauristring') || '').split(',')[1] || '';
      if (!base64) throw new Error('The letter PDF came back empty');
      const caption = buildMessageText();
      const res = await sendHrWhatsAppLetter(selectedWorker.id, selectedWorker.name, type, base64, caption);
      toast(res.send_mode === 'template'
        ? `${type} sent to ${selectedWorker.name} (approved template)`
        : `${type} sent to ${selectedWorker.name}`, 'success');
    } catch (err) {
      if (err.code === 'hr_outside_window' || err.code === 'hr_template_missing') {
        toast(`${err.message} Download the PDF and send it from WhatsApp by hand.`, 'error');
      } else if (err.code === 'hr_phone_missing') {
        toast(err.message, 'error');
      } else {
        toast(err.message || 'Could not send the letter', 'error');
      }
    } finally {
      setSending('');
    }
  };

  useEffect(() => {
    if (workers.length && !name) setName(workers[0].name);
  }, [workers, name]);

  useEffect(() => {
    if (showDownload) setShowDownload(false);
  }, [name, type, letterDate, hrName, subject, docRows, bsd2Amount, remarks, ctcMonthly, joiningDateInput]);

  useEffect(() => {
    if (!workers.length) return;
    const t = setTimeout(generate, 400);
    return () => clearTimeout(t);
  }, [ngo, name, type, letterDate, hrName, subject, docRows, bsd2Amount, remarks, ctcMonthly, joiningDateInput, workers]);

  const updateDocRow = (i, patch) => setDocRows(rows => rows.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  const addDocRow = () => setDocRows(rows => [...rows, { sr: rows.length + 1, doc: '', original: false, returned: false, remarks: '' }]);
  const removeDocRow = (i) => setDocRows(rows => rows.filter((_, idx) => idx !== i).map((r, idx) => ({ ...r, sr: idx + 1 })));

  return (
    <div className="card">
      <div className="card-head"><h3>Generate a letter</h3><span className="sub">auto-fills name &amp; role</span></div>
      <div className="card-pad">
        {loading ? (
          <div className="form-row" aria-hidden="true" style={{ flexDirection:'row', flexWrap:'wrap' }}>
            {Array.from({ length: 6 }).map((_, i) => (
              <label className="field" key={i} style={{ flex: 1, minWidth: 150 }}>
                <div className="sk" style={{ width: 60, height: 10, marginBottom: 6, borderRadius: 4 }} />
                <div className="sk" style={{ width: '100%', height: 36, borderRadius: 6 }} />
              </label>
            ))}
          </div>
        ) : (
        <div className="form-row" style={{ flexDirection:'row', flexWrap:'wrap' }}>
          <label className="field" style={{ flex: '0 0 105px', minWidth: 0 }}>NGOs
            <Dropdown value={ngo} onChange={e=>setNgo(e.target.value)} options={['BSCT','AFLF','MANN','UCS']} />
          </label>
          <label className="field" style={{ flex: '0 0 150px', minWidth: 0 }}>Volunteer
            <Dropdown value={name} onChange={e=>setName(e.target.value)} searchable
              options={workers.map(w => ({value: w.name, label: w.name}))} />
          </label>
          <label className="field" style={{ flex: '0 0 150px', minWidth: 0 }}>Letter type
            <Dropdown value={type} onChange={e=>setType(e.target.value)} options={TYPES} />
          </label>
          {type === 'NOBSD2' && (
          <label className="field" style={{ flex: '0 0 150px', minWidth: 0 }}>Monthly Amount (₹)
            <input type="number" min="0" step="100" value={bsd2Amount} onChange={e=>setBsd2Amount(e.target.value === '' ? '' : Math.max(0, Number(e.target.value) || 0))} style={{padding:'9px 11px',border:'1px solid var(--line)',borderRadius:'var(--radius-sm)',fontSize:14,fontFamily:'inherit',outline:'none',background:'var(--paper)',color:'var(--ink)'}} />
          </label>
          )}
          <label className="field" style={{ flex: '0 0 170px', minWidth: 0 }}>Volunteer Message
            <Dropdown value={sopSel} onChange={e=>setSopSel(e.target.value)} placeholder="Select..." options={[{ value: '', label: 'Select...' }, ...HR_MESSAGES.map(m => ({ value: m.key, label: m.label }))]} />
          </label>
          <label className="field" style={{ flex: '0 0 170px', minWidth: 0 }}>
            {type === 'Offer letter' ? 'Joining / Letter Date' : type === 'Joining letter' ? 'Joining Date' : 'Last Working Date'}
            <input type="date" value={letterDate} onChange={e=>setLetterDate(e.target.value)} style={{padding:'9px 11px',border:'1px solid var(--line)',borderRadius:'var(--radius-sm)',fontSize:14,fontFamily:'inherit',outline:'none',background:'var(--paper)',color:'var(--ink)'}} />
          </label>
          {(type === 'Experience letter' || type === 'Relieving letter') && (
          <label className="field" style={{ flex: '0 0 170px', minWidth: 0 }}>Joining Date
            <input type="date" value={joiningDateInput} onChange={e=>setJoiningDateInput(e.target.value)}
              title="Leave empty to use the volunteer's record"
              style={{padding:'9px 11px',border:'1px solid var(--line)',borderRadius:'var(--radius-sm)',fontSize:14,fontFamily:'inherit',outline:'none',background:'var(--paper)',color:'var(--ink)'}} />
          </label>
          )}
          <label className="field" style={{ flex: '0 0 150px', minWidth: 0 }}>HR name
            <Dropdown value={hrName} onChange={e=>setHrName(e.target.value)} options={[{value:'',label:'Select HR...'}, ...[...workers.filter(w => (w.dept||w.department||'').toLowerCase().includes('hr') || (w.dept||w.department||'').toLowerCase().includes('admin')).map(w => ({value: w.name, label: w.name})), {value:'deepak karkera', label:'deepak karkera'}].map(o => o).filter((o, i, arr) => arr.findIndex(x => x.value === o.value) === i)]} />
          </label>
          <label className="field" style={{ flex: '0 0 150px', minWidth: 0 }}>Designation
            <Dropdown value={subject} onChange={e => { if (e.target.value === '__add_role__') { const r = prompt('Enter role name:'); if (r && r.trim()) { setExtraRoles(p => [...p, r.trim()]); setSubject(r.trim()); } } else { setSubject(e.target.value); } }} options={[...[...new Set([...workers.map(w => w.role || w.department || 'Team Member'), ...extraRoles])].sort().map(v => ({ value: v, label: deptLabel(v) })), { value: '__add_role__', label: '+ Add Role' }]} renderOption={o => o.value === '__add_role__' ? <span style={{color:'#dc2626',fontWeight:600}}>+ Add Role</span> : o.label} />
          </label>
          {type === 'Offer letter' && (
          <label className="field" style={{ flex: '0 0 220px', minWidth: 0 }}>Gross Monthly (₹)
            <span style={{ display: 'flex', gap: 6 }}>
              <input type="number" min="0" step="500" value={ctcMonthly} placeholder="₹[XX,XXX]"
                onChange={e=>{ setCtcMonthly(e.target.value); setCtcTouched(true); }}
                style={{flex:1,minWidth:0,padding:'9px 11px',border:'1px solid var(--line)',borderRadius:'var(--radius-sm)',fontSize:14,fontFamily:'inherit',outline:'none',background:'var(--paper)',color:'var(--ink)'}} />
              <button type="button" onClick={openSalaryPicker} title="Pull the current salary from Payroll"
                style={{flexShrink:0,padding:'9px 10px',fontSize:12,fontWeight:600,borderRadius:'var(--radius-sm)',border:'1px solid var(--line)',background:isSalaryUnlocked?'#e8f5e9':'#fff',color:'var(--ink)',cursor:'pointer',fontFamily:'inherit',whiteSpace:'nowrap'}}>
                {isSalaryUnlocked ? 'Payroll ✓' : 'Payroll'}
              </button>
            </span>
          </label>
          )}
          {['Offer letter', 'Relieving letter', 'Experience letter'].includes(type) && (
          <label className="field" style={{ flex: '1 1 260px', minWidth: 0 }}>Remarks (optional)
            <input type="text" value={remarks} onChange={e=>setRemarks(e.target.value)}
              placeholder={type === 'Relieving letter' ? 'e.g. No pending dues; ID card returned' : 'e.g. Note printed below the letter'}
              style={{padding:'9px 11px',border:'1px solid var(--line)',borderRadius:'var(--radius-sm)',fontSize:14,fontFamily:'inherit',outline:'none',background:'var(--paper)',color:'var(--ink)'}} />
          </label>
          )}
          <label className="field btn-field"><span>&nbsp;</span>{showDownload && (
            <span style={{ display: 'inline-flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              <button className="btn btn-primary" onClick={downloadPdf} disabled={!!sending} title="Download PDF" style={{ background:'#dc2626', color:'#fff', border:'1px solid #b91c1c', padding:'9px 11px' }}><FileTxt size={18}/></button>
              {sopSel ? (
                <button className="btn btn-primary" onClick={sendWarningText} disabled={!!sending} title="Send the selected message" style={{ background:'#25D366', color:'#fff', border:'1px solid #1da851', padding:'9px 11px' }}><WhatsApp size={18}/></button>
              ) : (
                <button className="btn btn-primary" onClick={sendLetterPdf} disabled={!!sending} title={`Send the ${type} as a PDF`} style={{ background:'#25D366', color:'#fff', border:'1px solid #1da851', padding:'9px 11px' }}><Send size={18}/></button>
              )}
              <button className="btn" onClick={openManualWhatsApp} disabled={!!sending} title="Open WhatsApp to send by hand" style={{ border:'1px solid var(--line)', background:'var(--paper)', color:'var(--ink)', padding:'9px 11px' }}>Manual</button>
              {sending && <span style={{ fontSize: 12, color: 'var(--muted)' }}>Sending…</span>}
            </span>
          )}</label>
        </div>
        )}

        {out && !sopSel && (
          <div className="letter">
            {(type === 'ODAR' || type === 'Doc Submitted') && out.odar ? (
              <ODARDocumentPreview
                {...out.odar}
                ngoKey={ngo}
                docRows={docRows}
                editing={editDocs}
                onToggleEdit={() => setEditDocs(e => !e)}
                onDocRowChange={updateDocRow}
                onAddDocRow={addDocRow}
                onRemoveDocRow={removeDocRow}
              />
            ) : (
              <div style={{ whiteSpace: 'normal' }} dangerouslySetInnerHTML={{ __html: out.body }} />
            )}
          </div>
        )}
        {sopSel && (() => {
          const m = HR_MESSAGES.find(x => x.key === sopSel);
          if (!m) return null;
          return (
            <div className="letter">
              {m.heading && <div style={{ fontSize: 15, fontWeight: 700, color: '#082F5A', marginBottom: 12 }}>{m.heading}</div>}
              <div style={{ fontWeight: 700, color: '#082F5A', marginBottom: 4 }}>{m.label}</div>
              {m.subject && <div style={{ fontStyle: 'italic', marginBottom: 4 }}>{m.subject}</div>}
              <div style={{ whiteSpace: 'pre-wrap' }}>{m.body.replace(/\[Volunteer Name\]/g, name || '[Volunteer Name]')}</div>
            </div>
          );
        })()}
      </div>
      <div ref={pdfRef} style={{
        position:'fixed', left:'-9999px', top:0,
        fontFamily:'Arial, sans-serif', fontSize:14, lineHeight:1.6,
        padding:40, color:'#000', background:'#fff',
        width:'800px', display:'none'
      }} />
    </div>
  );
}