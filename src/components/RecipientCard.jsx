import { useEffect, useState } from 'react'
import { Check, Download, MessageCircle, RotateCcw, SkipForward } from 'lucide-react'
import WhatsAppIcon from './WhatsAppIcon'
import { useAuth } from '../context/AuthContext'
import { useSettings } from '../context/SettingsContext'
import { useToast } from '../context/ToastContext'
import { getCampaignContent, setRecipientStatus } from '../lib/data'
import { cardFileName, renderCard } from '../lib/cardRender'
import { downloadImage } from '../lib/image'
import { formatDayMonth, ordinal, relativeDay, todayIso, yearsBetween } from '../lib/dates'
import { SEND_RESULT_MESSAGES, chatUrl, formatPhone, renderMessage, sendWhatsApp } from '../lib/whatsapp'
import { Avatar, StatePill, TypeBadge } from './ui'

function occasionDetail(r) {
  const type = r.campaign?.type
  const c = r.contact
  if (type === 'birthday' && c?.dob && Number(c.dob.slice(0, 4)) > 1900) return `Turns ${yearsBetween(c.dob, r.due_date)}`
  if (type === 'anniversary' && c?.anniversary) return `${ordinal(yearsBetween(c.anniversary, r.due_date))} anniversary`
  return null
}

// One message to send: contact, occasion, and the WhatsApp action
export default function RecipientCard({ recipient: r, onChange, assigneeName }) {
  const { user, profile } = useAuth()
  const { settings } = useSettings()
  const toast = useToast()
  const [content, setContent] = useState(null)
  const [busy, setBusy] = useState(false)
  const contact = r.contact
  const overdue = r.status === 'pending' && r.due_date < todayIso()

  useEffect(() => {
    getCampaignContent(r.campaign_id).then(setContent).catch(() => setContent(null))
  }, [r.campaign_id])

  const vars = { contact, company: settings.company_name, sender: profile?.full_name }
  const text = content ? renderMessage(content.message, vars) : ''

  async function update(status) {
    try {
      onChange({ ...r, ...(await setRecipientStatus(r.id, status, user.id)) })
    } catch (err) {
      toast(err.message, 'error')
    }
  }

  async function send() {
    if (!content) return
    setBusy(true)
    try {
      const image = await renderCard(content.image_base64, content.layout, vars)
      const result = await sendWhatsApp({ phone: contact.phone, text, imageBase64: image, fileName: cardFileName(contact.full_name) })
      if (result === 'cancelled') return
      toast(SEND_RESULT_MESSAGES[result], 'success', 7000)
      if (r.status !== 'sent') await update('sent')
    } catch (err) {
      toast(err.message, 'error')
    } finally {
      setBusy(false)
    }
  }

  const detail = occasionDetail(r)

  return (
    <div className={`task-card status-${r.status} ${overdue ? 'is-overdue' : ''}`}>
      <div className="task-thumb">
        {content?.image_base64 ? <img src={content.image_base64} alt="" loading="lazy" /> : <Avatar name={contact?.full_name} size={44} />}
      </div>
      <div className="task-main">
        <div className="task-title-row">
          <span className="task-name">{contact?.full_name}</span>
          <TypeBadge type={r.campaign?.type} size="sm" />
          {r.status !== 'pending' && <StatePill state={r.status} />}
          {overdue && <span className="pill pill-danger">Overdue</span>}
        </div>
        <div className="task-meta">
          <span>{formatPhone(contact?.phone)}</span>
          {detail && <span className="sep">{detail}</span>}
          <span className="sep">{r.campaign?.name}</span>
          {r.due_date !== todayIso() && <span className="sep">{formatDayMonth(r.due_date)}, {relativeDay(r.due_date).toLowerCase()}</span>}
          {assigneeName && <span className="sep">{assigneeName}</span>}
        </div>
        {contact?.notes && <div className="task-note">{contact.notes}</div>}
        {contact?.opted_out && <div className="task-note task-note-warn">This contact has opted out of messages.</div>}
      </div>
      <div className="task-actions">
        {r.status === 'pending' ? (
          <>
            <button className="btn btn-whatsapp" onClick={send} disabled={busy || !content || contact?.opted_out}>
              <WhatsAppIcon size={16} /> {busy ? 'Opening…' : 'Send on WhatsApp'}
            </button>
            <div className="task-icons">
              {content?.image_base64 && (
                <button className="icon-btn" onClick={() => renderCard(content.image_base64, content.layout, vars).then((card) => downloadImage(card, `${cardFileName(contact?.full_name)}.jpg`)).catch((e) => toast(e.message, 'error'))} title="Download card"><Download size={16} /></button>
              )}
              {content && (
                <a className="icon-btn" href={chatUrl(contact?.phone, text)} target="_blank" rel="noreferrer" title="Open chat (text only)"><MessageCircle size={16} /></a>
              )}
              <button className="icon-btn" onClick={() => update('sent')} title="Mark as sent"><Check size={16} /></button>
              <button className="icon-btn" onClick={() => update('skipped')} title="Skip"><SkipForward size={16} /></button>
            </div>
          </>
        ) : (
          <div className="task-icons">
            <button className="btn btn-ghost btn-sm" onClick={send} disabled={busy || !content}><WhatsAppIcon size={14} /> Send again</button>
            <button className="icon-btn" onClick={() => update('pending')} title="Undo"><RotateCcw size={16} /></button>
          </div>
        )}
      </div>
    </div>
  )
}
