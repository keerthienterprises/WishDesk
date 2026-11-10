import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { AlertTriangle, Archive, ArchiveRestore, ArrowLeft, Copy, Download, Pause, Play, Search, Shuffle, Trash2 } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { useSettings } from '../context/SettingsContext'
import { useToast } from '../context/ToastContext'
import { supabase } from '../lib/supabase'
import {
  assignRecipients, campaignState, fetchRecipients, fetchTeam, forgetCampaign, setRecipientStatus, statusChanges, summarize, updateCampaign, updateRecipients,
} from '../lib/data'
import { formatDate, formatDateTime, formatDayMonth, todayIso } from '../lib/dates'
import { typeMeta } from '../lib/campaignTypes'
import { downloadFile, toCsv } from '../lib/csv'
import { SEND_RESULT_MESSAGES, formatPhone, renderMessage, sendWhatsApp } from '../lib/whatsapp'
import { campaignWhen } from './Campaigns'
import { ImagePicker, MessageEditor, MessagePreview } from '../components/content'
import CardEditor from '../components/CardEditor'
import { cardFileName, hasFields, renderCard, useCardImage } from '../lib/cardRender'
import { BarChart } from '../components/charts'
import TeamPicker from '../components/TeamPicker'
import WhatsAppIcon from '../components/WhatsAppIcon'
import { Avatar, EmptyState, Modal, PageHeader, Progress, Spinner, StatCard, StatePill, Tabs, TypeIcon } from '../components/ui'

export default function CampaignDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { user, profile } = useAuth()
  const { settings } = useSettings()
  const toast = useToast()
  const [campaign, setCampaign] = useState(null)
  const [recipients, setRecipients] = useState([])
  const [team, setTeam] = useState([])
  const [tab, setTab] = useState('overview')
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [assigneeFilter, setAssigneeFilter] = useState('all')
  const [selected, setSelected] = useState(new Set())
  const [showResplit, setShowResplit] = useState(false)
  const [draft, setDraft] = useState(null)
  const [designing, setDesigning] = useState(false)
  const [saving, setSaving] = useState(false)
  const [loadError, setLoadError] = useState('')

  useEffect(() => {
    supabase.from('campaigns').select('*').eq('id', id).single().then(({ data, error }) => {
      if (error) return setLoadError(error.code === 'PGRST116' ? 'This campaign no longer exists.' : error.message)
      setCampaign(data)
      setDraft({ image: data.image_base64, message: data.message, layout: data.layout })
    })
    fetchRecipients({ campaignId: id }).then(setRecipients).catch((e) => toast(e.message, 'error'))
    fetchTeam().then(setTeam).catch((e) => toast(e.message, 'error'))
  }, [id, toast])

  const stats = useMemo(() => summarize(recipients), [recipients])
  const sampleVars = { contact: recipients[0]?.contact, company: settings.company_name, sender: profile?.full_name }
  const liveCard = useCardImage(campaign?.image_base64, campaign?.layout, sampleVars)
  const draftCard = useCardImage(draft?.image, draft?.layout, sampleVars)
  const nameOf = (uid) => team.find((u) => u.id === uid)?.full_name ?? 'Unassigned'

  const perMember = useMemo(() => {
    const map = {}
    for (const r of recipients) {
      const k = r.assigned_to ?? 'none'
      map[k] ??= { total: 0, done: 0, overdue: 0 }
      map[k].total++
      if (r.status !== 'pending') map[k].done++
      else if (r.due_date < todayIso()) map[k].overdue++
    }
    return Object.entries(map).sort((a, b) => b[1].total - a[1].total)
  }, [recipients])

  const schedule = useMemo(() => {
    const map = {}
    for (const r of recipients) map[r.due_date] = (map[r.due_date] ?? 0) + 1
    return Object.entries(map).sort().map(([label, value]) => ({ label, value }))
  }, [recipients])

  const shown = recipients.filter((r) =>
    (statusFilter === 'all' || (statusFilter === 'overdue' ? r.status === 'pending' && r.due_date < todayIso() : r.status === statusFilter)) &&
    (assigneeFilter === 'all' || (r.assigned_to ?? 'none') === assigneeFilter) &&
    (!search || r.contact?.full_name.toLowerCase().includes(search.toLowerCase()) || r.contact?.phone.includes(search.replace(/\D/g, '') || '§')),
  )

  if (loadError) {
    return (
      <div className="page">
        <Link to="/campaigns" className="back-link"><ArrowLeft size={15} /> All campaigns</Link>
        <section className="card"><EmptyState icon={AlertTriangle} title="Couldn't open this campaign" text={loadError} /></section>
      </div>
    )
  }
  if (!campaign) return <Spinner />

  const meta = typeMeta(campaign.type)
  const state = campaignState(campaign, stats)
  const allShownSelected = shown.length > 0 && shown.every((r) => selected.has(r.id))

  async function setStatus(status) {
    try {
      setCampaign(await updateCampaign(id, { status }))
      toast(`Campaign ${status === 'active' ? 'resumed' : status}`, 'success')
    } catch (e) {
      toast(e.message, 'error')
    }
  }

  async function remove() {
    if (!confirm(`Delete "${campaign.name}" and its ${stats.total} messages? This cannot be undone.`)) return
    const { error } = await supabase.from('campaigns').delete().eq('id', id)
    if (error) return toast(error.message, 'error')
    forgetCampaign(id)
    toast('Campaign deleted', 'success')
    navigate('/campaigns')
  }

  async function bulk(changes, label) {
    const ids = [...selected]
    try {
      await updateRecipients(ids, changes)
      setRecipients((list) => list.map((r) => (selected.has(r.id) ? { ...r, ...changes } : r)))
      setSelected(new Set())
      toast(`${label} ${ids.length} message${ids.length > 1 ? 's' : ''}`, 'success')
    } catch (e) {
      toast(e.message, 'error')
    }
  }

  const markStatus = (status) => bulk(
    statusChanges(status, user.id),
    status === 'sent' ? 'Marked sent:' : status === 'skipped' ? 'Skipped' : 'Reset',
  )

  async function removeSelected() {
    if (!confirm(`Remove ${selected.size} recipients from this campaign?`)) return
    const ids = [...selected]
    const { error } = await supabase.from('campaign_recipients').delete().in('id', ids)
    if (error) return toast(error.message, 'error')
    setRecipients((list) => list.filter((r) => !selected.has(r.id)))
    setSelected(new Set())
  }

  async function reassignOne(r, assigned_to) {
    try {
      await updateRecipients([r.id], { assigned_to: assigned_to || null })
      setRecipients((list) => list.map((x) => (x.id === r.id ? { ...x, assigned_to: assigned_to || null } : x)))
    } catch (e) {
      toast(e.message, 'error')
    }
  }

  // Opens the client's WhatsApp chat with the message (card copied on desktop), then marks it sent
  async function sendOne(r) {
    try {
      const text = renderMessage(campaign.message, { contact: r.contact, company: settings.company_name, sender: profile?.full_name })
      const image = await renderCard(campaign.image_base64, campaign.layout, { contact: r.contact, company: settings.company_name, sender: profile?.full_name })
      const result = await sendWhatsApp({ phone: r.contact.phone, text, imageBase64: image, fileName: cardFileName(r.contact.full_name) })
      if (result === 'cancelled') return
      toast(SEND_RESULT_MESSAGES[result], 'success', 7000)
      if (r.status === 'pending') {
        const updated = await setRecipientStatus(r.id, 'sent', user.id)
        setRecipients((list) => list.map((x) => (x.id === r.id ? { ...x, ...updated } : x)))
      }
    } catch (e) {
      toast(e.message, 'error')
    }
  }

  async function saveContent() {
    setSaving(true)
    try {
      setCampaign(await updateCampaign(id, { image_base64: draft.image, message: draft.message, layout: draft.layout ?? null }))
      toast('Card and message saved. Your team will send the new version.', 'success')
    } catch (e) {
      toast(e.message, 'error')
    } finally {
      setSaving(false)
    }
  }

  function exportCsv() {
    const csv = toCsv(recipients, [
      { label: 'Name', value: (r) => r.contact?.full_name },
      { label: 'Phone', value: (r) => `+${r.contact?.phone}` },
      { label: 'Due date', value: (r) => r.due_date },
      { label: 'Assigned to', value: (r) => nameOf(r.assigned_to) },
      { label: 'Status', value: (r) => r.status },
      { label: 'Sent at', value: (r) => r.sent_at ?? '' },
      { label: 'Sent by', value: (r) => (r.sent_by ? nameOf(r.sent_by) : '') },
    ])
    downloadFile(csv, `${campaign.name.replace(/[^\w-]+/g, '_')}.csv`)
  }

  const preview = renderMessage(draft?.message, { contact: recipients[0]?.contact, company: settings.company_name, sender: profile?.full_name })
  const contentChanged = draft && (draft.image !== campaign.image_base64 || draft.message !== campaign.message || JSON.stringify(draft.layout ?? null) !== JSON.stringify(campaign.layout ?? null))

  return (
    <div className="page">
      <Link to="/campaigns" className="back-link"><ArrowLeft size={15} /> All campaigns</Link>
      <PageHeader
        title={<span className="title-with-icon"><TypeIcon type={campaign.type} size={40} /> {campaign.name}</span>}
        subtitle={<span className="header-meta"><StatePill state={state} /><span>{meta.label}, {campaignWhen(campaign)}</span><span className="sep">Created {formatDate(campaign.created_at.slice(0, 10))} by {nameOf(campaign.created_by)}</span></span>}
        actions={
          <>
            <button className="btn btn-ghost" onClick={exportCsv}><Download size={16} /> Export</button>
            <button className="btn btn-ghost" onClick={() => navigate(`/campaigns/new?copy=${id}`)}><Copy size={16} /> Duplicate</button>
            {campaign.status === 'active' && <button className="btn btn-ghost" onClick={() => setStatus('paused')}><Pause size={16} /> Pause</button>}
            {campaign.status === 'paused' && <button className="btn btn-primary" onClick={() => setStatus('active')}><Play size={16} /> Resume</button>}
            {campaign.status !== 'archived'
              ? <button className="btn btn-ghost" onClick={() => setStatus('archived')}><Archive size={16} /> Archive</button>
              : <button className="btn btn-ghost" onClick={() => setStatus('active')}><ArchiveRestore size={16} /> Restore</button>}
            <button className="btn btn-danger-ghost" onClick={remove} title="Delete campaign"><Trash2 size={16} /></button>
          </>
        }
      />
      {campaign.description && <div className="note-banner">{campaign.description}</div>}
      {campaign.status === 'paused' && <div className="alert alert-warn"><Pause size={16} /> This campaign is paused. Its greetings won't appear in anyone's list until you resume it.</div>}

      <div className="stat-grid">
        <StatCard label="Audience" value={stats.total} tone="brand" />
        <StatCard label="Sent" value={stats.sent} tone="ok" hint={`${stats.skipped} skipped`} />
        <StatCard label="Pending" value={stats.pending} tone={stats.overdue ? 'danger' : 'warn'} hint={stats.overdue ? `${stats.overdue} overdue` : 'None overdue'} />
        <StatCard label="Completion" value={`${stats.rate}%`} tone="neutral" />
      </div>

      <Tabs
        value={tab}
        onChange={setTab}
        tabs={[
          { value: 'overview', label: 'Overview' },
          { value: 'recipients', label: 'Recipients', count: stats.total },
          { value: 'content', label: 'Card & message' },
        ]}
      />

      {tab === 'overview' && (
        <div className="detail-grid">
          <div className="side-stack">
            <section className="card">
              <div className="card-title-row">
                <div className="card-title">Team progress</div>
                <button className="btn btn-ghost btn-sm" onClick={() => setShowResplit(true)} disabled={!stats.pending}><Shuffle size={14} /> Re-split pending</button>
              </div>
              {perMember.length === 0 && <p className="muted small">No recipients.</p>}
              {perMember.map(([uid, s]) => (
                <div key={uid} className="leader-row">
                  <Avatar name={nameOf(uid === 'none' ? null : uid)} size={32} />
                  <div className="leader-main">
                    <div className="leader-name">
                      <span>{uid === 'none' ? <span className="warn-text">Unassigned</span> : nameOf(uid)}</span>
                      <span className="muted small">{s.done}/{s.total}{s.overdue > 0 && <span className="danger-text sep">{s.overdue} overdue</span>}</span>
                    </div>
                    <Progress value={(s.done / s.total) * 100} />
                  </div>
                </div>
              ))}
            </section>
            {schedule.length > 1 && (
              <section className="card">
                <div className="card-title">Messages by date</div>
                <BarChart data={schedule} formatLabel={(l) => formatDayMonth(l)} />
              </section>
            )}
          </div>
          <div className="preview-col">
            <div className="preview-label">What clients receive</div>
            <MessagePreview image={liveCard} text={renderMessage(campaign.message, { contact: recipients[0]?.contact, company: settings.company_name, sender: profile?.full_name })} contactName={recipients[0]?.contact?.full_name} />
          </div>
        </div>
      )}

      {tab === 'recipients' && (
        <section className="card table-card">
          <div className="toolbar">
            <div className="toolbar-left">
              <div className="search-box"><Search size={16} /><input placeholder="Search name or number…" value={search} onChange={(e) => setSearch(e.target.value)} /></div>
              <select className="select-sm" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
                <option value="all">All statuses</option>
                <option value="pending">Pending</option>
                <option value="overdue">Overdue</option>
                <option value="sent">Sent</option>
                <option value="skipped">Skipped</option>
              </select>
              <select className="select-sm" value={assigneeFilter} onChange={(e) => setAssigneeFilter(e.target.value)}>
                <option value="all">Everyone</option>
                {team.map((u) => <option key={u.id} value={u.id}>{u.full_name}</option>)}
                <option value="none">Unassigned</option>
              </select>
            </div>
            <button className="btn btn-ghost btn-sm" onClick={() => setShowResplit(true)} disabled={!stats.pending}><Shuffle size={14} /> Re-split pending</button>
          </div>

          {selected.size > 0 && (
            <div className="bulk-bar">
              <strong>{selected.size} selected</strong>
              <select className="select-sm" value="" onChange={(e) => e.target.value && bulk({ assigned_to: e.target.value }, 'Reassigned')}>
                <option value="">Reassign to…</option>
                {team.filter((u) => u.is_active).map((u) => <option key={u.id} value={u.id}>{u.full_name}</option>)}
              </select>
              <button className="btn btn-ghost btn-sm" onClick={() => markStatus('sent')}>Mark sent</button>
              <button className="btn btn-ghost btn-sm" onClick={() => markStatus('skipped')}>Skip</button>
              <button className="btn btn-ghost btn-sm" onClick={() => markStatus('pending')}>Reset</button>
              <button className="btn btn-danger-ghost btn-sm" onClick={removeSelected}><Trash2 size={14} /> Remove</button>
              <button className="btn btn-link btn-sm" onClick={() => setSelected(new Set())}>Clear</button>
            </div>
          )}

          {shown.length === 0 ? <EmptyState icon={Search} title="No recipients match" /> : (
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th style={{ width: 36 }}>
                      <input type="checkbox" checked={allShownSelected} onChange={() => setSelected(allShownSelected ? new Set() : new Set(shown.map((r) => r.id)))} />
                    </th>
                    <th>Contact</th><th>Due</th><th>Assigned to</th><th>Status</th><th>Sent</th><th className="num">WhatsApp</th>
                  </tr>
                </thead>
                <tbody>
                  {shown.map((r) => (
                    <tr key={r.id} className={selected.has(r.id) ? 'row-selected' : ''}>
                      <td>
                        <input type="checkbox" checked={selected.has(r.id)} onChange={() => setSelected((s) => {
                          const n = new Set(s)
                          n.has(r.id) ? n.delete(r.id) : n.add(r.id)
                          return n
                        })} />
                      </td>
                      <td>
                        <div className="cell-title">{r.contact?.full_name}</div>
                        <div className="muted small">{formatPhone(r.contact?.phone)}</div>
                      </td>
                      <td>
                        {formatDayMonth(r.due_date)}
                        {r.status === 'pending' && r.due_date < todayIso() && <div className="danger-text small">Overdue</div>}
                      </td>
                      <td>
                        <select className="select-sm" value={r.assigned_to ?? ''} onChange={(e) => reassignOne(r, e.target.value)}>
                          <option value="">Unassigned</option>
                          {team.filter((u) => u.is_active || u.id === r.assigned_to).map((u) => <option key={u.id} value={u.id}>{u.full_name}</option>)}
                        </select>
                      </td>
                      <td><StatePill state={r.status} /></td>
                      <td className="small">{r.sent_at ? <>{formatDateTime(r.sent_at)}<div className="muted">by {nameOf(r.sent_by)}</div></> : <span className="muted">—</span>}</td>
                      <td className="num">
                        <button className="wa-btn" onClick={() => sendOne(r)} disabled={r.contact?.opted_out} title={`Open WhatsApp chat with ${r.contact?.full_name}`} aria-label={`Send on WhatsApp to ${r.contact?.full_name}`}>
                          <WhatsAppIcon size={18} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      {tab === 'content' && draft && (
        <div className="wizard-split">
          <section className="card wizard-card">
            <h3 className="section-title">Greeting card</h3>
            <ImagePicker value={draft.image} onChange={(image) => setDraft((d) => ({ ...d, image }))} />
            {draft.image && (
              <button type="button" className="btn btn-ghost btn-sm card-design-btn" onClick={() => setDesigning(true)}>
                {hasFields(draft.layout) ? 'Change where names appear on the card' : 'Put each client’s name on the card'}
              </button>
            )}
            <h3 className="section-title">Message</h3>
            <MessageEditor value={draft.message} onChange={(message) => setDraft((d) => ({ ...d, message }))} />
            <div className="row-end">
              <button className="btn btn-ghost" disabled={!contentChanged} onClick={() => setDraft({ image: campaign.image_base64, message: campaign.message, layout: campaign.layout })}>Discard</button>
              <button className="btn btn-primary" disabled={!contentChanged || saving || !draft.message.trim()} onClick={saveContent}>{saving ? 'Saving…' : 'Save changes'}</button>
            </div>
          </section>
          <div className="preview-col">
            <div className="preview-label">Live preview</div>
            <MessagePreview image={draftCard} text={preview} contactName={recipients[0]?.contact?.full_name} />
          </div>
        </div>
      )}

      {designing && draft?.image && (
        <Modal
          title="Names on the card"
          subtitle="Drag the name to the right spot. Press Save changes on the Card & message tab afterwards to keep it."
          size="xl"
          onClose={() => setDesigning(false)}
          footer={<button className="btn btn-primary" onClick={() => setDesigning(false)}>Done</button>}
        >
          <CardEditor image={draft.image} layout={draft.layout} onChange={(layout) => setDraft((d) => ({ ...d, layout }))} />
        </Modal>
      )}

      {showResplit && (
        <ResplitModal
          recipients={recipients}
          team={team}
          onClose={() => setShowResplit(false)}
          onDone={(map) => setRecipients((list) => list.map((r) => (map[r.id] ? { ...r, assigned_to: map[r.id] } : r)))}
        />
      )}
    </div>
  )
}

function ResplitModal({ recipients, team, onClose, onDone }) {
  const toast = useToast()
  const [ids, setIds] = useState(team.filter((u) => u.is_active).map((u) => u.id))
  const [busy, setBusy] = useState(false)
  const pending = recipients.filter((r) => r.status === 'pending')
  const plan = useMemo(
    () => (ids.length ? assignRecipients(pending.map((r) => ({ ...r, contact: { owner_id: null } })), { mode: 'even', userIds: ids }) : []),
    [pending, ids],
  )
  const counts = plan.reduce((a, p) => ({ ...a, [p.assigned_to]: (a[p.assigned_to] ?? 0) + 1 }), {})

  async function apply() {
    setBusy(true)
    try {
      const byUser = {}
      for (const p of plan) (byUser[p.assigned_to] ??= []).push(p.id)
      for (const [uid, rids] of Object.entries(byUser)) await updateRecipients(rids, { assigned_to: uid })
      onDone(Object.fromEntries(plan.map((p) => [p.id, p.assigned_to])))
      toast(`Re-split ${plan.length} pending messages`, 'success')
      onClose()
    } catch (e) {
      toast(e.message, 'error')
      setBusy(false)
    }
  }

  return (
    <Modal
      title="Re-split pending messages"
      subtitle={`${pending.length} pending messages will be shared evenly. Sent messages are not affected.`}
      onClose={onClose}
      footer={
        <>
          <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" disabled={!ids.length || busy} onClick={apply}>{busy ? 'Saving…' : 'Apply'}</button>
        </>
      }
    >
      <TeamPicker team={team} selectedIds={ids} onChange={setIds} counts={counts} />
    </Modal>
  )
}
