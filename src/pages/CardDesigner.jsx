import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import {
  ArrowLeft, ArrowRight, Check, ChevronLeft, ChevronRight, Download, FileArchive, Image as ImageIcon, RefreshCw, Rocket, Ruler, Save, Users,
} from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { useSettings } from '../context/SettingsContext'
import { useToast } from '../context/ToastContext'
import { supabase } from '../lib/supabase'
import { CAMPAIGN_TYPES } from '../lib/campaignTypes'
import { cardFileName, newField, renderCard, renderCardBlob } from '../lib/cardRender'
import { dataUrlToBlob } from '../lib/image'
import { uploadImage } from '../lib/media'
import { downloadFile } from '../lib/csv'
import CardEditor from '../components/CardEditor'
import BulkNames from '../components/BulkNames'
import CardGallery from '../components/CardGallery'
import { ImagePicker } from '../components/content'
import { Field, PageHeader, Progress, Segmented, Spinner, TypeIcon } from '../components/ui'

const MANY_STEPS = ['Names', 'Design', 'Create cards']
const EMPTY_LIST = { people: [], columns: [], note: '' }

export default function CardDesigner() {
  const { id } = useParams()
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const { user, profile } = useAuth()
  const { settings } = useSettings()
  const toast = useToast()
  const [loading, setLoading] = useState(Boolean(id))
  const [image, setImage] = useState(null)
  const [layout, setLayout] = useState({ fields: [] })
  const [name, setName] = useState('')
  const [category, setCategory] = useState('birthday')
  const [message, setMessage] = useState(CAMPAIGN_TYPES.birthday.defaultMessage)
  const [templates, setTemplates] = useState([])
  const [busy, setBusy] = useState(false)
  const [previewName, setPreviewName] = useState('')
  // 'one' = a single card, 'many' = a card for every name in a list; null = not chosen yet
  const [mode, setMode] = useState(id ? 'one' : null)
  const [step, setStep] = useState(0)
  const [list, setList] = useState(EMPTY_LIST)
  const [previewIndex, setPreviewIndex] = useState(0)

  useEffect(() => {
    if (id) {
      supabase.from('templates').select('*').eq('id', id).single().then(({ data, error }) => {
        if (error) toast(error.message, 'error')
        if (data) {
          setImage(data.image_base64)
          setLayout(data.layout ?? { fields: [] })
          setName(data.name)
          setCategory(data.category)
          setMessage(data.message)
        }
        setLoading(false)
      })
    } else {
      const fromLibrary = params.get('image')
      if (fromLibrary) setImage(fromLibrary)
      supabase.from('templates').select('id, name, category, image_base64').not('image_base64', 'is', null)
        .order('created_at', { ascending: false }).then(({ data }) => setTemplates(data ?? []))
    }
  }, [id, params, toast])

  const vars = (contactName, extra = {}) => ({ contact: { full_name: contactName }, company: settings.company_name, sender: profile?.full_name, extra })
  const included = list.people.filter((p) => p.include)
  const current = included[Math.min(previewIndex, Math.max(0, included.length - 1))]

  async function replaceImage(file) {
    if (!file) return
    try {
      setImage((await uploadImage(file, user.id)).url)
    } catch (e) {
      toast(e.message, 'error')
    }
  }

  async function save() {
    if (!name.trim()) {
      toast('Give the design a name before saving.', 'error')
      return null
    }
    setBusy(true)
    const values = { name: name.trim(), category, image_base64: image, message, layout }
    const { data, error } = id
      ? await supabase.from('templates').update(values).eq('id', id).select('id').single()
      : await supabase.from('templates').insert({ ...values, created_by: user.id }).select('id').single()
    setBusy(false)
    if (error) {
      toast(error.message, 'error')
      return null
    }
    toast('Design saved to your templates.', 'success')
    if (!id) navigate(`/designer/${data.id}`, { replace: true })
    return data.id
  }

  async function useInCampaign() {
    const savedId = await save()
    if (savedId) navigate(`/campaigns/new?template=${savedId}`)
  }

  async function downloadOne() {
    const url = await renderCard(image, layout, vars(previewName.trim()))
    downloadFile(await dataUrlToBlob(url), `${cardFileName(previewName)}.jpg`)
  }

  function goToStep(next) {
    // Arriving at Design with no text yet: start with a name box so the first name shows immediately
    if (next === 1 && !layout.fields?.length) setLayout({ ...layout, fields: [newField()] })
    setStep(next)
  }

  function chooseMode(next) {
    setMode(next)
    setStep(0)
  }

  if (loading) return <Spinner />

  return (
    <div className="page">
      {id && <Link to="/templates" className="back-link"><ArrowLeft size={15} /> Templates</Link>}
      <PageHeader
        title="Card designer"
        subtitle="Put your clients' names on a greeting card: one card at a time, or a whole list at once from Excel, CSV or your contacts."
      />

      {!image && (
        <section className="card designer-start">
          <ImagePicker value={null} onChange={setImage} />
          {templates.length > 0 && (
            <>
              <h3 className="section-title">Or start from a card you already have</h3>
              <div className="template-strip">
                {templates.map((t) => (
                  <button key={t.id} type="button" className="template-mini" onClick={() => navigate(`/designer/${t.id}`)}>
                    {t.image_base64 ? <img src={t.image_base64} alt="" /> : <TypeIcon type={t.category} size={40} />}
                    <span>{t.name}</span>
                  </button>
                ))}
              </div>
            </>
          )}
        </section>
      )}

      {image && !mode && (
        <section className="card mode-choice">
          <img className="mode-card-preview" src={image} alt="Your greeting card" />
          <div className="mode-options">
            <h2>How many cards do you need?</h2>
            <p className="muted">You can switch at any time.</p>
            <button type="button" className="mode-option" onClick={() => chooseMode('one')}>
              <span className="mode-icon"><ImageIcon size={22} /></span>
              <span>
                <strong>One card</strong>
                <span>Type a name, place it on the card, then download it or use the design in a campaign.</span>
              </span>
              <ArrowRight size={18} />
            </button>
            <button type="button" className="mode-option" onClick={() => chooseMode('many')}>
              <span className="mode-icon"><Users size={22} /></span>
              <span>
                <strong>Many cards, one for each name</strong>
                <span>Upload an Excel or CSV file, paste a list, or pick contacts. Get every card in one ZIP file, each named after the person.</span>
              </span>
              <ArrowRight size={18} />
            </button>
            <button type="button" className="btn btn-link btn-sm" onClick={() => setImage(null)}>Choose a different card</button>
          </div>
        </section>
      )}

      {image && mode && (
        <section className="card designer-bar">
          <Field label="Design name">
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Client birthday, gold" />
          </Field>
          <Field label="Occasion">
            <select value={category} onChange={(e) => {
              const next = e.target.value
              if (message === CAMPAIGN_TYPES[category].defaultMessage) setMessage(CAMPAIGN_TYPES[next].defaultMessage)
              setCategory(next)
            }}>
              {Object.entries(CAMPAIGN_TYPES).map(([k, t]) => <option key={k} value={k}>{t.label}</option>)}
            </select>
          </Field>
          <div className="designer-actions">
            <Segmented value={mode} onChange={chooseMode} options={[{ value: 'one', label: 'One card' }, { value: 'many', label: 'Many cards' }]} />
            <label className="btn btn-ghost">
              <RefreshCw size={15} /> Replace card
              <input type="file" accept="image/*" hidden onChange={(e) => { replaceImage(e.target.files?.[0]); e.target.value = '' }} />
            </label>
            {mode === 'one' && <button className="btn btn-ghost" onClick={downloadOne}><Download size={15} /> Download card</button>}
            <button className="btn btn-ghost" onClick={save} disabled={busy}><Save size={15} /> {busy ? 'Saving…' : 'Save design'}</button>
            <button className="btn btn-primary" onClick={useInCampaign} disabled={busy}><Rocket size={15} /> Use in a campaign</button>
          </div>
        </section>
      )}

      {image && mode === 'one' && (
        <>
          <CardEditor image={image} layout={layout} onChange={setLayout} previewName={previewName} onPreviewNameChange={setPreviewName} />
          <section className="card">
            <Field label="WhatsApp message sent with this card" hint="You can change it later for each campaign. {first_name} becomes the client's first name.">
              <textarea rows={4} value={message} onChange={(e) => setMessage(e.target.value)} />
            </Field>
          </section>
        </>
      )}

      {image && mode === 'many' && (
        <>
          <ol className="stepper">
            {MANY_STEPS.map((s, i) => (
              <li key={s} className={i === step ? 'is-current' : i < step ? 'is-done' : ''}>
                <button type="button" disabled={i > 0 && !included.length} onClick={() => goToStep(i)}>
                  <span className="step-num">{i < step ? <Check size={14} /> : i + 1}</span>
                  <span className="step-label">{s}</span>
                </button>
              </li>
            ))}
          </ol>

          {step === 0 && (
            <>
              <BulkNames value={list} onChange={(next) => { setList(next); setPreviewIndex(0) }} />
              <div className="wizard-nav">
                <button className="btn btn-ghost" onClick={() => setMode(null)}><ArrowLeft size={16} /> Back</button>
                <button className="btn btn-primary" disabled={!included.length} onClick={() => goToStep(1)}>
                  Continue with {included.length} name{included.length === 1 ? '' : 's'} <ArrowRight size={16} />
                </button>
              </div>
            </>
          )}

          {step === 1 && current && (
            <>
              <CardEditor
                image={image}
                layout={layout}
                onChange={setLayout}
                previewName={current.name}
                extraVariables={list.columns}
                extraValues={current.extra}
                previewSlot={
                  <RowNavigator
                    people={included}
                    index={Math.min(previewIndex, included.length - 1)}
                    onIndex={setPreviewIndex}
                  />
                }
              />
              <div className="wizard-nav">
                <button className="btn btn-ghost" onClick={() => setStep(0)}><ArrowLeft size={16} /> Names</button>
                <button className="btn btn-primary" disabled={!layout.fields?.length} onClick={() => setStep(2)}>
                  Looks good, create {included.length} cards <ArrowRight size={16} />
                </button>
              </div>
            </>
          )}

          {step === 2 && (
            <BulkGenerate
              image={image}
              layout={layout}
              people={included}
              designName={name}
              makeVars={vars}
              onBack={() => setStep(1)}
              onSave={save}
              saving={busy}
              onExclude={(person) => setList((l) => ({ ...l, people: l.people.map((x) => (x.id === person.id ? { ...x, include: false } : x)) }))}
            />
          )}
        </>
      )}
    </div>
  )
}

// Flip through the real list while designing, so long and short names can both be checked
function RowNavigator({ people, index, onIndex }) {
  const longest = people.reduce((best, p, i) => (p.name.length > people[best].name.length ? i : best), 0)
  return (
    <div className="field row-nav">
      <span className="field-label">Previewing card {index + 1} of {people.length}</span>
      <div className="row-nav-controls">
        <button type="button" className="icon-btn" onClick={() => onIndex(Math.max(0, index - 1))} disabled={index === 0} aria-label="Previous name"><ChevronLeft size={18} /></button>
        <strong className="row-nav-name" title={people[index].name}>{people[index].name}</strong>
        <button type="button" className="icon-btn" onClick={() => onIndex(Math.min(people.length - 1, index + 1))} disabled={index === people.length - 1} aria-label="Next name"><ChevronRight size={18} /></button>
      </div>
      <button type="button" className="btn btn-ghost btn-xs" onClick={() => onIndex(longest)}><Ruler size={13} /> Check the longest name</button>
      <span className="field-hint">Long names shrink automatically to fit the dashed line.</span>
    </div>
  )
}

// Render every card, zip them, download
function BulkGenerate({ image, layout, people, designName, makeVars, onBack, onSave, saving, onExclude }) {
  const toast = useToast()
  const [state, setState] = useState({ phase: 'ready' }) // ready | running | finished
  const cancelled = useRef(false)

  async function run() {
    cancelled.current = false
    setState({ phase: 'running', done: 0, total: people.length, current: '' })
    const files = {}
    const used = new Map()
    const failed = []
    for (let i = 0; i < people.length; i++) {
      if (cancelled.current) break
      const p = people[i]
      setState((s) => ({ ...s, current: p.name }))
      try {
        const blob = await renderCardBlob(image, layout, makeVars(p.name, p.extra))
        let base = cardFileName(p.name)
        const n = (used.get(base) ?? 0) + 1
        used.set(base, n)
        if (n > 1) base = `${base}_${n}`
        files[`${base}.jpg`] = [new Uint8Array(await blob.arrayBuffer()), { level: 0 }] // JPEGs are already compressed
      } catch {
        failed.push(p.name)
      }
      setState((s) => ({ ...s, done: i + 1 }))
      if (i % 4 === 3) await new Promise((r) => setTimeout(r)) // keep the page responsive
    }
    const count = Object.keys(files).length
    if (!count) {
      setState({ phase: 'ready' })
      return toast('No cards were created.', 'error')
    }
    const { zipSync } = await import('fflate')
    const zip = new Blob([zipSync(files)], { type: 'application/zip' })
    const fileName = `${cardFileName(designName || 'greeting-cards')}_${count}_cards.zip`
    downloadFile(zip, fileName)
    setState({ phase: 'finished', count, failed, zip, fileName, stopped: cancelled.current })
  }

  if (state.phase === 'running') {
    const pct = (state.done / state.total) * 100
    return (
      <section className="card wizard-card bulk-progress">
        <h3 className="section-title">Creating cards… {state.done} of {state.total}</h3>
        <Progress value={pct} />
        <p className="muted small">Working on: {state.current}. Keep this tab open until it finishes.</p>
        <div className="row-end"><button className="btn btn-ghost" onClick={() => { cancelled.current = true }}>Stop</button></div>
      </section>
    )
  }

  if (state.phase === 'finished') {
    return (
      <section className="card wizard-card bulk-done">
        <div className="bulk-done-head">
          <span className="mode-icon"><FileArchive size={22} /></span>
          <div>
            <h3 className="section-title">{state.count} cards are ready{state.stopped ? ' (stopped early)' : ''}</h3>
            <p className="muted">Your download, <strong>{state.fileName}</strong>, should have started. Each card is named after the person, like Ravi_Kumar.jpg.</p>
          </div>
        </div>
        {state.failed.length > 0 && <div className="alert alert-error">These couldn't be created: {state.failed.join(', ')}</div>}
        <div className="row gap">
          <button className="btn btn-primary" onClick={() => downloadFile(state.zip, state.fileName)}><Download size={15} /> Download again</button>
          <button className="btn btn-ghost" onClick={onSave} disabled={saving}><Save size={15} /> Save this design</button>
          <button className="btn btn-ghost" onClick={() => setState({ phase: 'ready' })}>Create them again</button>
          <button className="btn btn-link" onClick={onBack}>Change the design</button>
        </div>
      </section>
    )
  }

  if (!people.length) {
    return (
      <section className="card wizard-card">
        <h3 className="section-title">No cards left to create</h3>
        <p className="muted">Everyone was left out. Go back to Names and tick the people you want cards for.</p>
        <div className="wizard-nav"><button className="btn btn-ghost" onClick={onBack}><ArrowLeft size={16} /> Design</button></div>
      </section>
    )
  }

  return (
    <>
    <section className="card wizard-card">
      <h3 className="section-title">Ready to create {people.length} cards</h3>
      <dl className="review-list">
        <div><dt>Cards</dt><dd>{people.length}, one for each name</dd></div>
        <div><dt>File names</dt><dd>{cardFileName(people[0]?.name)}.jpg, {people[1] ? `${cardFileName(people[1].name)}.jpg, ` : ''}…</dd></div>
        <div><dt>Download</dt><dd>One ZIP file with all the cards</dd></div>
      </dl>
      <p className="muted small">This runs in your browser. Larger lists take a little longer, roughly a minute for 300 cards.</p>
      <div className="wizard-nav">
        <button className="btn btn-ghost" onClick={onBack}><ArrowLeft size={16} /> Design</button>
        <button className="btn btn-primary" onClick={run}><FileArchive size={16} /> Create and download {people.length} cards</button>
      </div>
    </section>

    <section className="card">
      <div className="card-title-row">
        <div className="card-title">Check every card</div>
        <span className="muted small">Click a card to see it full size. Use Leave out to skip anyone.</span>
      </div>
      <CardGallery image={image} layout={layout} people={people} makeVars={makeVars} onExclude={onExclude} />
    </section>
    </>
  )
}
