import { useEffect, useRef, useState } from 'react'
import { ChevronLeft, ChevronRight, Download, EyeOff, X } from 'lucide-react'
import { useToast } from '../context/ToastContext'
import { cardFileName, renderCard, renderCardThumbnail } from '../lib/cardRender'
import { downloadImage } from '../lib/image'

const PAGE = 48

/**
 * Preview every personalised card before creating them. Thumbnails render only when scrolled into view.
 * makeVars(name, extra) builds the render variables; onExclude(person) leaves someone out.
 */
export default function CardGallery({ image, layout, people, makeVars, onExclude }) {
  const [limit, setLimit] = useState(PAGE)
  const [open, setOpen] = useState(null) // index into people
  const layoutKey = JSON.stringify(layout)

  // Keep the open card valid when someone is left out
  const openIndex = open === null ? null : Math.min(open, people.length - 1)

  return (
    <div className="gallery">
      <div className="gallery-grid">
        {people.slice(0, limit).map((p, i) => (
          <Thumb key={`${p.id}-${layoutKey}`} image={image} layout={layout} vars={makeVars(p.name, p.extra)} name={p.name} onClick={() => setOpen(i)} />
        ))}
      </div>
      {people.length > limit && (
        <div className="table-more"><button type="button" className="btn btn-ghost btn-sm" onClick={() => setLimit(limit + PAGE)}>Show more cards ({people.length - limit} more)</button></div>
      )}
      {openIndex !== null && people.length > 0 && (
        <Lightbox
          image={image}
          layout={layout}
          people={people}
          index={openIndex}
          makeVars={makeVars}
          onIndex={setOpen}
          onClose={() => setOpen(null)}
          onExclude={(p) => {
            onExclude(p)
            if (people.length <= 1) setOpen(null)
          }}
        />
      )}
    </div>
  )
}

function Thumb({ image, layout, vars, name, onClick }) {
  const ref = useRef(null)
  const [url, setUrl] = useState(null)

  useEffect(() => {
    const el = ref.current
    let objectUrl = null
    let cancelled = false
    const io = new IntersectionObserver((entries) => {
      if (!entries[0].isIntersecting) return
      io.disconnect()
      renderCardThumbnail(image, layout, vars).then((u) => {
        if (cancelled) return URL.revokeObjectURL(u)
        objectUrl = u
        setUrl(u)
      }).catch(() => {})
    }, { rootMargin: '300px' })
    io.observe(el)
    return () => {
      cancelled = true
      io.disconnect()
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps -- remounted (new key) when the design changes

  return (
    <button ref={ref} type="button" className="gallery-tile" onClick={onClick} title={`Preview ${name}'s card`}>
      <span className="gallery-img">{url ? <img src={url} alt={`Card for ${name}`} /> : <span className="skeleton-box" />}</span>
      <span className="gallery-name">{name}</span>
    </button>
  )
}

function Lightbox({ image, layout, people, index, makeVars, onIndex, onClose, onExclude }) {
  const toast = useToast()
  const [url, setUrl] = useState(null)
  const person = people[index]

  useEffect(() => {
    let cancelled = false
    setUrl(null)
    renderCard(image, layout, makeVars(person.name, person.extra)).then((u) => !cancelled && setUrl(u)).catch(() => {})
    return () => { cancelled = true }
  }, [person, image, layout]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') onClose()
      if (e.key === 'ArrowLeft' && index > 0) onIndex(index - 1)
      if (e.key === 'ArrowRight' && index < people.length - 1) onIndex(index + 1)
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [index, people.length, onIndex, onClose])

  return (
    <div className="lightbox" onMouseDown={onClose} role="dialog" aria-modal="true" aria-label={`Card for ${person.name}`}>
      <div className="lightbox-inner" onMouseDown={(e) => e.stopPropagation()}>
        <div className="lightbox-bar">
          <strong>{person.name}</strong>
          <span className="muted small">Card {index + 1} of {people.length}</span>
          <span className="spacer" />
          <button type="button" className="btn btn-ghost btn-sm" disabled={!url}
            onClick={() => downloadImage(url, `${cardFileName(person.name)}.jpg`).catch((e) => toast(e.message, 'error'))}>
            <Download size={14} /> Download this card
          </button>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => onExclude(person)}><EyeOff size={14} /> Leave out</button>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Close"><X size={18} /></button>
        </div>
        <div className="lightbox-stage">
          <button type="button" className="lightbox-arrow" onClick={() => onIndex(index - 1)} disabled={index === 0} aria-label="Previous card"><ChevronLeft size={26} /></button>
          {url ? <img src={url} alt={`Card for ${person.name}`} /> : <span className="spinner" />}
          <button type="button" className="lightbox-arrow" onClick={() => onIndex(index + 1)} disabled={index === people.length - 1} aria-label="Next card"><ChevronRight size={26} /></button>
        </div>
      </div>
    </div>
  )
}
