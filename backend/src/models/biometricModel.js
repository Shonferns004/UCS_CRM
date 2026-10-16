import db from '../config/db.js';
import sharp from 'sharp';

export const enrollBiometric = async (data) => {
  const { data: result, error } = await db
    .from('biometric_credentials')
    .insert(data)
    .select('*')
    .single();
  if (error) throw error;

  // Update beneficiary fingerprint status
  await db
    .from('beneficiaries')
    .update({ fingerprint_status: 'REGISTERED', updated_at: new Date().toISOString() })
    .eq('id', data.beneficiary_id);

  return result;
};

export const getBiometrics = async (beneficiaryId) => {
  const { data, error } = await db
    .from('biometric_credentials')
    .select('*')
    .eq('beneficiary_id', beneficiaryId)
    .order('enrolled_at', { ascending: false });
  if (error) throw error;
  return data || [];
};

export const getBiometricStatus = async (beneficiaryId) => {
  const { data: beneficiary } = await db
    .from('beneficiaries')
    .select('fingerprint_status')
    .eq('id', beneficiaryId)
    .single();

  const { data: credentials } = await db
    .from('biometric_credentials')
    .select('id, finger_position, quality_score, status, enrolled_at')
    .eq('beneficiary_id', beneficiaryId)
    .eq('status', 'ENROLLED');

  return {
    status: beneficiary?.fingerprint_status || 'NOT_REGISTERED',
    enrolled_fingers: credentials || [],
  };
};

/**
 * Latest enrolled fingerprint IMAGE per beneficiary, keyed by beneficiary_id.
 * The raw-format template_data JSON carries the captured scan in its `image`
 * field. That scan is a raw 8-bit grayscale frame (width*height bytes), NOT a
 * PNG/JPEG, so it is re-encoded to a PNG data URL here — the browser cannot
 * display the bare frame. Rows whose template holds no image are skipped.
 */
export const getFingerprintImages = async (beneficiaryIds) => {
  const ids = (beneficiaryIds || [])
    .map((v) => parseInt(v, 10))
    .filter((v) => Number.isFinite(v));
  if (ids.length === 0) return {};

  const { data, error } = await db
    .from('biometric_credentials')
    .select('beneficiary_id, finger_position, template_data, enrolled_at')
    .eq('status', 'ENROLLED')
    .in('beneficiary_id', ids);
  if (error) throw error;

  // Keep only the newest image-bearing credential per beneficiary.
  const latest = {};
  for (const row of data || []) {
    const parsed = parseTemplateData(row.template_data);
    if (!parsed || typeof parsed.image !== 'string' || !parsed.image) continue;
    const prev = latest[row.beneficiary_id];
    if (prev && prev.enrolled_at && row.enrolled_at && new Date(prev.enrolled_at) > new Date(row.enrolled_at)) continue;
    latest[row.beneficiary_id] = { parsed, enrolled_at: row.enrolled_at || null, finger_position: row.finger_position || null };
  }

  const out = {};
  for (const [id, entry] of Object.entries(latest)) {
    const image = await toDisplayableImage(entry.parsed);
    if (!image) continue;
    out[id] = {
      image,
      finger_position: entry.finger_position || entry.parsed.finger || null,
      enrolled_at: entry.enrolled_at,
    };
  }
  return out;
};

// A stored scan may already be a real image (older rows), or the raw grayscale
// frame the current SecuGen capture emits. Return a browser-displayable data URL.
async function toDisplayableImage(parsed) {
  const img = parsed.image;
  if (!img) return null;
  if (img.startsWith('data:')) return img;
  if (img.startsWith('iVBOR')) return `data:image/png;base64,${img}`;
  if (img.startsWith('/9j/')) return `data:image/jpeg;base64,${img}`;
  if (img.startsWith('R0lGOD')) return `data:image/gif;base64,${img}`;
  if (parsed.width && parsed.height) {
    try {
      const png = await sharp(Buffer.from(img, 'base64'), {
        raw: { width: parsed.width, height: parsed.height, channels: 1 },
      }).png().toBuffer();
      return `data:image/png;base64,${png.toString('base64')}`;
    } catch (e) {
      console.error('biometric image convert failed:', e.message);
      return null;
    }
  }
  return null;
}

export const revokeBiometric = async (credentialId) => {
  const { data: credential } = await db
    .from('biometric_credentials')
    .select('beneficiary_id')
    .eq('id', credentialId)
    .single();

  const { data, error } = await db
    .from('biometric_credentials')
    .update({ status: 'REVOKED', revoked_at: new Date().toISOString() })
    .eq('id', credentialId)
    .select('*')
    .single();
  if (error) throw error;

  // Check if any other active credentials remain
  const { count } = await db
    .from('biometric_credentials')
    .select('id', { count: 'exact', head: true })
    .eq('beneficiary_id', credential.beneficiary_id)
    .eq('status', 'ENROLLED');

  if (count === 0) {
    await db
      .from('beneficiaries')
      .update({ fingerprint_status: 'REVOKED', updated_at: new Date().toISOString() })
      .eq('id', credential.beneficiary_id);
  }

  return data;
};

export const verifyBiometric = async (beneficiaryId, fingerPosition, templateData) => {
  // In a real system, this would compare the template against stored templates
  // For now, return a verification result based on stored credentials
  const { data: credential } = await db
    .from('biometric_credentials')
    .select('id, quality_score')
    .eq('beneficiary_id', beneficiaryId)
    .eq('finger_position', fingerPosition)
    .eq('status', 'ENROLLED')
    .single();

  if (!credential) return { matched: false, confidence: 0 };

  // Update last verified timestamp
  await db
    .from('biometric_credentials')
    .update({ last_verified_at: new Date().toISOString() })
    .eq('id', credential.id);

  return { matched: true, confidence: 0.95 };
};

export const identifyBeneficiaryByTemplate = async (templateData) => {
  if (!templateData) return null;

  let { data: credential } = await db
    .from('biometric_credentials')
    .select('beneficiary_id')
    .eq('template_data', templateData)
    .eq('status', 'ENROLLED')
    .limit(1)
    .maybeSingle();

  if (!credential) {
    const result = await db
      .from('biometric_credentials')
      .select('beneficiary_id')
      .eq('credential_reference', templateData)
      .eq('status', 'ENROLLED')
      .limit(1)
      .maybeSingle();
    credential = result.data;
  }

  if (!credential) return null;

  const { data: beneficiary, error } = await db
    .from('beneficiaries')
    .select('*')
    .eq('id', credential.beneficiary_id)
    .single();
  if (error) throw error;

  return beneficiary;
};

/**
 * Parse a stored template_data value.
 * Raw-format rows are JSON blobs ({format:'raw', image, template, width, height, dpi, finger});
 * anything else (legacy encrypted PID blobs) cannot be matched on-device.
 */
const parseTemplateData = (value) => {
  if (!value || typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed.startsWith('{')) return null;
  try {
    return JSON.parse(trimmed);
  } catch {
    return null;
  }
};

/**
 * Return every ENROLLED raw-format credential in the API-friendly shape the
 * app needs to run on-device 1:N matching (SourceAFIS). Legacy (encrypted)
 * rows are skipped because they cannot be matched locally.
 */
export const listEnrolledTemplates = async () => {
  const { data, error } = await db
    .from('biometric_credentials')
    .select('beneficiary_id, finger_position, template_data, template_format')
    .eq('status', 'ENROLLED')
    .in('template_format', ['raw', 'json'])
    .not('template_data', 'is', null);

  if (error) throw error;

  const templates = [];
  for (const row of data || []) {
    const parsed = parseTemplateData(row.template_data);
    if (!parsed || typeof parsed.template !== 'string' || !parsed.template) continue;
    templates.push({
      beneficiary_id: row.beneficiary_id,
      finger_position: row.finger_position || 'UNKNOWN',
      template: parsed.template,
      width: parsed.width ?? null,
      height: parsed.height ?? null,
      dpi: parsed.dpi ?? null,
    });
  }
  return templates;
};
