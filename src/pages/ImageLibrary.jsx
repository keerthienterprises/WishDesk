import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Download, Images, PenTool, Pencil, Search, Trash2, Upload } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'
import { deleteMedia, listMedia, renameMedia, uploadImage } from '../lib/media'
import { downloadImage } from '../lib/image'
import { cardFileName } from '../lib/cardRender'
import { formatDate } from '../lib/dates'
import { EmptyState, PageHeader, Spinner } from '../components/ui'

export default function ImageLibrary() {
  const { user } = useAuth()
  const toast = useToast()
  const navigate = useNavigate()
  const [items, setItems] = useState(null)
  const [search, setSearch] = useState('')
  const [progress, setProgress] = useState(null) // { done, total }
  const [dragging, setDragging] = useState(false)

  const load = () => listMedia().then(setItems).catch((e) => { toast(e.message, 'error'); setItems([]) })
  useEffect(() => { load() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  async function uploadMany(fileList) {
    const files = [...(fileList ?? [])].filter((f) => f.type.startsWith('image/'))
    if (!files.length) return
    setProgress({ done: 0, total: files.length })
    let failed = 0
    for (const file of files) {
      try {
        await uploadImage(file, user.id)
      } catch (e) {
        failed++
        toast(`${file.name}: ${e.message}`, 'error', 6000)
      }
      setProgress((p) => ({ ...p, done: p.done + 1 }))
    }
    setProgress(null)
    const ok = files.length - failed
    if (ok) toast(`Uploaded ${ok} image${ok > 1 ? 's' : ''}.`, 'success')
    load()
  }

  async function rename(item) {
    const name = prompt('Image name:', item.name)?.trim()
    if (!name || name === item.name) return
    try {
      await renameMedia(item.id, name)
      setItems((list) => list.map((i) => (i.id === item.id ? { ...i, name } : i)))
    } catch (e) {
      toast(e.message, 'error')
    }
  }

  async function remove(item) {
    if (!confirm(`Delete "${item.name}" from the library? Campaigns and templates already using it will lose the image.`)) return
    try {
      await deleteMedia(item)
      setItems((list) => list.filter((i) => i.id !== item.id))
      toast('Image deleted.', 'success')
    } catch (e) {
      toast(e.message, 'error')
    }
  }

  if (!items) return <Spinner />

  const shown = items.filter((i) => !search || i.name.toLowerCase().includes(search.toLowerCase()))

  return (
    <div className="page">
      <PageHeader
        title="Images"
        subtitle="Upload greeting cards once and reuse them in any campaign or template."
        actions={
          <label className="btn btn-primary">
            <Upload size={16} /> {progress ? `Uploading ${progress.done + 1} of ${progress.total}…` : 'Upload images'}
            <input type="file" accept="image/*" multiple hidden disabled={Boolean(progress)} onChange={(e) => { uploadMany(e.target.files); e.target.value = '' }} />
          </label>
        }
      />

      <section
        className={`card media-drop ${dragging ? 'is-dragging' : ''}`}
        onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => { e.preventDefault(); setDragging(false); uploadMany(e.dataTransfer.files) }}
      >
        {items.length === 0 ? (
          <EmptyState icon={Images} title="No images yet" text="Drop several cards here at once, or use Upload images. Birthday, anniversary and festival cards all live here." />
        ) : (
          <>
            <div className="toolbar media-toolbar">
              <div className="search-box"><Search size={16} /><input placeholder="Search images…" value={search} onChange={(e) => setSearch(e.target.value)} /></div>
              <span className="muted small">{items.length} image{items.length === 1 ? '' : 's'}. Drop files here to add more.</span>
            </div>
            <div className="media-grid">
              {shown.map((item) => (
                <article key={item.id} className="media-tile">
                  <span className="media-thumb"><img src={item.url} alt="" loading="lazy" /></span>
                  <div className="media-info">
                    <span className="media-name" title={item.name}>{item.name}</span>
                    <span className="muted small">Added {formatDate(item.created_at.slice(0, 10))}</span>
                  </div>
                  <div className="media-actions">
                    <button className="btn btn-ghost btn-xs" onClick={() => navigate(`/designer?image=${encodeURIComponent(item.url)}`)} title="Place client names on this card"><PenTool size={13} /> Design</button>
                    <button className="icon-btn" onClick={() => downloadImage(item.url, `${cardFileName(item.name)}.jpg`)} title="Download"><Download size={15} /></button>
                    <button className="icon-btn" onClick={() => rename(item)} title="Rename"><Pencil size={15} /></button>
                    <button className="icon-btn" onClick={() => remove(item)} title="Delete"><Trash2 size={15} /></button>
                  </div>
                </article>
              ))}
            </div>
            {shown.length === 0 && <p className="muted small">No images match “{search}”.</p>}
          </>
        )}
      </section>
    </div>
  )
}
