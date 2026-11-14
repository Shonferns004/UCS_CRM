/**
 * Status vocabularies shared by the extractor ingest, the API responses and the
 * panel. Keeping them in one module stops the UI from offering a status the
 * server would reject.
 */

export const LEAD_STATUSES = [
  'new',
  'not_contacted',
  'contacted',
  'interested',
  'follow_up',
  'converted',
  'not_interested',
  'invalid',
];

export const VERIFICATION_STATUSES = ['unverified', 'format_valid', 'verified', 'needs_review'];

export const LEAD_STATUS_LABELS = {
  new: 'New',
  not_contacted: 'Not contacted',
  contacted: 'Contacted',
  interested: 'Interested',
  follow_up: 'Follow up',
  converted: 'Converted',
  not_interested: 'Not interested',
  invalid: 'Invalid',
};

export const VERIFICATION_STATUS_LABELS = {
  unverified: 'Unverified',
  format_valid: 'Format valid',
  verified: 'Verified',
  needs_review: 'Needs review',
};

export const LINE_TYPE_LABELS = {
  mobile: 'Mobile',
  landline: 'Landline',
  toll_free: 'Toll free',
  voip: 'VoIP',
  unknown: 'Unknown',
};

/** Export shapes. Column order here is what the CSV writer and the dialog use. */
export const EXPORT_COLUMNS = {
  whatsapp: [
    { key: 'businessName', label: 'Business name' },
    { key: 'phoneRaw', label: 'Phone (as captured)' },
    { key: 'category', label: 'Category' },
    { key: 'region', label: 'Region' },
    { key: 'aiTags', label: 'AI keywords' },
    { key: 'aiScore', label: 'AI score' },
    { key: 'address', label: 'Address' },
    { key: 'website', label: 'Website' },
    { key: 'email', label: 'Email' },
    { key: 'leadStatus', label: 'Lead status' },
    { key: 'verificationStatus', label: 'Data status' },
    { key: 'source', label: 'Source' },
    { key: 'capturedAt', label: 'Captured at' },
  ],
  full: [
    { key: 'businessName', label: 'Business name' },
    { key: 'phoneRaw', label: 'Phone (as captured)' },
    { key: 'phoneE164', label: 'Phone (E.164)' },
    { key: 'phoneLineType', label: 'Line type' },
    { key: 'category', label: 'Category' },
    { key: 'regionCity', label: 'City' },
    { key: 'regionState', label: 'State' },
    { key: 'regionSource', label: 'Region source' },
    { key: 'address', label: 'Address' },
    { key: 'website', label: 'Website' },
    { key: 'email', label: 'Email' },
    { key: 'leadStatus', label: 'Lead status' },
    { key: 'verificationStatus', label: 'Data status' },
    { key: 'aiTags', label: 'AI keywords' },
    { key: 'aiScore', label: 'AI score' },
    { key: 'aiReason', label: 'AI reason' },
    { key: 'aiStatus', label: 'AI status' },
    { key: 'source', label: 'Source' },
    { key: 'sourceUrl', label: 'Source URL' },
    { key: 'batchId', label: 'Capture batch' },
    { key: 'capturedAt', label: 'Captured at' },
    { key: 'createdAt', label: 'First added' },
    { key: 'updatedAt', label: 'Last updated' },
  ],
};
