import { GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

import db from '../config/db.js';
import { describeStoredObjectUrl } from '../services/receiptFileLink.js';

// The beneficiary-documents bucket is private (public access blocked since the
// 2026-09-30 containment), so a stored object URL answers 403 in an <img>. The
// column keeps holding the plain URL -- a signed one is a capability that would
// freeze at its expiry if persisted -- and only responses carry a signature.
const DOC_URL_TTL_SECONDS = 60 * 60;

const presignDocumentUrl = async (stored) => {
  const value = String(stored ?? '').trim();
  if (!value || value.includes('X-Amz-Signature=')) return value;

  const located = describeStoredObjectUrl(value);
  if (!located) return value;

  const handle = db.storage.raw(located.account);
  if (!handle) return value;

  try {
    return await getSignedUrl(
      handle.client,
      new GetObjectCommand({ Bucket: handle.bucket, Key: located.key }),
      { expiresIn: DOC_URL_TTL_SECONDS },
    );
  } catch (e) {
    console.warn(`[beneficiary documents] could not presign ${located.key}: ${e?.message || e}`);
    return value;
  }
};

// Presigning is local SigV4 maths with no S3 round trip, so signing a list of
// documents costs nothing extra. One unusable row falls back to its stored URL
// instead of failing the whole response.
// A signed URL is never persisted: if a caller echoes one back (a client that
// round-trips the row it just read), strip the query string so the column keeps
// the plain object URL it can re-sign on the next read.
const storedValue = (value) => {
  const s = String(value ?? '');
  return s.includes('X-Amz-Signature=') ? s.split('?')[0] : value;
};

const withSignedUrls = async (rows) =>
  Promise.all(
    (rows || []).map(async (row) => ({
      ...row,
      file_url: row.file_url ? await presignDocumentUrl(row.file_url) : row.file_url,
    })),
  );

export const addDocument = async (beneficiaryId, data) => {
  // Only persist columns that actually exist on beneficiary_documents. The
  // mobile app sends file_base64 + mime_type (used for the S3 upload), which
  // are not table columns — leaking them into the INSERT makes Postgres abort
  // with "column does not exist" and the document is silently lost.
  const row = { beneficiary_id: beneficiaryId };
  for (const key of [
    'document_type', 'file_url', 'file_name', 'document_number',
    'verification_status', 'uploaded_by', 'remarks',
  ]) {
    const v = data[key];
    if (v !== undefined && v !== null && v !== '') row[key] = key === 'file_url' ? storedValue(v) : v;
  }
  row.uploaded_at = new Date().toISOString();
  const { data: result, error } = await db
    .from('beneficiary_documents')
    .insert(row)
    .select('*')
    .single();
  if (error) throw error;
  return result ? (await withSignedUrls([result]))[0] : result;
};

export const getDocuments = async (beneficiaryId) => {
  const { data, error } = await db
    .from('beneficiary_documents')
    .select('*')
    .eq('beneficiary_id', beneficiaryId)
    .order('uploaded_at', { ascending: false });
  if (error) throw error;
  return withSignedUrls(data || []);
};

export const updateDocument = async (id, updates) => {
  if (updates?.file_url !== undefined) updates.file_url = storedValue(updates.file_url);
  const { data, error } = await db
    .from('beneficiary_documents')
    .update(updates)
    .eq('id', id)
    .select('*')
    .single();
  if (error) throw error;
  return data ? (await withSignedUrls([data]))[0] : data;
};

export const removeDocument = async (id) => {
  const { error } = await db.from('beneficiary_documents').delete().eq('id', id);
  if (error) throw error;
  return { message: 'Document removed' };
};
