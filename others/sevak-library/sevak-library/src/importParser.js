import * as XLSX from 'xlsx'

const HEADER_ALIASES = {
  fullName: ['member name', 'name', 'full name', 'fullname', 'applicant name'],
  mobile: ['mobile', 'mobile no', 'mobile no.', 'mobile number', 'mobileno', 'phone', 'phone number', 'contact', 'contact no'],
  degree: ['degree', 'education', 'qualification', 'educational qualification'],
  registrationDate: ['registration date', 'reg date', 'registered date'],
  membershipType: ['package', 'membership package', 'plan', 'membership plan', 'package name', 'membership type'],
  membershipFee: ['membership fee', 'fee', 'fees', 'amount', 'fee amount'],
  amountReceived: ['amount received', 'amount paid', 'payment received', 'received'],
  paymentMode: ['payment mode', 'mode of payment', 'payment method'],
  receiptNo: ['receipt no', 'receipt no.', 'receipt number', 'receipt'],
  startDate: ['start date', 'start', 'from', 'from date', 'valid from'],
  endDate: ['end date', 'end', 'to', 'to date', 'expiry date', 'valid until', 'valid till'],
  daysLeft: ['days left', 'days', 'remaining days'],
  remarks: ['remarks', 'remark', 'note', 'notes', 'comments']
}

const MONTHS = {
  jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
  jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11
}

function norm(s) {
  return String(s == null ? '' : s).trim().toLowerCase().replace(/\s+/g, ' ').replace(/[.]+$/, '')
}

function pad(n) {
  return String(n).padStart(2, '0')
}

function toISO(d) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

function excelSerialToISO(serial) {
  const ms = Math.round((serial - 25569) * 86400000)
  const d = new Date(ms)
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`
}

function buildISO(y, m, d) {
  return `${y}-${pad(m)}-${pad(d)}`
}

function parseDateValue(value) {
  if (value == null || value === '') return { iso: '', err: '' }
  if (value instanceof Date) return { iso: toISO(value), err: '' }
  if (typeof value === 'number') {
    if (value > 20000 && value < 60000) return { iso: excelSerialToISO(value), err: '' }
    return { iso: '', err: 'Date is not valid.' }
  }

  const s = String(value).trim()
  if (!s) return { iso: '', err: '' }

  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/)
  if (m) return { iso: buildISO(Number(m[1]), Number(m[2]), Number(m[3])), err: '' }

  m = s.match(/^(\d{1,2})[/.\-](\d{1,2})[/.\-](\d{2,4})$/)
  if (m) {
    const y = m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3])
    return { iso: buildISO(y, Number(m[2]), Number(m[1])), err: '' }
  }

  m = s.match(/^(\d{1,2})\s+([A-Za-z]{3,9})\.?\s+(\d{2,4})$/)
  if (m) {
    const mo = MONTHS[m[2].toLowerCase().slice(0, 3)]
    if (mo === undefined) return { iso: '', err: `Could not parse date "${s}".` }
    const y = m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3])
    return { iso: buildISO(y, mo + 1, Number(m[1])), err: '' }
  }

  return { iso: '', err: `Could not parse date "${s}".` }
}

function cleanMobile(raw) {
  const digits = String(raw == null ? '' : raw).replace(/\D/g, '')
  if (digits.length === 12 && digits.startsWith('91')) return digits.slice(2)
  return digits
}

function cleanNumber(raw) {
  const s = String(raw == null ? '' : raw).replace(/[^0-9.]/g, '')
  if (!s) return null
  const n = Number(s)
  return Number.isFinite(n) ? n : null
}

function buildColMap(headers) {
  const map = {}
  Object.keys(HEADER_ALIASES).forEach((field) => {
    for (const h of headers) {
      const key = norm(h)
      if (!key) continue
      if (HEADER_ALIASES[field].includes(key)) {
        map[field] = h
        break
      }
    }
  })
  return map
}

function processRow(obj, colMap, index) {
  const get = (field) => {
    const h = colMap[field]
    return h != null ? obj[h] : ''
  }

  const issues = []

  const fullName = String(get('fullName') || '').trim()
  if (!fullName) issues.push('Member name is required.')

  const mobile = cleanMobile(get('mobile'))
  if (!mobile) issues.push('Mobile number is required.')
  else if (mobile.length !== 10) issues.push('Mobile must be a 10-digit number.')

  const feeRaw = get('membershipFee')
  const fee = cleanNumber(feeRaw)
  if (feeRaw != null && String(feeRaw).trim() !== '' && fee == null) {
    issues.push(`Invalid fee "${feeRaw}".`)
  }

  const start = parseDateValue(get('startDate'))
  if (start.err) issues.push(start.err)
  const end = parseDateValue(get('endDate'))
  if (end.err) issues.push(end.err)

  const reg = parseDateValue(get('registrationDate'))
  const daysLeftRaw = get('daysLeft')
  const daysLeft = daysLeftRaw == null || String(daysLeftRaw).trim() === '' ? null : cleanNumber(daysLeftRaw)

  const status = String(get('status') || '').trim().toLowerCase()
  if (status && !status.includes('active')) {
    issues.push(`Status "${status}" will be imported as APPROVED.`)
  }

  const amountReceived = String(get('amountReceived') || '').trim() || null
  const paymentMode = String(get('paymentMode') || '').trim() || null
  const receiptNo = String(get('receiptNo') || '').trim() || null
  const degree = String(get('degree') || '').trim() || null
  const remarks = String(get('remarks') || '').trim() || null

  return {
    key: `${index}-${mobile || fullName}`,
    payload: {
      fullName: fullName || null,
      mobile: mobile || null,
      membershipType: String(get('membershipType') || '').trim() || null,
      membershipFee: fee,
      startDate: start.iso || null,
      endDate: end.iso || null,
      data: {
        degree,
        registrationDate: reg.iso || null,
        amountReceived,
        paymentMode,
        receiptNo,
        daysLeft,
        remarks
      }
    },
    issues
  }
}

export async function parseSpreadsheet(file) {
  const buf = await file.arrayBuffer()
  const wb = XLSX.read(buf, { type: 'array', cellDates: true })
  const ws = wb.Sheets[wb.SheetNames[0]]
  const rawRows = XLSX.utils.sheet_to_json(ws, { defval: '', raw: true })
  if (!rawRows || rawRows.length === 0) throw new Error('No data rows found in the file.')

  const colMap = buildColMap(Object.keys(rawRows[0] || {}))
  const found = Object.keys(colMap)
  if (!found.includes('fullName') || !found.includes('mobile')) {
    throw new Error(
      'Could not find the "Member Name" and "Mobile" columns. ' +
      'Make sure the first row of your file contains column headings.'
    )
  }

  return rawRows.map((o, i) => processRow(o, colMap, i))
}
