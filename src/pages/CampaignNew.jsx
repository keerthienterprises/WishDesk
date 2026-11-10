import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { ArrowLeft, ArrowRight, Check, Download, FileSpreadsheet, Info, Rocket, UploadCloud, UsersRound } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { useSettings } from '../context/SettingsContext'
import { useToast } from '../context/ToastContext'
import { supabase } from '../lib/supabase'
import {
  assignRecipients, createCampaign, eligibleRecipients, fetchContacts, fetchTeam, findOverlappingCampaign, upsertContacts,
} from '../lib/data'
import { CAMPAIGN_TYPES, isRecurring, typeMeta } from '../lib/campaignTypes'
import { FESTIVALS, nextFestivalDate } from '../lib/festivals'
import { MONTHS, formatDate, formatDayMonth } from '../lib/dates'
import { SAMPLE_CSV, downloadFile, parseContactsCsv } from '../lib/csv'
import { formatPhone, renderMessage } from '../lib/whatsapp'
import { ImagePicker, MessageEditor, MessagePreview } from '../components/content'
import CardEditor from '../components/CardEditor'
import { hasFields, useCardImage } from '../lib/cardRender'
import TeamPicker from '../components/TeamPicker'
import { Field, Modal, PageHeader, Segmented, Spinner, TypeIcon } from '../components/ui'

const STEPS = ['Occasion', 'Content', 'Audience', 'Team', 'Review']

export default function CampaignNew() {
  const { user, profile } = useAuth()
  const { settings } = useSettings()
  const toast = useToast()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const now = new Date()
  const next = new Date(now.getFullYear(), now.getMonth() + 1, 1)

  const [step, setStep] = useState(0)
  const [type, setType] = useState(params.get('type') || 'birthday')
  const [name, setName] = useState('')
  const [nameTouched, setNameTouched] = useState(false)
  const [festival, setFestival] = useState(null)
  const [description, setDescription] = useState('')
  const [periodMonth, setPeriodMonth] = useState(now.getMonth() + 1)
  const [periodYear, setPeriodYear] = useState(now.getFullYear())
  const [sendDate, setSendDate] = useState('')
  const [image, setImage] = useState(null)
  const [layout, setLayout] = useState(null)
  const [designing, setDesigning] = useState(false)
  const [message, setMessage] = useState(CAMPAIGN_TYPES.birthday.defaultMessage)
  const [messageTouched, setMessageTouched] = useState(false)
  const [saveTemplate, setSaveTemplate] = useState(false)

  const [contacts, setContacts] = useState(null)
  const [templates, setTemplates] = useState([])
  const [team, setTeam] = useState([])
  const [source, setSource] = useState('contacts')
  const [tagFilter, setTagFilter] = useState([])
  const [excluded, setExcluded] = useState(new Set())
  const [csv, setCsv] = useState(null) // { fileName, rows }
  const [csvError, setCsvError] = useState('')
  const [importTags, setImportTags] = useState('')
  const [mode, setMode] = useState('owner')
  const [userIds, setUserIds] = useState([])
  const [launching, setLaunching] = useState(false)

  const meta = typeMeta(type)
  const recurring = isRecurring(type)

  useEffect(() => {
    fetchContacts().then(setContacts).catch((e) => {
      toast(e.message, 'error')
      setContacts([])
    })
    supabase.from('templates').select('*').order('created_at', { ascending: false }).then(({ data, error }) => {
      if (error) toast(error.message, 'error')
      setTemplates(data ?? [])
    })
    fetchTeam().then((t) => {
      setTeam(t)
      setUserIds(t.filter((u) => u.is_active).map((u) => u.id))
    }).catch((e) => toast(e.message, 'error'))
  }, [toast])

  // Prefill from ?template= or ?copy=
  useEffect(() => {
    const templateId = params.get('template')
    const copyId = params.get('copy')
    if (templateId) {
      supabase.from('templates').select('*').eq('id', templateId).single().then(({ data }) => {
        if (!data) return
        setType(data.category)
        setImage(data.image_base64)
        setLayout(data.layout)
        setMessage(data.message)
        setMessageTouched(true)
      })
    }
    if (copyId) {
      supabase.from('campaigns').select('*').eq('id', copyId).single().then(({ data }) => {
        if (!data) return
        setType(data.type)
        setName(`${data.name} (copy)`)
        setNameTouched(true)
        setDescription(data.description ?? '')
        setImage(data.image_base64)
        setLayout(data.layout)
        setMessage(data.message)
        setMessageTouched(true)
      })
    }
  }, [params])

  // Suggested name/message follow the occasion until the user edits them
  useEffect(() => {
    if (!nameTouched) {
      if (recurring) setName(`${meta.label} wishes, ${MONTHS[periodMonth - 1]} ${periodYear}`)
      else if (festival) setName(`${festival.name} ${(sendDate || nextFestivalDate(festival) || String(now.getFullYear())).slice(0, 4)}`)
      else setName('')
    }
  }, [type, periodMonth, periodYear, festival, sendDate, nameTouched]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!messageTouched) setMessage(festival?.message ?? meta.defaultMessage)
  }, [type, festival]) // eslint-disable-line react-hooks/exhaustive-deps

  function chooseType(t) {
    setType(t)
    setFestival(null)
    setExcluded(new Set())
  }

  function chooseFestival(f) {
    setFestival(f)
    setSendDate(nextFestivalDate(f))
  }

  const allTags = useMemo(() => [...new Set((contacts ?? []).flatMap((c) => c.tags ?? []))].sort(), [contacts])

  // Audience as contact-like objects (CSV rows are not saved until launch)
  const audience = useMemo(() => {
    if (source === 'csv') {
      return (csv?.rows ?? []).filter((r) => !r.errors.length).map((r) => {
        const existing = contacts?.find((c) => c.phone === r.phone)
        return { ...r, id: existing?.id ?? r.phone, owner_id: existing?.owner_id ?? null, opted_out: existing?.opted_out ?? false }
      })
    }
    return (contacts ?? []).filter((c) => !tagFilter.length || c.tags?.some((t) => tagFilter.includes(t)))
  }, [source, csv, contacts, tagFilter])

  const eligible = useMemo(
    () => eligibleRecipients(type, audience, { periodMonth, periodYear, sendDate }).filter((e) => !excluded.has(e.contact.id)),
    [type, audience, periodMonth, periodYear, sendDate, excluded],
  )
  const allEligible = useMemo(
    () => eligibleRecipients(type, audience, { periodMonth, periodYear, sendDate }),
    [type, audience, periodMonth, periodYear, sendDate],
  )
  const optedOut = audience.filter((c) => c.opted_out).length
  const missingDate = recurring ? audience.filter((c) => !c[meta.dateField]).length : 0
  const notInMonth = recurring
    ? audience.filter((c) => !c.opted_out && c[meta.dateField] && Number(c[meta.dateField].slice(5, 7)) !== periodMonth).length
    : 0

  const assigned = useMemo(() => (userIds.length ? assignRecipients(eligible, { mode, userIds }) : []), [eligible, mode, userIds])
  const counts = useMemo(() => assigned.reduce((acc, a) => ({ ...acc, [a.assigned_to]: (acc[a.assigned_to] ?? 0) + 1 }), {}), [assigned])

  async function handleCsv(file) {
    if (!file) return
    setCsvError('')
    try {
      const result = await parseContactsCsv(file, { requireDate: recurring ? meta.dateField : null })
      if (result.missingColumns.length) {
        const names = { full_name: 'name', phone: 'number', dob: 'dob / birthday', anniversary: 'anniversary' }
        setCsvError(`Couldn't find column(s): ${result.missingColumns.map((c) => names[c]).join(', ')}. Your columns: ${result.headers.join(', ') || 'none'}.`)
        setCsv(null)
        return
      }
      setCsv({ fileName: file.name, rows: result.rows })
      setExcluded(new Set())
    } catch (err) {
      setCsvError(err.message)
    }
  }

  const canNext = [
    name.trim() && (recurring ? periodMonth && periodYear : sendDate),
    message.trim(),
    eligible.length > 0,
    userIds.length > 0,
    true,
  ][step]

  async function launch() {
    setLaunching(true)
    try {
      const overlap = await findOverlappingCampaign(
        recurring ? { type, period_month: periodMonth, period_year: periodYear } : { type, send_date: sendDate },
      )
      if (overlap && !confirm(`"${overlap.name}" is already set up for the same occasion and date. Clients in both campaigns would be wished twice. Launch anyway?`)) {
        setLaunching(false)
        return
      }
      let finalAssigned = assigned
      if (source === 'csv') {
        const extraTags = importTags.split(',').map((t) => t.trim()).filter(Boolean)
        const valid = csv.rows.filter((r) => !r.errors.length).map((r) => ({ ...r, tags: [...new Set([...r.tags, ...extraTags])] }))
        const saved = await upsertContacts(valid, user.id)
        const excludedPhones = new Set(audience.filter((a) => excluded.has(a.id)).map((a) => a.phone))
        const fresh = eligibleRecipients(type, saved.filter((c) => !excludedPhones.has(c.phone)), { periodMonth, periodYear, sendDate })
        finalAssigned = assignRecipients(fresh, { mode, userIds })
      }
      if (!finalAssigned.length) throw new Error('No eligible recipients to message.')

      const campaign = {
        name: name.trim(),
        type,
        description: description.trim() || null,
        image_base64: image,
        layout,
        message,
        created_by: user.id,
        ...(recurring ? { period_month: periodMonth, period_year: periodYear } : { send_date: sendDate }),
      }
      const created = await createCampaign(campaign, finalAssigned)
      if (saveTemplate) {
        const { error } = await supabase.from('templates').insert({ name: name.trim(), category: type, image_base64: image, message, layout, created_by: user.id })
        if (error) toast(`Campaign launched, but saving the template failed: ${error.message}`, 'error', 7000)
      }
      toast(`Campaign launched. ${finalAssigned.length} greetings are now in your team's lists.`, 'success')
      navigate(`/campaigns/${created.id}`)
    } catch (err) {
      toast(err.message, 'error')
      setLaunching(false)
    }
  }

  const previewCardImage = useCardImage(image, layout, { contact: eligible[0]?.contact, company: settings.company_name, sender: profile?.full_name })

  if (!contacts) return <Spinner />

  const sampleContact = eligible[0]?.contact
  const preview = renderMessage(message, { contact: sampleContact, company: settings.company_name, sender: profile?.full_name })
  const previewCard = previewCardImage
  const categoryTemplates = templates.filter((t) => t.category === type)
  const otherTemplates = templates.filter((t) => t.category !== type)

  return (
    <div className="page wizard">
      <PageHeader title="New campaign" subtitle="Choose the occasion, write the message, then pick who receives it and who sends it." />

      <ol className="stepper">
        {STEPS.map((s, i) => (
          <li key={s} className={i === step ? 'is-current' : i < step ? 'is-done' : ''}>
            <button type="button" disabled={i > step} onClick={() => setStep(i)}>
              <span className="step-num">{i < step ? <Check size={14} /> : i + 1}</span>
              <span className="step-label">{s}</span>
            </button>
          </li>
        ))}
      </ol>

      {step === 0 && (
        <section className="card wizard-card">
          <h3 className="section-title">What's the occasion?</h3>
          <div className="type-grid">
            {Object.entries(CAMPAIGN_TYPES).map(([k, t]) => (
              <button key={k} type="button" className={`type-card ${type === k ? 'is-selected' : ''}`} onClick={() => chooseType(k)} style={{ '--type-color': t.color }}>
                <TypeIcon type={k} size={40} />
                <strong>{t.label}</strong>
                <span>{t.description}</span>
                {t.dateField && <span className="type-card-tag">Recurring</span>}
              </button>
            ))}
          </div>

          {type === 'festival' && (
            <>
              <h3 className="section-title">Pick a festival <span className="muted small">(optional)</span></h3>
              <div className="chip-grid">
                {FESTIVALS.map((f) => (
                  <button key={f.name} type="button" className={`chip chip-lg chip-button ${festival?.name === f.name ? 'is-on' : ''}`} onClick={() => chooseFestival(f)}>
                    {f.emoji} {f.name}
                  </button>
                ))}
              </div>
            </>
          )}

          <h3 className="section-title">Details</h3>
          <div className="form-grid">
            <Field label="Campaign name *" className="span-2">
              <input value={name} onChange={(e) => { setName(e.target.value); setNameTouched(true) }} placeholder="e.g. Diwali 2026 greetings" />
            </Field>
            {recurring ? (
              <>
                <Field label="Month *" hint={`Each contact is wished on their own ${meta.dateField === 'dob' ? 'birthday' : 'anniversary'} in this month`}>
                  <select value={periodMonth} onChange={(e) => setPeriodMonth(Number(e.target.value))}>
                    {MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
                  </select>
                </Field>
                <Field label="Year *">
                  <select value={periodYear} onChange={(e) => setPeriodYear(Number(e.target.value))}>
                    {[now.getFullYear() - 1, now.getFullYear(), now.getFullYear() + 1].map((y) => <option key={y}>{y}</option>)}
                  </select>
                </Field>
                <div className="span-2 quick-picks">
                  <span className="muted small">Quick pick:</span>
                  <button type="button" className="chip chip-button" onClick={() => { setPeriodMonth(now.getMonth() + 1); setPeriodYear(now.getFullYear()) }}>This month</button>
                  <button type="button" className="chip chip-button" onClick={() => { setPeriodMonth(next.getMonth() + 1); setPeriodYear(next.getFullYear()) }}>Next month</button>
                </div>
              </>
            ) : (
              <Field label="Send date *" hint="Everyone in the audience is messaged on this day">
                <input type="date" value={sendDate} onChange={(e) => setSendDate(e.target.value)} />
              </Field>
            )}
            <Field label="Internal note" className={recurring ? 'span-2' : ''} hint="Only visible to your team">
              <input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="e.g. Include 10% Diwali discount code" />
            </Field>
          </div>
        </section>
      )}

      {step === 1 && (
        <section className="wizard-split">
          <div className="card wizard-card">
            {templates.length > 0 && (
              <>
                <h3 className="section-title">Start from a template</h3>
                <div className="template-strip">
                  {[...categoryTemplates, ...otherTemplates].map((t) => (
                    <button key={t.id} type="button" className="template-mini" onClick={() => { setImage(t.image_base64); setLayout(t.layout); setMessage(t.message); setMessageTouched(true) }}>
                      {t.image_base64 ? <img src={t.image_base64} alt="" /> : <TypeIcon type={t.category} size={40} />}
                      <span>{t.name}</span>
                    </button>
                  ))}
                </div>
              </>
            )}
            <h3 className="section-title">Greeting card</h3>
            <ImagePicker value={image} onChange={setImage} />
            {image && (
              <button type="button" className="btn btn-ghost btn-sm card-design-btn" onClick={() => setDesigning(true)}>
                {hasFields(layout) ? 'Change where names appear on the card' : 'Put each client’s name on the card'}
              </button>
            )}
            <h3 className="section-title">Message *</h3>
            <MessageEditor value={message} onChange={(v) => { setMessage(v); setMessageTouched(true) }} />
            <label className="check">
              <input type="checkbox" checked={saveTemplate} onChange={(e) => setSaveTemplate(e.target.checked)} />
              <span>Save this card & message to the template library</span>
            </label>
          </div>
          <div className="preview-col">
            <div className="preview-label">Live preview</div>
            <MessagePreview image={previewCard} text={preview} contactName={sampleContact?.full_name} />
          </div>
        </section>
      )}

      {step === 2 && (
        <section className="card wizard-card">
          <div className="section-title-row">
            <h3 className="section-title">Who should receive it?</h3>
            <Segmented
              value={source}
              onChange={(v) => { setSource(v); setExcluded(new Set()) }}
              options={[{ value: 'contacts', label: 'From contacts' }, { value: 'csv', label: 'Upload CSV' }]}
            />
          </div>

          {source === 'contacts' ? (
            <>
              {contacts.length === 0 ? (
                <div className="alert alert-info"><Info size={16} /> Your contact list is empty. Switch to <strong>Upload CSV</strong> to import clients.</div>
              ) : (
                <Field label="Filter by tags" hint={tagFilter.length ? 'Contacts with any of these tags' : 'No tags selected, so every contact is included'}>
                  <div className="chip-grid">
                    {allTags.length === 0 && <span className="muted small">No tags yet. Add tags on the Contacts page to build segments.</span>}
                    {allTags.map((t) => (
                      <button key={t} type="button" className={`chip chip-button ${tagFilter.includes(t) ? 'is-on' : ''}`}
                        onClick={() => setTagFilter((f) => (f.includes(t) ? f.filter((x) => x !== t) : [...f, t]))}>
                        {t}
                      </button>
                    ))}
                  </div>
                </Field>
              )}
            </>
          ) : (
            <>
              <div className="alert alert-info">
                <FileSpreadsheet size={16} />
                <span>
                  Columns: <strong>name</strong>, <strong>number</strong>{recurring && <>, <strong>{meta.dateField === 'dob' ? 'dob' : 'anniversary'}</strong></>} are required. Optional: dob, anniversary, email, city, tags. Contacts are saved to your list and matched by number, so nobody is added twice.
                </span>
                <button type="button" className="btn btn-link btn-xs" onClick={() => downloadFile(SAMPLE_CSV, 'wishdesk-sample.csv')}><Download size={13} /> Sample</button>
              </div>
              <label className="dropzone">
                <input type="file" accept=".csv,text/csv" hidden onChange={(e) => { handleCsv(e.target.files?.[0]); e.target.value = '' }} />
                <UploadCloud size={26} />
                <strong>{csv ? csv.fileName : 'Choose a CSV file'}</strong>
                <span className="muted small">{csv ? `${csv.rows.length} rows. Click to choose a different file.` : 'Click to choose a file'}</span>
              </label>
              {csvError && <div className="alert alert-error">{csvError}</div>}
              {csv && csv.rows.some((r) => r.errors.length) && (
                <details className="error-details">
                  <summary>{csv.rows.filter((r) => r.errors.length).length} rows will be skipped. Show why</summary>
                  <ul>
                    {csv.rows.map((r, i) => r.errors.length > 0 && <li key={i}>Row {i + 2}: {r.full_name || '(no name)'}: {r.errors.join(', ')}</li>)}
                  </ul>
                </details>
              )}
              {csv && (
                <Field label="Tag imported contacts (optional)" hint="Comma separated, e.g. Diwali-2026, Retail">
                  <input value={importTags} onChange={(e) => setImportTags(e.target.value)} />
                </Field>
              )}
            </>
          )}

          <div className="audience-summary">
            <div><strong>{eligible.length}</strong><span>will receive</span></div>
            {recurring && <div><strong>{missingDate}</strong><span>no {meta.dateField === 'dob' ? 'birthday' : 'anniversary'} on file</span></div>}
            {recurring && <div><strong>{notInMonth}</strong><span>not in {MONTHS[periodMonth - 1]}</span></div>}
            <div><strong>{optedOut}</strong><span>opted out</span></div>
            <div><strong>{excluded.size}</strong><span>excluded by you</span></div>
          </div>

          {allEligible.length > 0 && (
            <div className="table-wrap table-scroll">
              <table className="table">
                <thead><tr><th style={{ width: 36 }} /><th>Name</th><th>Number</th><th>{recurring ? 'Occasion date' : 'Send date'}</th><th>Tags</th></tr></thead>
                <tbody>
                  {allEligible.map(({ contact: c, due_date }) => (
                    <tr key={c.id} className={excluded.has(c.id) ? 'row-muted' : ''}>
                      <td>
                        <input type="checkbox" checked={!excluded.has(c.id)} onChange={() => setExcluded((s) => {
                          const n = new Set(s)
                          n.has(c.id) ? n.delete(c.id) : n.add(c.id)
                          return n
                        })} />
                      </td>
                      <td>{c.full_name}</td>
                      <td>{formatPhone(c.phone)}</td>
                      <td>{formatDayMonth(due_date)}</td>
                      <td>{c.tags?.map((t) => <span key={t} className="chip chip-sm">{t}</span>)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      {step === 3 && (
        <section className="card wizard-card">
          <h3 className="section-title">Who sends these messages?</h3>
          <Segmented
            value={mode}
            onChange={setMode}
            options={[{ value: 'owner', label: 'Keep relationship owners' }, { value: 'even', label: 'Split evenly' }]}
          />
          <p className="muted small">
            {mode === 'owner'
              ? 'Clients go to the team member who owns the relationship. Clients without an owner are shared evenly, and that person becomes their owner.'
              : 'Messages are shared equally among the selected people, spread across the dates.'}
          </p>
          <TeamPicker team={team} selectedIds={userIds} onChange={setUserIds} counts={counts} />
        </section>
      )}

      {step === 4 && (
        <section className="wizard-split">
          <div className="card wizard-card">
            <h3 className="section-title">Review & launch</h3>
            <dl className="review-list">
              <div><dt>Occasion</dt><dd><TypeIcon type={type} size={24} /> {meta.label}{festival && `, ${festival.name}`}</dd></div>
              <div><dt>Name</dt><dd>{name}</dd></div>
              <div><dt>When</dt><dd>{recurring ? `${MONTHS[periodMonth - 1]} ${periodYear}, each client on their own date` : formatDate(sendDate, { weekday: true })}</dd></div>
              <div><dt>Audience</dt><dd>{eligible.length} {eligible.length === 1 ? "contact" : "contacts"} {source === 'csv' ? `from ${csv?.fileName}` : tagFilter.length ? `tagged ${tagFilter.join(', ')}` : 'from your directory'}</dd></div>
              <div>
                <dt>Team</dt>
                <dd>
                  {team.filter((u) => counts[u.id]).map((u) => (
                    <span key={u.id} className="chip"><UsersRound size={12} /> {u.full_name}: {counts[u.id]}</span>
                  ))}
                </dd>
              </div>
              {description && <div><dt>Note</dt><dd>{description}</dd></div>}
            </dl>
            <div className="alert alert-info">
              <Info size={16} />
              <span>Each team member will see their messages in their <strong>Dashboard</strong> on the due date, with a one-tap WhatsApp button.</span>
            </div>
          </div>
          <div className="preview-col">
            <div className="preview-label">Message preview</div>
            <MessagePreview image={previewCard} text={preview} contactName={sampleContact?.full_name} />
          </div>
        </section>
      )}

      {designing && image && (
        <Modal title="Names on the card" subtitle="Drag the name onto the blank line of your card." size="xl" onClose={() => setDesigning(false)}
          footer={<button className="btn btn-primary" onClick={() => setDesigning(false)}>Done</button>}>
          <CardEditor image={image} layout={layout} onChange={setLayout} />
        </Modal>
      )}

      <div className="wizard-nav">
        <button className="btn btn-ghost" onClick={() => (step ? setStep(step - 1) : navigate('/campaigns'))}>
          <ArrowLeft size={16} /> {step ? 'Back' : 'Cancel'}
        </button>
        {step < STEPS.length - 1 ? (
          <button className="btn btn-primary" disabled={!canNext} onClick={() => setStep(step + 1)}>
            Continue <ArrowRight size={16} />
          </button>
        ) : (
          <button className="btn btn-primary" disabled={launching} onClick={launch}>
            <Rocket size={16} /> {launching ? 'Launching…' : `Launch campaign (${eligible.length})`}
          </button>
        )}
      </div>
    </div>
  )
}
