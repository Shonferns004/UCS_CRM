// Shared signature helpers for the HR panel.
//
// safeImgSrc lives here because it is a security control, not a formatting
// detail: a worker row is database content, and its signature_url is rendered
// into on-screen previews and into HTML that is written into a print window.
// Only plain http(s) URLs are allowed through, and anything containing quote
// or whitespace characters is rejected, so a crafted value cannot break out of
// the attribute or smuggle a javascript: URL.

export function safeImgSrc(url) {
  const s = String(url ?? '').trim();
  if (!/^https?:\/\//i.test(s)) return '';
  // Reject quotes, angle brackets, backticks and whitespace (so a value cannot
  // break out of the attribute). \s must stay a single escape: "\\\\s" here would
  // put a literal backslash AND a literal "s" in the class, and every https URL
  // contains an "s", which rejected all real signatures.
  if (/["'<>\s`]/.test(s)) return '';
  return s;
}

export const SIG_LINE_FALLBACK = '_______________________';

// A stored signature counts as complete only once it is committed. A NULL
// status means the image predates migration 159 and is already a final record,
// so it is treated as signed rather than sending an existing volunteer back to
// re-sign something HR has already been relying on.
export const isSignatureSigned = (w) =>
  !!w?.signature_url && (w.signature_status || 'signed') === 'signed';

export const signatureStatusLabel = (w) => {
  if (!w?.signature_url) return 'Unsigned';
  return isSignatureSigned(w) ? 'Signed' : 'Draft';
};

export const signatureSourceLabel = (s) => (
  s === 'hr_form' ? 'HR Form'
    : s === 'submitted_form' ? 'Online Form'
      : s === 'admin' ? 'HR (on behalf)'
        : null
);

// One source of truth for "what colour is this signature's status", so the list
// chip and the detail card can never drift apart. `cls` is the panel's status
// pill; `chipBg`/`chipFg` are the same colours expressed for .hrf-chip, which
// sits on a different background and cannot simply reuse .pill.
const SIG_STATUS = {
  signed: {
    label: 'Signed', cls: 'pill-green',
    chipBg: 'var(--sage-soft)', chipFg: 'var(--sage)',
    title: 'Signature signed and locked',
  },
  draft: {
    label: 'Draft', cls: 'pill-gold',
    chipBg: '#FAF0DC', chipFg: '#8A6414',
    title: 'Signature saved but not yet submitted',
  },
  unsigned: {
    label: 'Unsigned', cls: 'pill-gray',
    chipBg: 'var(--sand)', chipFg: 'var(--ink-soft)',
    title: 'No signature captured yet',
  },
};

export const signatureStatusPill = (w) => (
  !w?.signature_url ? SIG_STATUS.unsigned
    : isSignatureSigned(w) ? SIG_STATUS.signed
      : SIG_STATUS.draft
);


