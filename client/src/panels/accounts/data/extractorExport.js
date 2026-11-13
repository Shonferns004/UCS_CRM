/**
 * Export shapes offered by the Extractor panel.
 *
 * The server owns the actual column order (`backend/src/extractor/constants.js`);
 * these entries only drive the summary shown in the Extension Setup tab, so the
 * two cannot silently disagree about how many columns an export carries.
 */
export const EXPORT_FORMATS = [
  {
    id: 'whatsapp',
    label: 'WhatsApp ready',
    description: 'Lean rows: business name, phone as captured, category, region, address, website, status.',
    columns: 13,
  },
  {
    id: 'full',
    label: 'Full details',
    description: 'Everything stored, including E.164, line type, region source, source URL and timestamps.',
    columns: 23,
  },
];
