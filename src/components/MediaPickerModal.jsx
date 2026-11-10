import { useEffect, useState } from 'react'
import { Images, Search, Upload } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'
import { listMedia, uploadImage } from '../lib/media'
import { EmptyState, Modal, Spinner } from './ui'

// Pick an image from the library (or upload one and pick it)
export default function MediaPickerModal({ onSelect, onClose }) {
  const { user } = useAuth()
  const toast = useToast()
  const [items, setItems] = useState(null)
  const [search, setSearch] = useState('')
  const [uploading, setUploading] = useState(false)

  useEffect(() => {
    listMedia().then(setItems).catch((e) => { toast(e.message, 'error'); setItems([]) })
  }, [toast])

  async function upload(file) {
    if (!file) return
    setUploading(true)
    try {
      onSelect(await uploadImage(file, user.id))
    } catch (e) {
      toast(e.message, 'error')
      setUploading(false)
    }
  }

  const shown = (items ?? []).filter((i) => !search || i.name.toLowerCase().includes(search.toLowerCase()))

  return (
    <Modal
      title="Image library"
      subtitle="Pick a card you've uploaded before, or upload a new one."
      size="xl"
      onClose={onClose}
      footer={
        <>
          <label className="btn btn-ghost">
            <Upload size={15} /> {uploading ? 'Uploading…' : 'Upload new image'}
            <input type="file" accept="image/*" hidden disabled={uploading} onChange={(e) => { upload(e.target.files?.[0]); e.target.value = '' }} />
          </label>
          <span className="spacer" />
          <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
        </>
      }
    >
      {!items ? <Spinner /> : items.length === 0 ? (
        <EmptyState icon={Images} title="Your library is empty" text="Upload a card here and it will be ready to reuse in every campaign." />
      ) : (
        <>
          <div className="search-box media-search"><Search size={16} /><input placeholder="Search images…" value={search} onChange={(e) => setSearch(e.target.value)} autoFocus /></div>
          <div className="media-grid">
            {shown.map((item) => (
              <button key={item.id} type="button" className="media-tile media-tile-pick" onClick={() => onSelect(item)} title={`Use ${item.name}`}>
                <span className="media-thumb"><img src={item.url} alt="" loading="lazy" /></span>
                <span className="media-name">{item.name}</span>
              </button>
            ))}
          </div>
          {shown.length === 0 && <p className="muted small">No images match “{search}”.</p>}
        </>
      )}
    </Modal>
  )
}
