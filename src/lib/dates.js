// All dates are handled as 'YYYY-MM-DD' strings to avoid timezone shifts.
export const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

const MONTH_LOOKUP = Object.fromEntries(
  MONTHS.flatMap((m, i) => [[m.toLowerCase(), i + 1], [m.slice(0, 3).toLowerCase(), i + 1]]),
)

const pad = (n) => String(n).padStart(2, '0')

export const toIso = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
export const todayIso = () => toIso(new Date())

// Local calendar date (YYYY-MM-DD) of a database timestamp
export const localDateOf = (timestamp) => toIso(new Date(timestamp))

export function fromIso(iso) {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d)
}

export function addDays(iso, n) {
  const d = fromIso(iso)
  d.setDate(d.getDate() + n)
  return toIso(d)
}

export function dateParts(iso) {
  const [year, month, day] = iso.split('-').map(Number)
  return { year, month, day }
}

const isLeap = (y) => (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0

// The date a yearly occasion (birthday/anniversary) falls on in `year`.
// Feb 29 is celebrated on Feb 28 in non-leap years.
export function occurrenceIn(iso, year) {
  const { month, day } = dateParts(iso)
  const d = month === 2 && day === 29 && !isLeap(year) ? 28 : day
  return `${year}-${pad(month)}-${pad(d)}`
}

export function yearsBetween(fromIsoDate, onIso) {
  return dateParts(onIso).year - dateParts(fromIsoDate).year
}

// Accepts 1990-03-25, 25-03-1990, 25/03/1990, 25.03.1990, 25 Mar 1990, 25-March-1990.
// Ambiguous numeric dates are read as day-month-year.
export function parseDate(value) {
  const s = String(value ?? '').trim()
  if (!s) return null
  const parts = s.split(/[-/.\s,]+/).filter(Boolean)
  if (parts.length !== 3) return null
  let y, m, d
  if (/^\d{4}$/.test(parts[0])) [y, m, d] = parts
  else [d, m, y] = parts
  m = /^\d+$/.test(m) ? Number(m) : MONTH_LOOKUP[m.toLowerCase()]
  y = Number(y)
  d = Number(d)
  if (y < 100) y += y > new Date().getFullYear() % 100 ? 1900 : 2000
  const date = new Date(y, m - 1, d)
  if (!m || date.getFullYear() !== y || date.getMonth() !== m - 1 || date.getDate() !== d) return null
  return `${y}-${pad(m)}-${pad(d)}`
}

export function formatDate(iso, { year = true, weekday = false } = {}) {
  if (!iso) return '—'
  const { year: y, month, day } = dateParts(iso)
  const base = `${day} ${MONTHS[month - 1].slice(0, 3)}${year ? ` ${y}` : ''}`
  return weekday ? `${fromIso(iso).toLocaleDateString('en-US', { weekday: 'short' })}, ${base}` : base
}

export const formatDayMonth = (iso) => formatDate(iso, { year: false })

export function formatDateTime(ts) {
  if (!ts) return '—'
  return new Date(ts).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })
}

export function relativeDay(iso, from = todayIso()) {
  const diff = Math.round((fromIso(iso) - fromIso(from)) / 86400000)
  if (diff === 0) return 'Today'
  if (diff === 1) return 'Tomorrow'
  if (diff === -1) return 'Yesterday'
  return diff > 0 ? `In ${diff} days` : `${-diff} days ago`
}

export function monthBounds(year, month) {
  const last = new Date(year, month, 0).getDate()
  return [`${year}-${pad(month)}-01`, `${year}-${pad(month)}-${pad(last)}`]
}

export const ordinal = (n) => {
  const s = ['th', 'st', 'nd', 'rd']
  const v = n % 100
  return n + (s[(v - 20) % 10] || s[v] || s[0])
}
