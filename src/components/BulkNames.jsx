import { useEffect, useMemo, useState } from 'react'
import { ArrowDownAZ, CaseSensitive, FileSpreadsheet, RotateCcw, UploadCloud } from 'lucide-react'
import { useToast } from '../context/ToastContext'
import { fetchContacts } from '../lib/data'
import { guessNameColumn, looksLikeHeader, prepareNames, readSpreadsheet, titleCase } from '../lib/spreadsheet'
import { Field, Segmented, Spinner } from './ui'

const MAX_PEOPLE = 1000
const PAGE = 100

/**
 * Step 1 of "many cards": collect the list of people from a file, a pasted list or Contacts,
 * then let the user review it. `value` is { people, columns, note }; onChange receives the same shape.
 */
export default function BulkNames({ value, onChange }) {
  const [source, setSource] = useState('file')
  const hasList = value.people.length > 0

  if (hasList) return <ReviewList value={value} onChange={onChange} />

  return (
    <section className="card wizard-card">
      <div className="section-title-row">
        <h3 className="section-title">Who are the cards for?</h3>
        <Segmented
          value={source}
          onChange={setSource}
          options={[{ value: 'file', label: 'Excel / CSV file' }, { value: 'paste', label: 'Paste names' }, { value: 'contacts', label: 'From contacts' }]}
        />
      </div>
      {source === 'file' && <FileSource onChange={onChange} />}
      {source === 'paste' && <PasteSource onChange={onChange} />}
      {source === 'contacts' && <ContactsSource onChange={onChange} />}
    </section>
  )
}

function finish(onChange, items, columns, origin) {
  const { people, blanks, duplicates } = prepareNames(items)
  const skipped = [blanks && `${blanks} blank`, duplicates && `${duplicates} duplicate`].filter(Boolean).join(' and ')
  onChange({
    people: people.slice(0, MAX_PEOPLE),
    columns,
    note: `${people.length} names ${origin}${skipped ? `. Skipped ${skipped} row${blanks + duplicates > 1 ? 's' : ''}.` : '.'}` +
      (people.length > MAX_PEOPLE ? ` Only the first ${MAX_PEOPLE} are used; split bigger lists into batches.` : ''),
  })
}

// ---------- Excel / CSV ----------
function FileSource({ onChange }) {
  const toast = useToast()
  const [file, setFile] = useState(null) // { fileName, sheets }
  const [sheetIndex, setSheetIndex] = useState(0)
  const [hasHeader, setHasHeader] = useState(true)
  const [nameCol, setNameCol] = useState(0)
  const [extraCols, setExtraCols] = useState([])
  const [busy, setBusy] = useState(false)

  const rows = file?.sheets[sheetIndex]?.rows ?? []
  const width = Math.max(0, ...rows.slice(0, 50).map((r) => r.length))
  const headers = Array.from({ length: width }, (_, i) => (hasHeader ? rows[0]?.[i] : '') || `Column ${String.fromCharCode(65 + (i % 26))}${i >= 26 ? Math.floor(i / 26) : ''}`)
  const dataRows = hasHeader ? rows.slice(1) : rows

  function configure(sheets, index) {
    const r = sheets[index]?.rows ?? []
    const header = looksLikeHeader(r)
    const w = Math.max(0, ...r.slice(0, 50).map((x) => x.length))
    const heads = Array.from({ length: w }, (_, i) => (header ? r[0]?.[i] : '') || '')
    setSheetIndex(index)
    setHasHeader(header)
    setNameCol(guessNameColumn(heads, header ? r.slice(1) : r))
    setExtraCols([])
  }

  async function open(f) {
    if (!f) return
    setBusy(true)
    try {
      const sheets = await readSpreadsheet(f)
      if (!sheets.length) throw new Error('This file has no rows.')
      setFile({ fileName: f.name, sheets })
      configure(sheets, 0)
    } catch (e) {
      toast(`Couldn't read ${f.name}: ${e.message}`, 'error', 7000)
    } finally {
      setBusy(false)
    }
  }

  function use() {
    const items = dataRows.map((r) => ({
      name: r[nameCol] ?? '',
      extra: Object.fromEntries(extraCols.map((c) => [headers[c], r[c] ?? ''])),
    }))
    finish(onChange, items, extraCols.map((c) => headers[c]), `from ${file.fileName}`)
  }

  if (!file) {
    return (
      <>
        <label className={`dropzone ${busy ? 'is-dragging' : ''}`}>
          <input type="file" accept=".xlsx,.xls,.ods,.csv,.txt" hidden onChange={(e) => { open(e.target.files?.[0]); e.target.value = '' }} />
          <UploadCloud size={26} />
          <strong>{busy ? 'Reading the file…' : 'Choose an Excel or CSV file'}</strong>
          <span className="muted small">.xlsx, .xls or .csv. Any layout works: you'll pick which column has the names next.</span>
        </label>
      </>
    )
  }

  const preview = dataRows.slice(0, 6)

  return (
    <div className="bulk-map">
      <div className="bulk-file">
        <FileSpreadsheet size={18} />
        <strong>{file.fileName}</strong>
        <span className="muted small">{dataRows.length} rows</span>
        <button type="button" className="btn btn-link btn-xs" onClick={() => setFile(null)}>Choose a different file</button>
      </div>

      <div className="form-grid">
        {file.sheets.length > 1 && (
          <Field label="Sheet">
            <select value={sheetIndex} onChange={(e) => configure(file.sheets, Number(e.target.value))}>
              {file.sheets.map((s, i) => <option key={s.name} value={i}>{s.name} ({s.rows.length} rows)</option>)}
            </select>
          </Field>
        )}
        <Field label="Which column has the names?" hint="We picked the most likely one. Check the sample below.">
          <select value={nameCol} onChange={(e) => setNameCol(Number(e.target.value))}>
            {headers.map((h, i) => <option key={i} value={i}>{h}{rows[hasHeader ? 1 : 0]?.[i] ? `  (e.g. ${rows[hasHeader ? 1 : 0][i]})` : ''}</option>)}
          </select>
        </Field>
      </div>

      <label className="check">
        <input type="checkbox" checked={hasHeader} onChange={(e) => setHasHeader(e.target.checked)} />
        <span>The first row has column headings (not a person)</span>
      </label>

      {headers.length > 1 && (
        <div className="field">
          <span className="field-label">Also put other columns on the card? (optional)</span>
          <div className="chip-grid">
            {headers.map((h, i) => i !== nameCol && (
              <button key={i} type="button" className={`chip chip-button ${extraCols.includes(i) ? 'is-on' : ''}`}
                onClick={() => setExtraCols((c) => (c.includes(i) ? c.filter((x) => x !== i) : [...c, i]))}>
                {h}
              </button>
            ))}
          </div>
          <span className="field-hint">For example Designation or City. You can place them on the card in the next step.</span>
        </div>
      )}

      <div className="table-wrap table-scroll">
        <table className="table">
          <thead><tr>{headers.map((h, i) => <th key={i} className={i === nameCol ? 'col-picked' : ''}>{h}{i === nameCol && ' (names)'}</th>)}</tr></thead>
          <tbody>
            {preview.map((r, ri) => (
              <tr key={ri}>{headers.map((_, i) => <td key={i} className={i === nameCol ? 'col-picked' : ''}>{r[i]}</td>)}</tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="row-end">
        <button type="button" className="btn btn-primary" onClick={use} disabled={!dataRows.length}>Use this column</button>
      </div>
    </div>
  )
}

// ---------- Paste ----------
function PasteSource({ onChange }) {
  const [text, setText] = useState('')
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean)
  return (
    <>
      <Field label="One name per line" hint="Tip: copy a column straight from Excel or Google Sheets and paste it here.">
        <textarea rows={10} value={text} onChange={(e) => setText(e.target.value)} placeholder={'Ravi Kumar\nPriya Sharma\nAnil Reddy'} autoFocus />
      </Field>
      <div className="row-end">
        <button type="button" className="btn btn-primary" disabled={!lines.length} onClick={() => finish(onChange, lines.map((name) => ({ name })), [], 'pasted')}>
          Use {lines.length || ''} name{lines.length === 1 ? '' : 's'}
        </button>
      </div>
    </>
  )
}

// ---------- Contacts ----------
function ContactsSource({ onChange }) {
  const toast = useToast()
  const [contacts, setContacts] = useState(null)
  const [tags, setTags] = useState([])

  useEffect(() => {
    fetchContacts().then(setContacts).catch((e) => { toast(e.message, 'error'); setContacts([]) })
  }, [toast])

  const allTags = useMemo(() => [...new Set((contacts ?? []).flatMap((c) => c.tags ?? []))].sort(), [contacts])
  if (!contacts) return <Spinner />
  const chosen = contacts.filter((c) => !tags.length || c.tags?.some((t) => tags.includes(t)))

  return (
    <>
      {allTags.length > 0 && (
        <Field label="Only contacts with these tags (optional)">
          <div className="chip-grid">
            {allTags.map((t) => (
              <button key={t} type="button" className={`chip chip-button ${tags.includes(t) ? 'is-on' : ''}`}
                onClick={() => setTags((x) => (x.includes(t) ? x.filter((y) => y !== t) : [...x, t]))}>{t}</button>
            ))}
          </div>
        </Field>
      )}
      <p className="muted">{chosen.length} contact{chosen.length === 1 ? '' : 's'} selected{tags.length ? ` (tagged ${tags.join(', ')})` : ''}.</p>
      <div className="row-end">
        <button type="button" className="btn btn-primary" disabled={!chosen.length}
          onClick={() => finish(onChange, chosen.map((c) => ({ name: c.full_name, extra: { City: c.city ?? '', Company: c.company ?? '' } })), ['City', 'Company'], 'from your contacts')}>
          Use {chosen.length} contact{chosen.length === 1 ? '' : 's'}
        </button>
      </div>
    </>
  )
}

// ---------- Review ----------
function ReviewList({ value, onChange }) {
  const [limit, setLimit] = useState(PAGE)
  const { people, columns, note } = value
  const included = people.filter((p) => p.include).length
  const allOn = included === people.length
  const set = (next) => onChange({ ...value, people: next })

  return (
    <section className="card wizard-card">
      <div className="section-title-row">
        <div>
          <h3 className="section-title">Check the names</h3>
          <p className="muted small">{note}</p>
        </div>
        <div className="row gap">
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => set(people.map((p) => ({ ...p, name: titleCase(p.name) })))} title='"RAVI KUMAR" becomes "Ravi Kumar"'>
            <CaseSensitive size={15} /> Fix capitals
          </button>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => set([...people].sort((a, b) => a.name.localeCompare(b.name)))}>
            <ArrowDownAZ size={15} /> Sort A–Z
          </button>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => onChange({ people: [], columns: [], note: '' })}>
            <RotateCcw size={15} /> Start over
          </button>
        </div>
      </div>

      <div className="audience-summary">
        <div><strong>{included}</strong><span>cards will be made</span></div>
        <div><strong>{people.length - included}</strong><span>left out by you</span></div>
        <div><strong>{people.reduce((m, p) => Math.max(m, p.name.length), 0)}</strong><span>letters in the longest name</span></div>
      </div>

      <div className="table-wrap table-scroll">
        <table className="table">
          <thead>
            <tr>
              <th style={{ width: 36 }}><input type="checkbox" checked={allOn} onChange={() => set(people.map((p) => ({ ...p, include: !allOn })))} aria-label="Select all" /></th>
              <th>Name on the card</th>
              {columns.map((c) => <th key={c}>{c}</th>)}
            </tr>
          </thead>
          <tbody>
            {people.slice(0, limit).map((p, i) => (
              <tr key={p.id} className={p.include ? '' : 'row-muted'}>
                <td><input type="checkbox" checked={p.include} onChange={() => set(people.map((x, j) => (j === i ? { ...x, include: !x.include } : x)))} aria-label={`Include ${p.name}`} /></td>
                <td>
                  <input className="cell-input" value={p.name} onChange={(e) => set(people.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} />
                </td>
                {columns.map((c) => <td key={c} className="muted">{p.extra[c]}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
        {people.length > limit && (
          <div className="table-more"><button type="button" className="btn btn-ghost btn-sm" onClick={() => setLimit(limit + PAGE)}>Show more ({people.length - limit} more)</button></div>
        )}
      </div>
    </section>
  )
}
