import { useEffect, useMemo, useState } from 'react'
import { Ban, Cake, Download, Heart, Pencil, Plus, Search, Trash2, Upload, UploadCloud, UsersRound } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'
import { supabase } from '../lib/supabase'
import { check, chunk, fetchContacts, fetchTeam, upsertContacts } from '../lib/data'
import { MONTHS, formatDayMonth } from '../lib/dates'
import { SAMPLE_CSV, downloadFile, parseContactsCsv, toCsv } from '../lib/csv'
import { chatUrl, formatPhone } from '../lib/whatsapp'
import ContactForm from '../components/ContactForm'
import WhatsAppIcon from '../components/WhatsAppIcon'
import { Avatar, EmptyState, Field, Modal, PageHeader, Spinner, StatCard } from '../components/ui'

const PAGE = 100

export default function Contacts() {
  const { user, canManage } = useAuth()
  const toast = useToast()
  const [contacts, setContacts] = useState(null)
  const [team, setTeam] = useState([])
  const [search, setSearch] = useState('')
  const [quick, setQuick] = useState('all')
  const [tag, setTag] = useState('all')
  const [owner, setOwner] = useState('all')
  const [selected, setSelected] = useState(new Set())
  const [editing, setEditing] = useState(null) // contact | 'new'
  const [importing, setImporting] = useState(false)
  const [limit, setLimit] = useState(PAGE)

  const load = () => fetchContacts().then(setContacts).catch((e) => { toast(e.message, 'error'); setContacts((c) => c ?? []) })
  useEffect(() => {
    load()
    fetchTeam().then(setTeam).catch((e) => toast(e.message, 'error'))
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const month = new Date().getMonth() + 1
  const inMonth = (d) => d && Number(d.slice(5, 7)) === month
  const allTags = useMemo(() => [...new Set((contacts ?? []).flatMap((c) => c.tags ?? []))].sort(), [contacts])
  const nameOf = (id) => team.find((u) => u.id === id)?.full_name

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    const digits = search.replace(/\D/g, '')
    return (contacts ?? []).filter((c) =>
      (!q || c.full_name.toLowerCase().includes(q) || (digits && c.phone.includes(digits)) || c.email?.toLowerCase().includes(q) || c.city?.toLowerCase().includes(q)) &&
      (quick === 'all' ||
        (quick === 'birthdays' && inMonth(c.dob)) ||
        (quick === 'anniversaries' && inMonth(c.anniversary)) ||
        (quick === 'missing' && !c.dob) ||
        (quick === 'optedout' && c.opted_out)) &&
      (tag === 'all' || c.tags?.includes(tag)) &&
      (owner === 'all' || (c.owner_id ?? 'none') === owner),
    )
  }, [contacts, search, quick, tag, owner]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!contacts) return <Spinner />

  const allSelected = filtered.length > 0 && filtered.every((c) => selected.has(c.id))
  const toggle = (id) => setSelected((s) => {
    const n = new Set(s)
    n.has(id) ? n.delete(id) : n.add(id)
    return n
  })

  async function saveContact(values) {
    if (editing === 'new') {
      const { error } = await supabase.from('contacts').insert({ ...values, created_by: user.id })
      if (error) throw error
      toast('Contact added', 'success')
    } else {
      const { error } = await supabase.from('contacts').update(values).eq('id', editing.id)
      if (error) throw error
      toast('Contact updated', 'success')
    }
    load()
  }

  async function runBulk(action, label) {
    const ids = [...selected]
    try {
      for (const part of chunk(ids, 200)) await action(part)
      toast(`${label} ${ids.length} contact${ids.length > 1 ? 's' : ''}`, 'success')
      setSelected(new Set())
    } catch (e) {
      toast(e.message, 'error')
    }
    load()
  }

  // Same change for every selected contact (owner, opt-out)
  const bulkSet = (changes, label) =>
    runBulk(async (ids) => check(await supabase.from('contacts').update(changes).in('id', ids)), label)

  const bulkTag = (tag) =>
    runBulk(async (ids) => check(await supabase.rpc('add_tag_to_contacts', { p_ids: ids, p_tag: tag })), `Tagged "${tag}":`)

  async function bulkDelete() {
    if (!confirm(`Delete ${selected.size} contacts? They will also be removed from all campaigns.`)) return
    try {
      for (const part of chunk([...selected], 200)) check(await supabase.from('contacts').delete().in('id', part))
    } catch (e) {
      toast(e.message, 'error')
      return load()
    }
    toast('Contacts deleted', 'success')
    setSelected(new Set())
    load()
  }

  function exportCsv() {
    const rows = selected.size ? contacts.filter((c) => selected.has(c.id)) : filtered
    downloadFile(toCsv(rows, [
      { label: 'name', value: (c) => c.full_name },
      { label: 'number', value: (c) => `+${c.phone}` },
      { label: 'dob', value: (c) => c.dob ?? '' },
      { label: 'anniversary', value: (c) => c.anniversary ?? '' },
      { label: 'email', value: (c) => c.email ?? '' },
      { label: 'city', value: (c) => c.city ?? '' },
      { label: 'company', value: (c) => c.company ?? '' },
      { label: 'tags', value: (c) => (c.tags ?? []).join(';') },
      { label: 'owner', value: (c) => nameOf(c.owner_id) ?? '' },
      { label: 'opted_out', value: (c) => (c.opted_out ? 'yes' : '') },
    ]), 'contacts.csv')
  }

  return (
    <div className="page">
      <PageHeader
        title={canManage ? 'Contacts' : 'My Contacts'}
        subtitle={canManage ? 'Everyone your team sends greetings to.' : 'Clients assigned to you.'}
        actions={
          <>
            <button className="btn btn-ghost" onClick={exportCsv}><Download size={16} /> Export</button>
            {canManage && <button className="btn btn-ghost" onClick={() => setImporting(true)}><Upload size={16} /> Import CSV</button>}
            {canManage && <button className="btn btn-primary" onClick={() => setEditing('new')}><Plus size={16} /> Add contact</button>}
          </>
        }
      />

      <div className="stat-grid">
        <StatCard label="Total contacts" value={contacts.length} tone="brand" />
        <StatCard label={`Birthdays in ${MONTHS[month - 1]}`} value={contacts.filter((c) => inMonth(c.dob)).length} icon={Cake} tone="danger" />
        <StatCard label={`Anniversaries in ${MONTHS[month - 1]}`} value={contacts.filter((c) => inMonth(c.anniversary)).length} icon={Heart} tone="info" />
        <StatCard label="Opted out" value={contacts.filter((c) => c.opted_out).length} icon={Ban} tone="neutral" />
      </div>

      <section className="card table-card">
        <div className="toolbar">
          <div className="toolbar-left">
            <div className="search-box"><Search size={16} /><input placeholder="Search name, number, email, city…" value={search} onChange={(e) => setSearch(e.target.value)} /></div>
            <select className="select-sm" value={quick} onChange={(e) => setQuick(e.target.value)}>
              <option value="all">All contacts</option>
              <option value="birthdays">Birthdays this month</option>
              <option value="anniversaries">Anniversaries this month</option>
              <option value="missing">Missing birthday</option>
              <option value="optedout">Opted out</option>
            </select>
            <select className="select-sm" value={tag} onChange={(e) => setTag(e.target.value)}>
              <option value="all">All tags</option>
              {allTags.map((t) => <option key={t}>{t}</option>)}
            </select>
            {canManage && (
              <select className="select-sm" value={owner} onChange={(e) => setOwner(e.target.value)}>
                <option value="all">All owners</option>
                {team.map((u) => <option key={u.id} value={u.id}>{u.full_name}</option>)}
                <option value="none">No owner</option>
              </select>
            )}
          </div>
          <span className="muted small">{filtered.length} shown</span>
        </div>

        {canManage && selected.size > 0 && (
          <div className="bulk-bar">
            <strong>{selected.size} selected</strong>
            <select className="select-sm" value="" onChange={(e) => e.target.value && bulkSet({ owner_id: e.target.value === 'none' ? null : e.target.value }, 'Updated owner of')}>
              <option value="">Set owner…</option>
              {team.filter((u) => u.is_active).map((u) => <option key={u.id} value={u.id}>{u.full_name}</option>)}
              <option value="none">No owner</option>
            </select>
            <select className="select-sm" value="" onChange={(e) => {
              let t = e.target.value
              if (t === '__new') t = prompt('New tag name:')?.trim()
              if (t) bulkTag(t)
            }}>
              <option value="">Add tag…</option>
              {allTags.map((t) => <option key={t}>{t}</option>)}
              <option value="__new">+ New tag…</option>
            </select>
            <button className="btn btn-ghost btn-sm" onClick={() => bulkSet({ opted_out: true }, 'Opted out')}>Opt out</button>
            <button className="btn btn-ghost btn-sm" onClick={() => bulkSet({ opted_out: false }, 'Opted in')}>Opt in</button>
            <button className="btn btn-danger-ghost btn-sm" onClick={bulkDelete}><Trash2 size={14} /> Delete</button>
            <button className="btn btn-link btn-sm" onClick={() => setSelected(new Set())}>Clear</button>
          </div>
        )}

        {contacts.length === 0 ? (
          <EmptyState
            icon={UsersRound}
            title={canManage ? 'Build your client directory' : 'No contacts yet'}
            text={canManage ? 'Import a CSV of clients or add them one by one. Contacts can be reused across every campaign.' : 'Contacts appear here once a campaign assigns clients to you.'}
            action={canManage && <button className="btn btn-primary" onClick={() => setImporting(true)}><Upload size={16} /> Import CSV</button>}
          />
        ) : filtered.length === 0 ? (
          <EmptyState icon={Search} title="No contacts match your filters" />
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  {canManage && <th style={{ width: 36 }}><input type="checkbox" checked={allSelected} onChange={() => setSelected(allSelected ? new Set() : new Set(filtered.map((c) => c.id)))} /></th>}
                  <th>Name</th><th>WhatsApp</th><th>Birthday</th><th>Anniversary</th><th>Tags</th>{canManage && <th>Owner</th>}<th />
                </tr>
              </thead>
              <tbody>
                {filtered.slice(0, limit).map((c) => (
                  <tr key={c.id} className={`${selected.has(c.id) ? 'row-selected' : ''} ${c.opted_out ? 'row-muted' : ''}`}>
                    {canManage && <td><input type="checkbox" checked={selected.has(c.id)} onChange={() => toggle(c.id)} /></td>}
                    <td>
                      <div className="cell-with-icon">
                        <Avatar name={c.full_name} size={32} />
                        <div>
                          <div className="cell-title">{c.full_name} {c.opted_out && <span className="pill pill-neutral">Opted out</span>}</div>
                          <div className="muted small">{[c.company, c.city, c.email].filter(Boolean).join(', ') || '—'}</div>
                        </div>
                      </div>
                    </td>
                    <td className="nowrap">{formatPhone(c.phone)}</td>
                    <td className="nowrap">{c.dob ? formatDayMonth(c.dob) : <span className="muted">—</span>}</td>
                    <td className="nowrap">{c.anniversary ? formatDayMonth(c.anniversary) : <span className="muted">—</span>}</td>
                    <td>{c.tags?.map((t) => <span key={t} className="chip chip-sm">{t}</span>)}</td>
                    {canManage && <td className="nowrap">{nameOf(c.owner_id) ?? <span className="muted">—</span>}</td>}
                    <td className="num nowrap">
                      <a className="wa-btn" href={chatUrl(c.phone, '')} target="_blank" rel="noreferrer" title={`Open WhatsApp chat with ${c.full_name}`}><WhatsAppIcon size={18} /></a>
                      <button className="icon-btn" onClick={() => setEditing(c)} title="Edit"><Pencil size={15} /></button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {filtered.length > limit && (
              <div className="table-more"><button className="btn btn-ghost btn-sm" onClick={() => setLimit(limit + PAGE)}>Show more ({filtered.length - limit} remaining)</button></div>
            )}
          </div>
        )}
      </section>

      {editing && (
        <ContactForm
          contact={editing === 'new' ? null : editing}
          notesOnly={!canManage}
          team={canManage ? team : null}
          tagSuggestions={allTags}
          onSave={saveContact}
          onClose={() => setEditing(null)}
        />
      )}
      {importing && <ImportModal team={team} onClose={() => setImporting(false)} onDone={load} />}
    </div>
  )
}

function ImportModal({ team, onClose, onDone }) {
  const { user } = useAuth()
  const toast = useToast()
  const [parsed, setParsed] = useState(null)
  const [error, setError] = useState('')
  const [tags, setTags] = useState('')
  const [owner, setOwner] = useState('')
  const [busy, setBusy] = useState(false)

  async function handle(file) {
    if (!file) return
    setError('')
    try {
      const result = await parseContactsCsv(file)
      if (result.missingColumns.length) {
        setError(`Couldn't find required column(s): ${result.missingColumns.map((c) => (c === 'full_name' ? 'name' : 'number')).join(', ')}. Your columns: ${result.headers.join(', ')}`)
        return setParsed(null)
      }
      setParsed({ fileName: file.name, ...result })
    } catch (e) {
      setError(e.message)
    }
  }

  const valid = parsed?.rows.filter((r) => !r.errors.length) ?? []

  async function run() {
    setBusy(true)
    try {
      const extra = tags.split(',').map((t) => t.trim()).filter(Boolean)
      const saved = await upsertContacts(valid.map((r) => ({ ...r, tags: [...new Set([...r.tags, ...extra])] })), user.id)
      if (owner) {
        const ids = saved.filter((c) => !c.owner_id).map((c) => c.id)
        for (let i = 0; i < ids.length; i += 200) {
          check(await supabase.from('contacts').update({ owner_id: owner }).in('id', ids.slice(i, i + 200)))
        }
      }
      toast(`Imported ${saved.length} contacts`, 'success')
      onDone()
      onClose()
    } catch (e) {
      toast(e.message, 'error')
      setBusy(false)
    }
  }

  const found = parsed ? Object.entries(parsed.found).filter(([, v]) => v).map(([k]) => k.replace('full_name', 'name')) : []

  return (
    <Modal
      title="Import contacts"
      subtitle="Contacts already in your list are matched by WhatsApp number and updated, not added twice."
      onClose={onClose}
      size="lg"
      footer={
        <>
          <button className="btn btn-ghost" onClick={() => downloadFile(SAMPLE_CSV, 'wishdesk-sample.csv')}><Download size={15} /> Sample CSV</button>
          <span className="spacer" />
          <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" disabled={!valid.length || busy} onClick={run}>{busy ? 'Importing…' : `Import ${valid.length} contacts`}</button>
        </>
      }
    >
      <label className="dropzone">
        <input type="file" accept=".csv,text/csv" hidden onChange={(e) => { handle(e.target.files?.[0]); e.target.value = '' }} />
        <UploadCloud size={26} />
        <strong>{parsed ? parsed.fileName : 'Choose a CSV file'}</strong>
        <span className="muted small">Needs name and number columns. Can also include dob, anniversary, email, city, company, tags and notes.</span>
      </label>
      {error && <div className="alert alert-error">{error}</div>}
      {parsed && (
        <>
          <div className="audience-summary">
            <div><strong>{parsed.rows.length}</strong><span>rows</span></div>
            <div><strong>{valid.length}</strong><span>ready</span></div>
            <div><strong>{parsed.rows.length - valid.length}</strong><span>with errors</span></div>
            <div><strong>{valid.filter((r) => r.dob).length}</strong><span>with birthday</span></div>
          </div>
          <p className="muted small">Columns detected: {found.join(', ')}</p>
          {parsed.rows.some((r) => r.errors.length || r.warnings.length) && (
            <details className="error-details">
              <summary>View issues</summary>
              <ul>
                {parsed.rows.map((r, i) => (r.errors.length || r.warnings.length) > 0 && (
                  <li key={i}>Row {i + 2}: {r.full_name || '(no name)'}: {[...r.errors, ...r.warnings].join(', ')}</li>
                ))}
              </ul>
            </details>
          )}
          <div className="form-grid">
            <Field label="Add tags to all (optional)" hint="Comma separated"><input value={tags} onChange={(e) => setTags(e.target.value)} placeholder="e.g. Retail, 2026" /></Field>
            <Field label="Owner for new contacts (optional)">
              <select value={owner} onChange={(e) => setOwner(e.target.value)}>
                <option value="">— Leave unassigned —</option>
                {team.filter((u) => u.is_active).map((u) => <option key={u.id} value={u.id}>{u.full_name}</option>)}
              </select>
            </Field>
          </div>
        </>
      )}
    </Modal>
  )
}
