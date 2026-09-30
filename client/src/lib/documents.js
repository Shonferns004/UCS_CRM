// Which documents a volunteer has handed over, stored in workers.documents_value
// (TEXT, migration 137) with the "Other" name in workers.documents_other
// (migration 160). Mirrors the canonical list in lib/labels.js and the backend
// validator in backend/src/utils/documentsValue.js — all three have to agree or a
// value a volunteer is allowed to pick would be dropped on save.
//
// documents_value began as a single value and became a JSON array string:
//   ["10th","Degree"]   multi-select, current format
//   "12th"              legacy single value, still present on existing rows
// So nothing here may read the column directly; it has to go through the parser.

export const OTHER_DOC = 'Other'

const OPTIONS = ['10th', '12th', 'Degree', 'Voter ID', 'Marriage Certificate', OTHER_DOC]

const isKnown = (v) => OPTIONS.includes(String(v ?? '').trim())

const cleanOther = (v) => (typeof v === 'string' ? v.trim().slice(0, 120) : '')

// Drops unknown entries, de-duplicates, and returns the selection in canonical
// order so what is stored and what is printed stay stable no matter what order
// the boxes were ticked in.
const normalizeSelection = (list) => {
  const picked = new Set()
  for (const item of Array.isArray(list) ? list : []) {
    if (isKnown(item)) picked.add(String(item).trim())
  }
  return OPTIONS.filter((opt) => picked.has(opt))
}

// Recovers the entries from a mangled array string such as '["10th","Deg'. The
// alternative is reading as "nothing selected", which blanks a volunteer's
// record on every screen that shows it.
const salvageArrayText = (text) =>
  text
    .replace(/[[\]]/g, '')
    .split(',')
    .map((part) => part.trim().replace(/^["']|["']$/g, '').trim())
    .filter(Boolean)

// Accepts an array string, a real array, a legacy single value, or nothing.
// Never throws: a corrupt column must not take down the worker list or a letter.
export const parseDocumentsValue = (raw, otherRaw = '') => {
  let selected = []
  if (Array.isArray(raw)) {
    selected = raw
  } else if (typeof raw === 'string') {
    const trimmed = raw.trim()
    if (trimmed) {
      if (trimmed.startsWith('[')) {
        try {
          const parsed = JSON.parse(trimmed)
          selected = Array.isArray(parsed) ? parsed : [trimmed]
        } catch {
          selected = salvageArrayText(trimmed)
        }
      } else {
        selected = [trimmed]
      }
    }
  } else if (raw != null) {
    selected = [raw]
  }
  return { selected: normalizeSelection(selected), otherText: cleanOther(otherRaw) }
}

// The names that get printed and listed in the "Original Document Submitted"
// table. "Other" becomes the volunteer's own words when they gave one, and is
// dropped when they ticked it but never typed anything — a bare "Other" in a
// legal acknowledgement tells nobody anything.
export const resolveDocumentLabels = (selected, otherText) =>
  normalizeSelection(selected)
    .map((opt) => (opt === OTHER_DOC ? cleanOther(otherText) : opt))
    .filter(Boolean)

// Comma-joined, for the single-line "Documents Needed" summary in the letter.
export const joinDocumentLabels = (selected, otherText) => resolveDocumentLabels(selected, otherText).join(', ')

// The blank rows the table has always defaulted to. Kept as a factory so callers
// never share one array's objects between volunteers.
export const emptyDocRows = (count = 3) =>
  Array.from({ length: count }, (_, i) => ({
    sr: i + 1, doc: '', original: false, returned: false, remarks: '',
  }))

// Rows for the "Original Documents Submitted" table, derived from the saved
// selection. This is the whole data connection: Documents Needed, once saved,
// becomes the table. It lives here rather than in the component so the ODAR
// harness can exercise it directly.
//
// Rules, all driven by `existing` so nothing is hardcoded:
//   - one row per resolved label, in canonical option order
//   - a row whose name survives keeps its Returned/Remarks, so re-deriving after
//     an edit never wipes what HR already filled in by hand
//   - a row from a selected document is pre-checked under "Original Submitted",
//     because selecting a document is the record of having handed the original
//     over; an already-checked row stays checked
//   - padded out to `minRows` with blank, unticked rows so the table keeps the
//     shape it has always had
//   - nothing selected leaves the existing rows exactly as they are, so the
//     original hand-entry workflow is untouched
export const buildDocumentRows = (selected, otherText, existing, minRows = 3) => {
  const labels = resolveDocumentLabels(selected, otherText)
  if (!labels.length) return existing && existing.length ? existing : emptyDocRows(minRows)

  // Keyed by name so ticks carry across a re-derivation. Unnamed rows are left
  // out, otherwise every blank padding row would share the '' key and inherit one
  // another's tick.
  const prior = new Map();
  for (const r of existing || []) {
    const name = String(r.doc || '').trim();
    if (name) prior.set(name, r);
  }

  const rows = labels.map((label, i) => {
    const kept = prior.get(label);
    return {
      sr: i + 1,
      doc: label,
      original: true,
      returned: kept ? !!kept.returned : false,
      remarks: kept ? (kept.remarks || '') : '',
    };
  });

  for (let i = rows.length; i < minRows; i += 1) {
    rows.push({ sr: i + 1, doc: '', original: false, returned: false, remarks: '' });
  }
  return rows
}

// Content-equality for two row arrays. generate() writes these back into state
// that is itself a dependency of the effect that calls generate(), so an
// unchanged result has to compare equal — otherwise every derive would schedule
// another derive and the page would spin.
export const sameDocRows = (a, b) => {
  if (a === b) return true;
  if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
  return a.every((r, i) => {
    const o = b[i];
    return !!r.original === !!o.original
      && !!r.returned === !!o.returned
      && String(r.doc || '') === String(o.doc || '')
      && String(r.remarks || '') === String(o.remarks || '')
      && Number(r.sr) === Number(o.sr);
  });
}
