// Reading name lists from Excel / CSV files for making many cards at once.
// SheetJS is loaded only when a file is actually opened.

const NAME_HEADERS = [
  'name', 'fullname', 'clientname', 'customername', 'contactname', 'policyholder', 'policyholdername',
  'insured', 'insuredname', 'proposer', 'proposername', 'membername', 'employeename', 'studentname', 'guestname',
]
const clean = (s) => String(s ?? '').toLowerCase().replace(/[^a-z]/g, '')

/** Returns [{ name, rows: string[][] }] for every non-empty sheet. Works for .xlsx, .xls, .ods and .csv. */
export async function readSpreadsheet(file) {
  const XLSX = await import('xlsx')
  const isText = /\.(csv|txt|tsv)$/i.test(file.name)
  // Text files are read as text so Telugu/Hindi names in UTF-8 CSVs come through correctly
  const workbook = isText
    ? XLSX.read(await file.text(), { type: 'string' })
    : XLSX.read(await file.arrayBuffer(), { type: 'array', cellDates: true })
  return workbook.SheetNames
    .map((name) => ({
      name,
      rows: XLSX.utils
        .sheet_to_json(workbook.Sheets[name], { header: 1, raw: false, defval: '', blankrows: false })
        .map((row) => row.map((cell) => String(cell ?? '').trim()))
        .filter((row) => row.some(Boolean)),
    }))
    .filter((sheet) => sheet.rows.length > 0)
}

/** Best guess at whether the first row holds column headings. */
export function looksLikeHeader(rows) {
  const first = rows[0] ?? []
  if (first.some((cell) => NAME_HEADERS.includes(clean(cell)))) return true
  // Headings are short words without digits; data rows usually contain numbers somewhere
  const wordy = first.filter((c) => c && !/\d/.test(c) && c.length <= 30).length
  return rows.length > 1 && wordy === first.filter(Boolean).length && /\d/.test((rows[1] ?? []).join(''))
}

/** Index of the column most likely to hold names. */
export function guessNameColumn(headers, rows) {
  const byHeader = headers.findIndex((h) => NAME_HEADERS.includes(clean(h)))
  if (byHeader >= 0) return byHeader
  const partial = headers.findIndex((h) => clean(h).includes('name'))
  if (partial >= 0) return partial
  // Otherwise: the column whose values look most like names (letters and spaces, no digits)
  let best = 0
  let bestScore = -1
  headers.forEach((_, i) => {
    const sample = rows.slice(0, 20).map((r) => r[i] ?? '')
    const score = sample.filter((v) => v && /^[\p{L}\s.'-]+$/u.test(v) && v.length > 1).length
    if (score > bestScore) { best = i; bestScore = score }
  })
  return best
}

/** "RAVI KUMAR" / "ravi kumar" -> "Ravi Kumar". Initials and other scripts are left alone. */
export function titleCase(name) {
  return name.toLowerCase().replace(/(^|[\s.'-])(\p{L})/gu, (_, sep, ch) => sep + ch.toUpperCase())
}

/**
 * Turns raw names into people: trims, drops blanks and duplicates (case-insensitive).
 * items: [{ name, extra }]. Returns { people, blanks, duplicates }.
 */
export function prepareNames(items) {
  const seen = new Set()
  const people = []
  let blanks = 0
  let duplicates = 0
  for (const item of items) {
    const name = String(item.name ?? '').replace(/\s+/g, ' ').trim()
    if (!name) { blanks++; continue }
    const key = name.toLowerCase()
    if (seen.has(key)) { duplicates++; continue }
    seen.add(key)
    people.push({ id: `${people.length}-${key}`, name, extra: item.extra ?? {}, include: true })
  }
  return { people, blanks, duplicates }
}
