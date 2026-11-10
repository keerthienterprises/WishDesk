import Papa from 'papaparse'
import { parseDate } from './dates'
import { normalizePhone } from './whatsapp'

// Header names we recognise (case/space/punctuation-insensitive)
const ALIASES = {
  full_name: ['name', 'fullname', 'clientname', 'customername', 'contactname'],
  phone: ['number', 'phone', 'phonenumber', 'mobile', 'mobilenumber', 'whatsapp', 'whatsappnumber', 'contact', 'contactnumber'],
  dob: ['dob', 'dateofbirth', 'birthday', 'birthdate', 'date'],
  anniversary: ['anniversary', 'anniversarydate', 'weddinganniversary', 'weddingdate', 'marriagedate'],
  email: ['email', 'emailid', 'emailaddress', 'mail'],
  city: ['city', 'location', 'place', 'town'],
  company: ['company', 'organisation', 'organization', 'business', 'firm'],
  tags: ['tags', 'tag', 'group', 'groups', 'segment', 'category', 'type'],
  notes: ['notes', 'note', 'remarks', 'comments'],
}

const clean = (h) => h.toLowerCase().replace(/[^a-z]/g, '')

/**
 * Parse a contacts CSV. `requireDate` = 'dob' | 'anniversary' | null.
 * Returns { rows, missingColumns, headers, found }
 */
export function parseContactsCsv(file, { requireDate = null } = {}) {
  return new Promise((resolve, reject) => {
    Papa.parse(file, {
      header: true,
      skipEmptyLines: 'greedy',
      complete: ({ data, meta }) => {
        const headers = meta.fields ?? []
        const cols = Object.fromEntries(
          Object.entries(ALIASES).map(([field, names]) => [field, headers.find((h) => names.includes(clean(h)))]),
        )
        const required = ['full_name', 'phone', ...(requireDate ? [requireDate] : [])]
        const missingColumns = required.filter((f) => !cols[f])
        if (missingColumns.length) return resolve({ rows: [], missingColumns, headers, found: cols })

        const seen = new Set()
        const rows = data.map((r) => {
          const get = (f) => (cols[f] ? String(r[cols[f]] ?? '').trim() : '')
          const row = {
            full_name: get('full_name'),
            phone: normalizePhone(get('phone')),
            dob: parseDate(get('dob')),
            anniversary: parseDate(get('anniversary')),
            email: get('email') || null,
            city: get('city') || null,
            company: get('company') || null,
            notes: get('notes') || null,
            tags: get('tags').split(/[;|,]/).map((t) => t.trim()).filter(Boolean),
            errors: [],
            warnings: [],
          }
          if (!row.full_name) row.errors.push('Missing name')
          if (!row.phone) row.errors.push(`Invalid number "${get('phone')}"`)
          if (get('dob') && !row.dob) row.warnings.push(`Unreadable birthday "${get('dob')}"`)
          if (get('anniversary') && !row.anniversary) row.warnings.push(`Unreadable anniversary "${get('anniversary')}"`)
          if (requireDate && !row[requireDate]) row.errors.push(requireDate === 'dob' ? 'Missing birthday' : 'Missing anniversary')
          if (row.phone && seen.has(row.phone)) row.errors.push('Duplicate number in file')
          if (row.phone) seen.add(row.phone)
          return row
        })
        resolve({ rows, missingColumns: [], headers, found: cols })
      },
      error: reject,
    })
  })
}

export const SAMPLE_CSV =
  'name,number,dob,anniversary,email,city,tags\n' +
  'Ravi Kumar,9876543210,05-11-1988,12-02-2015,ravi@example.com,Hyderabad,VIP;Retail\n' +
  'Priya Sharma,+91 98765 43211,1992-11-18,,priya@example.com,Bengaluru,Corporate\n'

export function toCsv(rows, columns) {
  return Papa.unparse({ fields: columns.map((c) => c.label), data: rows.map((r) => columns.map((c) => c.value(r))) })
}

export function downloadFile(content, fileName, type = 'text/csv') {
  const url = URL.createObjectURL(content instanceof Blob ? content : new Blob([content], { type }))
  const a = Object.assign(document.createElement('a'), { href: url, download: fileName })
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
