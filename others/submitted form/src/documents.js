// Which documents a volunteer has handed over, stored in workers.documents_value
// (TEXT, migration 137) with the "Other" name in workers.documents_other
// (migration 160). Mirrors client/src/lib/documents.js and the backend
// validator — this app is deployed on its own and cannot import from the other
// two, so the list and the parser are kept in step by hand.

export const OTHER_DOC = 'Other'

// Exported so the dropdown cannot drift from what the parser accepts.
export const DOC_OPTIONS = ['10th', '12th', 'Degree', 'Voter ID', 'Marriage Certificate', OTHER_DOC]

const OPTIONS = DOC_OPTIONS

const isKnown = (v) => OPTIONS.includes(String(v ?? '').trim())

const cleanOther = (v) => (typeof v === 'string' ? v.trim().slice(0, 120) : '')

// Drops unknown entries, de-duplicates, and returns the selection in canonical
// order so what is stored stays stable whatever order the boxes were ticked in.
const normalizeSelection = (list) => {
  const picked = new Set()
  for (const item of Array.isArray(list) ? list : []) {
    if (isKnown(item)) picked.add(String(item).trim())
  }
  return OPTIONS.filter((opt) => picked.has(opt))
}

// Recovers the entries from a mangled array string such as '["10th","Deg'.
// Reading that as "nothing selected" would silently blank the volunteer's own
// record on the screen that shows it.
const salvageArrayText = (text) =>
  text
    .replace(/[[\]]/g, '')
    .split(',')
    .map((part) => part.trim().replace(/^["']|["']$/g, '').trim())
    .filter(Boolean)

// Accepts an array string, a real array, a legacy single value, or nothing.
// Never throws: a corrupt column must not take down the form.
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

// Inverse of parseDocumentsValue, for saving. The column is TEXT, so the
// selection is stored as an array string; an empty string means "none chosen".
export const serializeSelection = (selected) => {
  const picked = normalizeSelection(selected)
  return picked.length ? JSON.stringify(picked) : ''
}
