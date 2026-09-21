const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function formatDateShort(value) {
  if (!value) return ''
  const d = new Date(value)
  if (isNaN(d.getTime())) return ''
  const dd = String(d.getDate()).padStart(2, '0')
  const mm = MONTHS_SHORT[d.getMonth()]
  const yy = String(d.getFullYear()).slice(-2)
  return `${dd}-${mm}-${yy}`
}

export function formatDate(value) {
  if (!value) return ''
  const d = new Date(value)
  if (isNaN(d.getTime())) return ''
  const yyyy = d.getFullYear()
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd}`
}

export function formatDateTime(value) {
  if (!value) return ''
  const d = new Date(value)
  if (isNaN(d.getTime())) return ''
  const date = formatDate(d)
  const hh = String(d.getHours()).padStart(2, '0')
  const mm = String(d.getMinutes()).padStart(2, '0')
  return `${date} ${hh}:${mm}`
}

export function formatNumber(value) {
  const num = Number(value)
  if (isNaN(num)) return '0'
  return num.toLocaleString('en-IN')
}

export function formatStockPercent(value) {
  return `${value}%`
}

export function getStockLevel(currentStock, lowStockThreshold) {
  if (currentStock === 0) return 'EMPTY'
  if (currentStock <= lowStockThreshold) return 'LOW_STOCK'
  return 'NORMAL'
}

export function getErrorMessage(error) {
  return error?.response?.data?.message || error?.message || 'Something went wrong'
}

export function formatRole(role) {
  if (!role) return ''
  return role.charAt(0).toUpperCase() + role.slice(1).toLowerCase()
}
