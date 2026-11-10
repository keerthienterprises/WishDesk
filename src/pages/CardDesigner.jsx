import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { ArrowLeft, Download, RefreshCw, Rocket, Save } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { useSettings } from '../context/SettingsContext'
import { useToast } from '../context/ToastContext'
import { supabase } from '../lib/supabase'
import { CAMPAIGN_TYPES } from '../lib/campaignTypes'
import { cardFileName, renderCard } from '../lib/cardRender'
import { dataUrlToBlob } from '../lib/image'
import { uploadImage } from '../lib/media'
import { downloadFile } from '../lib/csv'
import CardEditor from '../components/CardEditor'
import { ImagePicker } from '../components/content'
import { Field, PageHeader, Spinner, TypeIcon } from '../components/ui'

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

  const chooseImage = (img) => setImage(img)

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

  async function downloadSample() {
    const contact = { full_name: previewName.trim() }
    const url = await renderCard(image, layout, { contact, company: settings.company_name, sender: profile?.full_name })
    downloadFile(await dataUrlToBlob(url), `${cardFileName(contact.full_name)}.jpg`)
  }

  if (loading) return <Spinner />

  return (
    <div className="page">
      {id && <Link to="/templates" className="back-link"><ArrowLeft size={15} /> Templates</Link>}
      <PageHeader
        title="Card designer"
        subtitle="Upload a greeting card and mark where each client's name should go. Every client then receives the card with their own name on it."
      />

      {!image ? (
        <section className="card designer-start">
          <ImagePicker value={null} onChange={chooseImage} />
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
      ) : (
        <>
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
              <label className="btn btn-ghost">
                <RefreshCw size={15} /> Replace card
                <input type="file" accept="image/*" hidden onChange={(e) => { replaceImage(e.target.files?.[0]); e.target.value = '' }} />
              </label>
              <button className="btn btn-ghost" onClick={downloadSample}><Download size={15} /> Download card</button>
              <button className="btn btn-ghost" onClick={save} disabled={busy}><Save size={15} /> {busy ? 'Saving…' : 'Save'}</button>
              <button className="btn btn-primary" onClick={useInCampaign} disabled={busy}><Rocket size={15} /> Use in a campaign</button>
            </div>
          </section>

          <CardEditor image={image} layout={layout} onChange={setLayout} previewName={previewName} onPreviewNameChange={setPreviewName} />

          <section className="card">
            <Field label="WhatsApp message sent with this card" hint="You can change it later for each campaign. {first_name} becomes the client's first name.">
              <textarea rows={4} value={message} onChange={(e) => setMessage(e.target.value)} />
            </Field>
          </section>
        </>
      )}
    </div>
  )
}
