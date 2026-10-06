const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

const ID_PATTERNS = {
  'Aadhaar Card': { pattern: '^[2-9][0-9]{11}$', msg: 'Aadhaar number must be a 12-digit number.' },
  'PAN Card': { pattern: '^[A-Z]{5}[0-9]{4}[A-Z]$', msg: 'PAN number must be 10 characters (e.g., ABCDE1234F).' },
  'Driving Licence': { pattern: '^[A-Z]{2}[0-9]{2} ?[0-9]{4} ?[0-9]{7}$', msg: 'Driving Licence number format is invalid.' },
  'Passport': { pattern: '^[A-Z][0-9]{7}$', msg: 'Passport number must be 1 letter followed by 7 digits (e.g., A1234567).' },
  'Student ID': null,
  'Other': null
}

export const ID_MAX_LENGTH = {
  'Aadhaar Card': 12,
  'PAN Card': 10,
  'Driving Licence': 17,
  'Passport': 8,
  'Student ID': 30,
  'Other': 50
}

function toTypeArray(value) {
  if (Array.isArray(value)) return value
  return value ? [value] : []
}

export function getIdentityMaxLength(selectedTypes) {
  const types = toTypeArray(selectedTypes)
  if (types.length === 0) return 50
  return Math.max(...types.map((t) => ID_MAX_LENGTH[t] || 50))
}

export async function validateIdentityDocument(file) {
  if (!file) return 'This field is required.'
  if (!(file instanceof File)) return 'Please upload a valid image file.'
  const allowed = ['image/jpeg', 'image/png']
  if (allowed.indexOf(file.type) === -1) return 'Only JPG or PNG images are allowed.'
  const isRealImage = await hasImageMagic(file)
  if (!isRealImage) {
    return 'Uploaded file is not a valid image. Please upload a clear photo of the identity document.'
  }
  const dims = await getImageDimensions(file)
  if (dims && (dims.width < 300 || dims.height < 200)) {
    return 'Uploaded image is too small to be read. Please upload a clear, readable photo of the identity document.'
  }
  return ''
}

function getImageDimensions(file) {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => {
      URL.revokeObjectURL(url)
      resolve({ width: img.naturalWidth, height: img.naturalHeight })
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      resolve(null)
    }
    img.src = url
  })
}

function hasImageMagic(file) {
  return new Promise((resolve) => {
    const reader = new FileReader()
    reader.onloadend = () => {
      const bytes = new Uint8Array(reader.result)
      if (bytes.length < 4) return resolve(false)
      const isJpeg = bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff
      const isPng = bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47
      resolve(isJpeg || isPng)
    }
    reader.onerror = () => resolve(false)
    reader.readAsArrayBuffer(file)
  })
}

export function validateIdentityNumber(value, selectedTypes) {
  const types = toTypeArray(selectedTypes)
  const v = (value || '').toString().trim()
  if (!v) return 'This field is required.'
  if (types.length === 0) return ''
  const upper = v.toUpperCase()
  const matches = types.some((t) => {
    const rule = ID_PATTERNS[t]
    if (!rule) return true
    return new RegExp(rule.pattern).test(upper)
  })
  return matches ? '' : 'Enter a valid number matching the selected identity type above.'
}

export function isEmptyValue(field, value) {
  if (value === null || value === undefined || value === '') return true
  if (Array.isArray(value)) return value.length === 0
  if (typeof value === 'boolean') return !value
  if (value instanceof File) return false
  return false
}

export function validateField(field, value, allValues) {
  if (field.readOnly) return ''

  if (field.custom === 'identityNumber') {
    return validateIdentityNumber(value, allValues ? allValues.identityProofType : [])
  }

  if (field.type === 'file') {
    if (!value) return field.required ? 'This field is required.' : ''
    const okType = !field.accept || field.accept.some(
      (t) => (t.startsWith('image/') && value.type.startsWith('image/')) || t === value.type
    )
    if (!okType) return 'File type not allowed.'
    if (field.maxSizeMB && value.size > field.maxSizeMB * 1024 * 1024) {
      return `File size must be under ${field.maxSizeMB} MB.`
    }
    return ''
  }

  if (field.type === 'checkboxes') {
    if (!value || value.length === 0) {
      return field.required ? 'Please select at least one option.' : ''
    }
    return ''
  }

  if (field.type === 'checkbox') {
    if (field.required && !value) return 'Please tick the box to accept the declaration.'
    return ''
  }

  if (field.type === 'radio' || field.type === 'select') {
    if (field.required && isEmptyValue(field, value)) return 'This field is required.'
    return ''
  }

  const v = (value || '').toString().trim()
  if (field.required && !v) return 'This field is required.'
  if (v) {
    if (field.type === 'email' && !EMAIL_RE.test(v)) return 'Please enter a valid email address.'
    if (field.pattern && !new RegExp(field.pattern).test(v)) {
      return field.errorMsg || 'Invalid input.'
    }
  }
  return ''
}

export function validateSection(fields, values) {
  const errors = {}
  fields.forEach((f) => {
    const err = validateField(f, values[f.id], values)
    if (err) errors[f.id] = err
  })
  return errors
}
