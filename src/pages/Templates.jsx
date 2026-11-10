import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { LayoutTemplate, PenTool, Pencil, Plus, Rocket, Sparkles, Trash2 } from 'lucide-react'
import { useCardImage } from '../lib/cardRender'
import { useAuth } from '../context/AuthContext'
import { useSettings } from '../context/SettingsContext'
import { useToast } from '../context/ToastContext'
import { supabase } from '../lib/supabase'
import { CAMPAIGN_TYPES } from '../lib/campaignTypes'
import { FESTIVALS } from '../lib/festivals'
import { renderMessage } from '../lib/whatsapp'
import { ImagePicker, MessageEditor, MessagePreview } from '../components/content'
import { EmptyState, Field, Modal, PageHeader, Spinner, Tabs, TypeBadge, TypeIcon } from '../components/ui'

export default function Templates() {
  const toast = useToast()
  const navigate = useNavigate()
  const [templates, setTemplates] = useState(null)
  const [category, setCategory] = useState('all')
  const [editing, setEditing] = useState(null) // template | {} for new

  const load = () => supabase.from('templates').select('*').order('created_at', { ascending: false })
    .then(({ data, error }) => {
      if (error) toast(error.message, 'error')
      setTemplates(data ?? [])
    })
  useEffect(() => { load() }, [])

  if (!templates) return <Spinner />

  const shown = templates.filter((t) => category === 'all' || t.category === category)
  const countOf = (k) => templates.filter((t) => t.category === k).length

  async function remove(t) {
    if (!confirm(`Delete template "${t.name}"? Campaigns already using it are not affected.`)) return
    const { error } = await supabase.from('templates').delete().eq('id', t.id)
    if (error) return toast(error.message, 'error')
    load()
  }

  return (
    <div className="page">
      <PageHeader
        title="Templates"
        subtitle="Reusable greeting cards and messages for every occasion."
        actions={<button className="btn btn-primary" onClick={() => setEditing({})}><Plus size={16} /> New template</button>}
      />

      <Tabs
        value={category}
        onChange={setCategory}
        tabs={[{ value: 'all', label: 'All', count: templates.length }, ...Object.entries(CAMPAIGN_TYPES).map(([k, t]) => ({ value: k, label: t.label, count: countOf(k) }))]}
      />

      {shown.length === 0 ? (
        <section className="card">
          <EmptyState
            icon={LayoutTemplate}
            title={templates.length ? 'No templates in this category' : 'Build your template library'}
            text="Save your best greeting cards once and reuse them for every campaign."
            action={<button className="btn btn-primary" onClick={() => setEditing({ category: category === 'all' ? 'birthday' : category })}><Plus size={16} /> New template</button>}
          />
        </section>
      ) : (
        <div className="template-grid">
          {shown.map((t) => (
            <article key={t.id} className="template-card">
              <div className="template-image">
                {t.image_base64 ? <TemplateThumb template={t} /> : <div className="template-noimg"><TypeIcon type={t.category} size={48} /></div>}
              </div>
              <div className="template-body">
                <div className="template-head">
                  <strong>{t.name}</strong>
                  <TypeBadge type={t.category} size="sm" />
                </div>
                <p className="template-text">{t.message}</p>
                <div className="template-actions">
                  <button className="btn btn-primary btn-sm" onClick={() => navigate(`/campaigns/new?template=${t.id}`)}><Rocket size={14} /> Use</button>
                  {t.image_base64 && <button className="icon-btn" onClick={() => navigate(`/designer/${t.id}`)} title="Place names on the card"><PenTool size={15} /></button>}
                  <button className="icon-btn" onClick={() => setEditing(t)} title="Edit name and message"><Pencil size={15} /></button>
                  <button className="icon-btn" onClick={() => remove(t)} title="Delete"><Trash2 size={15} /></button>
                </div>
              </div>
            </article>
          ))}
        </div>
      )}

      {editing && <TemplateEditor template={editing} onClose={() => setEditing(null)} onSaved={load} />}
    </div>
  )
}

// Card thumbnail with a sample name drawn in, so designed cards look finished
function TemplateThumb({ template }) {
  const { settings } = useSettings()
  const url = useCardImage(template.image_base64, template.layout, { company: settings.company_name })
  return <img src={url} alt="" />
}

function TemplateEditor({ template, onClose, onSaved }) {
  const { user, profile } = useAuth()
  const { settings } = useSettings()
  const toast = useToast()
  const isNew = !template.id
  const [name, setName] = useState(template.name ?? '')
  const [category, setCategory] = useState(template.category ?? 'birthday')
  const [image, setImage] = useState(template.image_base64 ?? null)
  const editorCard = useCardImage(image, template.layout, { company: settings.company_name, sender: profile?.full_name })
  const [message, setMessage] = useState(template.message ?? CAMPAIGN_TYPES[template.category ?? 'birthday'].defaultMessage)
  const [busy, setBusy] = useState(false)

  async function save() {
    setBusy(true)
    const values = { name: name.trim(), category, image_base64: image, message }
    const { error } = isNew
      ? await supabase.from('templates').insert({ ...values, created_by: user.id })
      : await supabase.from('templates').update(values).eq('id', template.id)
    if (error) {
      toast(error.message, 'error')
      return setBusy(false)
    }
    toast('Template saved', 'success')
    onSaved()
    onClose()
  }

  return (
    <Modal
      title={isNew ? 'New template' : 'Edit template'}
      onClose={onClose}
      size="xl"
      footer={
        <>
          <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" disabled={busy || !name.trim() || !message.trim()} onClick={save}>{busy ? 'Saving…' : 'Save template'}</button>
        </>
      }
    >
      <div className="editor-split">
        <div>
          <div className="form-grid">
            <Field label="Template name *"><input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Diwali – gold card" autoFocus /></Field>
            <Field label="Category">
              <select value={category} onChange={(e) => setCategory(e.target.value)}>
                {Object.entries(CAMPAIGN_TYPES).map(([k, t]) => <option key={k} value={k}>{t.label}</option>)}
              </select>
            </Field>
          </div>
          {category === 'festival' && (
            <div className="quick-picks">
              <span className="muted small"><Sparkles size={12} /> Starter text:</span>
              {FESTIVALS.map((f) => (
                <button key={f.name} type="button" className="chip chip-button" onClick={() => { setMessage(f.message); if (!name) setName(f.name) }}>{f.emoji} {f.name}</button>
              ))}
            </div>
          )}
          <Field label="Greeting card"><ImagePicker value={image} onChange={setImage} /></Field>
          <Field label="Message *"><MessageEditor value={message} onChange={setMessage} /></Field>
        </div>
        <div className="preview-col">
          <div className="preview-label">Preview</div>
          <MessagePreview image={editorCard} text={renderMessage(message, { company: settings.company_name, sender: profile?.full_name })} />
        </div>
      </div>
    </Modal>
  )
}
