import { useState } from 'react'
import { Field, Modal } from './ui'
import { TagInput } from './content'
import { formatPhone, normalizePhone } from '../lib/whatsapp'
import { formatDayMonth } from '../lib/dates'

// Add or edit a contact. `team` enables the owner field (managers only).
// `notesOnly`: members may only edit notes; other details are shown read-only.
export default function ContactForm({ contact, team, notesOnly = false, tagSuggestions = [], onSave, onClose }) {
  const [form, setForm] = useState({
    full_name: contact?.full_name ?? '',
    phone: contact?.phone ? formatPhone(contact.phone) : '',
    email: contact?.email ?? '',
    dob: contact?.dob ?? '',
    anniversary: contact?.anniversary ?? '',
    city: contact?.city ?? '',
    company: contact?.company ?? '',
    tags: contact?.tags ?? [],
    owner_id: contact?.owner_id ?? '',
    notes: contact?.notes ?? '',
    opted_out: contact?.opted_out ?? false,
  })
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }))

  async function submit(e) {
    e.preventDefault()
    if (notesOnly) {
      setBusy(true)
      try {
        await onSave({ notes: form.notes.trim() || null })
        onClose()
      } catch (err) {
        setError(err.message)
        setBusy(false)
      }
      return
    }
    const phone = normalizePhone(form.phone)
    if (!form.full_name.trim()) return setError('Name is required')
    if (!phone) return setError('Enter a valid WhatsApp number')
    setBusy(true)
    setError('')
    try {
      const values = {
        full_name: form.full_name.trim(),
        phone,
        email: form.email.trim() || null,
        dob: form.dob || null,
        anniversary: form.anniversary || null,
        city: form.city.trim() || null,
        company: form.company.trim() || null,
        tags: form.tags,
        notes: form.notes.trim() || null,
        opted_out: form.opted_out,
      }
      if (team) values.owner_id = form.owner_id || null
      await onSave(values)
      onClose()
    } catch (err) {
      setError(err.message.includes('duplicate') ? 'A contact with this number already exists' : err.message)
      setBusy(false)
    }
  }

  return (
    <Modal
      title={notesOnly ? 'Notes for this client' : contact ? 'Edit contact' : 'New contact'}
      onClose={onClose}
      size="lg"
      footer={
        <>
          <button type="button" className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" form="contact-form" disabled={busy}>{busy ? 'Saving…' : notesOnly ? 'Save notes' : 'Save contact'}</button>
        </>
      }
    >
      {notesOnly ? (
        <form id="contact-form" onSubmit={submit}>
          <dl className="review-list">
            <div><dt>Name</dt><dd>{contact?.full_name}</dd></div>
            <div><dt>WhatsApp</dt><dd>{formatPhone(contact?.phone)}</dd></div>
            {contact?.dob && <div><dt>Birthday</dt><dd>{formatDayMonth(contact.dob)}</dd></div>}
            {contact?.anniversary && <div><dt>Anniversary</dt><dd>{formatDayMonth(contact.anniversary)}</dd></div>}
          </dl>
          <Field label="Notes" hint="To change other details, ask your team lead or admin.">
            <textarea rows={3} value={form.notes} onChange={set('notes')} placeholder="e.g. Prefers greetings in Telugu" autoFocus />
          </Field>
          {error && <div className="alert alert-error">{error}</div>}
        </form>
      ) : (
      <form id="contact-form" onSubmit={submit} className="form-grid">
        <Field label="Full name *"><input value={form.full_name} onChange={set('full_name')} autoFocus /></Field>
        <Field label="WhatsApp number *" hint="10-digit numbers get the default country code"><input value={form.phone} onChange={set('phone')} placeholder="+91 98765 43210" /></Field>
        <Field label="Birthday"><input type="date" value={form.dob} onChange={set('dob')} /></Field>
        <Field label="Anniversary"><input type="date" value={form.anniversary} onChange={set('anniversary')} /></Field>
        <Field label="Email"><input type="email" value={form.email} onChange={set('email')} /></Field>
        <Field label="City"><input value={form.city} onChange={set('city')} /></Field>
        <Field label="Company"><input value={form.company} onChange={set('company')} /></Field>
        {team && (
          <Field label="Relationship owner">
            <select value={form.owner_id} onChange={set('owner_id')}>
              <option value="">— Unassigned —</option>
              {team.filter((u) => u.is_active || u.id === form.owner_id).map((u) => <option key={u.id} value={u.id}>{u.full_name}</option>)}
            </select>
          </Field>
        )}
        <Field label="Tags" className="span-2">
          <TagInput value={form.tags} onChange={(tags) => setForm((f) => ({ ...f, tags }))} suggestions={tagSuggestions} />
        </Field>
        <Field label="Notes" className="span-2"><textarea rows={2} value={form.notes} onChange={set('notes')} placeholder="e.g. Prefers greetings in Telugu" /></Field>
        <label className="check span-2">
          <input type="checkbox" checked={form.opted_out} onChange={set('opted_out')} />
          <span><strong>Do not message this contact.</strong> They will be left out of every campaign.</span>
        </label>
        {error && <div className="alert alert-error span-2">{error}</div>}
      </form>
      )}
    </Modal>
  )
}
