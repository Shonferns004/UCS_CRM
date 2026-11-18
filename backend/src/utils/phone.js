// One definition of "can this be an Indian mobile?" for the intake paths.
//
// The old last-10 slice turned a US number (+17014676026) into a "valid"
// 10-digit Indian one. This gate keeps that from happening before any
// donor/assignment row is written.
export function isValidIndianMobile(value) {
  const digits = String(value ?? '').replace(/[^0-9]/g, '');
  if (!digits) return false;
  if (digits.length === 10) return true;
  if (digits.length === 12 && digits.startsWith('91')) return true;
  if (digits.length === 11 && digits.startsWith('0')) return true;
  return false;
}

export default isValidIndianMobile;
