import { useRef, useState } from 'react'
import { ImagePlus, Images, RefreshCw, Trash2 } from 'lucide-react'
import { approxKb } from '../lib/image'
import { uploadImage } from '../lib/media'
import { useAuth } from '../context/AuthContext'
import MediaPickerModal from './MediaPickerModal'
import { MESSAGE_VARIABLES } from '../lib/campaignTypes'

// Choose a card image: upload (saved to the image library) or pick one from the library.
// `value` is an image URL (library) or an older base64 data URL.
export function ImagePicker({ value, onChange, allowRemove = true }) {
  const { user } = useAuth()
  const [error, setError] = useState('')
  const [dragging, setDragging] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [browsing, setBrowsing] = useState(false)

  async function handleFile(file) {
    if (!file) return
    setError('')
    setUploading(true)
    try {
      const item = await uploadImage(file, user.id)
      onChange(item.url)
    } catch (err) {
      setError(err.message)
    } finally {
      setUploading(false)
    }
  }

  const library = browsing && (
    <MediaPickerModal onClose={() => setBrowsing(false)} onSelect={(item) => { onChange(item.url); setBrowsing(false) }} />
  )

  if (value) {
    return (
      <div className="image-picker has-image">
        <img src={value} alt="Greeting card" />
        <div className="image-picker-bar">
          <span className="muted small">{value.startsWith('data:') ? `≈ ${approxKb(value)} KB` : 'From your image library'}</span>
          <button type="button" className="btn btn-ghost btn-xs" onClick={() => setBrowsing(true)}><Images size={13} /> Library</button>
          <label className="btn btn-ghost btn-xs">
            <RefreshCw size={13} /> {uploading ? 'Uploading…' : 'Upload new'}
            <input type="file" accept="image/*" hidden disabled={uploading} onChange={(e) => { handleFile(e.target.files?.[0]); e.target.value = '' }} />
          </label>
          {allowRemove && <button type="button" className="btn btn-ghost btn-xs" onClick={() => onChange(null)}><Trash2 size={13} /> Remove</button>}
        </div>
        {error && <div className="alert alert-error">{error}</div>}
        {library}
      </div>
    )
  }

  return (
    <div>
      <label
        className={`dropzone ${dragging ? 'is-dragging' : ''}`}
        onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => { e.preventDefault(); setDragging(false); handleFile(e.dataTransfer.files?.[0]) }}
      >
        <input type="file" accept="image/*" hidden disabled={uploading} onChange={(e) => { handleFile(e.target.files?.[0]); e.target.value = '' }} />
        <ImagePlus size={26} />
        <strong>{uploading ? 'Uploading…' : 'Upload a greeting card'}</strong>
        <span className="muted small">Drop an image here or click to choose. It is saved to your image library for next time.</span>
      </label>
      <button type="button" className="btn btn-ghost btn-sm" onClick={() => setBrowsing(true)}><Images size={15} /> Choose from image library</button>
      {error && <div className="alert alert-error">{error}</div>}
      {library}
    </div>
  )
}

// Message textarea with clickable personalisation variables
export function MessageEditor({ value, onChange, rows = 6 }) {
  const ref = useRef(null)

  function insert(token) {
    const el = ref.current
    const start = el?.selectionStart ?? value.length
    const end = el?.selectionEnd ?? value.length
    const next = value.slice(0, start) + token + value.slice(end)
    onChange(next)
    requestAnimationFrame(() => {
      el?.focus()
      el?.setSelectionRange(start + token.length, start + token.length)
    })
  }

  return (
    <div className="message-editor">
      <textarea ref={ref} rows={rows} value={value} onChange={(e) => onChange(e.target.value)} placeholder="Write your message…" />
      <div className="variable-bar">
        <span className="muted small">Personalise:</span>
        {MESSAGE_VARIABLES.map((v) => (
          <button key={v.key} type="button" className="chip chip-button" onClick={() => insert(v.key)} title={`Insert ${v.label}`}>
            {v.key}
          </button>
        ))}
        <span className="muted small char-count">{value.length} chars</span>
      </div>
    </div>
  )
}

// WhatsApp-style phone preview
export function MessagePreview({ image, text, contactName = 'Client' }) {
  const time = new Date().toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' })
  return (
    <div className="phone">
      <div className="phone-head">
        <span className="phone-avatar">{(contactName || 'C')[0]}</span>
        <div>
          <div className="phone-name">{contactName}</div>
          <div className="phone-status">online</div>
        </div>
      </div>
      <div className="phone-chat">
        <div className="bubble">
          {image && <img src={image} alt="" />}
          {text && <div className="bubble-text">{text}</div>}
          <div className="bubble-time">{time} ✓✓</div>
        </div>
      </div>
    </div>
  )
}

// Free-form tag entry with suggestions
export function TagInput({ value, onChange, suggestions = [], placeholder = 'Add tag…' }) {
  const [draft, setDraft] = useState('')
  const add = (t) => {
    const tag = t.trim()
    if (tag && !value.includes(tag)) onChange([...value, tag])
    setDraft('')
  }
  const remaining = suggestions.filter((s) => !value.includes(s) && s.toLowerCase().includes(draft.toLowerCase())).slice(0, 6)

  return (
    <div className="tag-input">
      <div className="tag-input-box">
        {value.map((t) => (
          <span key={t} className="chip">
            {t}
            <button type="button" onClick={() => onChange(value.filter((x) => x !== t))} aria-label={`Remove ${t}`}>×</button>
          </span>
        ))}
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); add(draft) }
            if (e.key === 'Backspace' && !draft && value.length) onChange(value.slice(0, -1))
          }}
          onBlur={() => draft && add(draft)}
          placeholder={value.length ? '' : placeholder}
        />
      </div>
      {remaining.length > 0 && (
        <div className="tag-suggestions">
          {remaining.map((s) => <button key={s} type="button" className="chip chip-button" onClick={() => add(s)}>+ {s}</button>)}
        </div>
      )}
    </div>
  )
}
