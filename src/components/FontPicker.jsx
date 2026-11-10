import { useEffect, useMemo, useRef, useState } from 'react'
import { ChevronDown, Search } from 'lucide-react'
import { SYSTEM_FONTS, fontQuery, fontStack, isSystemFont, loadFontFamily } from '../lib/cardRender'
import { Modal, Spinner } from './ui'

// Fonts that suit greeting cards, shown first
const RECOMMENDED = [
  'Playfair Display', 'Great Vibes', 'Dancing Script', 'Cinzel', 'Cinzel Decorative', 'Cormorant Garamond', 'Lora', 'EB Garamond',
  'Libre Baskerville', 'Merriweather', 'Marcellus', 'Abril Fatface', 'Allura', 'Alex Brush', 'Parisienne', 'Pinyon Script',
  'Sacramento', 'Satisfy', 'Tangerine', 'Italianno', 'Pacifico', 'Kaushan Script', 'Cookie', 'Yellowtail', 'Courgette',
  'Lobster', 'Montserrat', 'Poppins', 'Raleway', 'Lato', 'Open Sans', 'Roboto', 'Bebas Neue', 'Times New Roman', 'Georgia', 'Garamond',
  'Noto Sans Telugu', 'Noto Serif Telugu', 'Mandali', 'Ramabhadra', 'NTR', 'Gurajada', 'Tenali Ramakrishna',
]

const CATEGORY_LABELS = { serif: 'Serif', 'sans-serif': 'Sans serif', display: 'Display', handwriting: 'Handwriting', monospace: 'Monospace' }

// Sample words so script fonts show their own letters ("greetings")
const SCRIPT_SAMPLES = {
  telugu: { label: 'Telugu', sample: 'శుభాకాంక్షలు' },
  devanagari: { label: 'Hindi / Marathi', sample: 'शुभकामनाएं' },
  tamil: { label: 'Tamil', sample: 'வாழ்த்துக்கள்' },
  kannada: { label: 'Kannada', sample: 'ಶುಭಾಶಯಗಳು' },
  malayalam: { label: 'Malayalam', sample: 'ആശംസകൾ' },
  bengali: { label: 'Bengali', sample: 'শুভেচ্ছা' },
  gujarati: { label: 'Gujarati', sample: 'શુભેચ્છા' },
  gurmukhi: { label: 'Punjabi', sample: 'ਵਧਾਈਆਂ' },
  oriya: { label: 'Odia', sample: 'ଶୁଭେଚ୍ଛା' },
}

const PAGE = 60

// Case, spaces and punctuation don't matter when searching ("times new roman -" finds Times New Roman)
const normalize = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '')

let catalogPromise
function loadCatalog() {
  catalogPromise ??= import('../lib/googleFonts.json').then(({ default: data }) => [
    ...SYSTEM_FONTS.map((f) => ({ ...f, weights: [400, 700], italic: true, scripts: [], system: true })),
    ...data.fonts.map(([family, cat, weights, italic, mask]) => ({
      family,
      category: data.categories[cat],
      weights: weights.split(',').map(Number),
      italic: Boolean(italic),
      scripts: data.scripts.filter((_, i) => mask & (1 << i)),
    })),
  ])
  return catalogPromise
}

/** Button showing the current font; opens the full Google Fonts catalogue. */
export default function FontPicker({ value, onChange, sampleText }) {
  const [open, setOpen] = useState(false)
  useEffect(() => { loadFontFamily(value, null, value) }, [value])

  return (
    <>
      <button type="button" className="font-trigger" onClick={() => setOpen(true)} style={{ fontFamily: fontStack(value) }}>
        <span>{value}</span>
        <ChevronDown size={16} />
      </button>
      {open && (
        <FontModal
          current={value}
          sampleText={sampleText}
          onClose={() => setOpen(false)}
          onSelect={(font) => {
            onChange({ font: font.family, fontQuery: isSystemFont(font.family) ? null : fontQuery(font.weights, font.italic) })
            setOpen(false)
          }}
        />
      )}
    </>
  )
}

function FontModal({ current, sampleText, onSelect, onClose }) {
  const [fonts, setFonts] = useState(null)
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState('recommended')
  const [script, setScript] = useState('')
  const [limit, setLimit] = useState(PAGE)
  const sentinel = useRef(null)

  useEffect(() => { loadCatalog().then(setFonts) }, [])

  const shown = useMemo(() => {
    if (!fonts) return []
    const q = normalize(search)
    let list = fonts
    if (q) list = list.filter((f) => normalize(f.family).includes(q))
    else if (category === 'recommended' && !script) {
      const order = new Map(RECOMMENDED.map((name, i) => [name, i]))
      list = list.filter((f) => order.has(f.family)).sort((a, b) => order.get(a.family) - order.get(b.family))
    }
    if (category === 'system') list = list.filter((f) => f.system)
    else if (category !== 'recommended' && category !== 'all') list = list.filter((f) => f.category === category)
    if (script) list = list.filter((f) => f.scripts.includes(script))
    return list
  }, [fonts, search, category, script])

  // Reset paging whenever the filter changes
  const filterKey = `${search}|${category}|${script}`
  const [lastKey, setLastKey] = useState(filterKey)
  if (filterKey !== lastKey) {
    setLastKey(filterKey)
    setLimit(PAGE)
  }

  // Load more as the end of the list scrolls into view
  useEffect(() => {
    const el = sentinel.current
    if (!el) return
    const io = new IntersectionObserver((entries) => entries[0].isIntersecting && setLimit((l) => l + PAGE))
    io.observe(el)
    return () => io.disconnect()
  }, [shown, limit])

  const sample = script ? SCRIPT_SAMPLES[script].sample : sampleText?.trim()

  return (
    <Modal title="Choose a font" subtitle={fonts ? `${fonts.length.toLocaleString('en-IN')} free Google Fonts` : 'Loading fonts…'} size="lg" onClose={onClose}>
      <div className="font-filters">
        <div className="search-box"><Search size={16} /><input placeholder="Search fonts by name…" value={search} onChange={(e) => setSearch(e.target.value)} autoFocus /></div>
        <select className="select-sm" value={script} onChange={(e) => setScript(e.target.value)} aria-label="Language">
          <option value="">Any language</option>
          {Object.entries(SCRIPT_SAMPLES).map(([k, s]) => <option key={k} value={k}>{s.label}</option>)}
        </select>
      </div>
      <div className="font-cats">
        {[['recommended', 'Good for cards'], ['all', 'All'], ...Object.entries(CATEGORY_LABELS), ['system', 'Windows / Office']].map(([k, label]) => (
          <button key={k} type="button" className={`chip chip-button ${category === k ? 'is-on' : ''}`} onClick={() => setCategory(k)}>{label}</button>
        ))}
      </div>

      {!fonts ? <Spinner label="Loading fonts…" /> : shown.length === 0 ? (
        <p className="muted small">No fonts match. Try another name or filter.</p>
      ) : (
        <div className="font-list">
          {shown.slice(0, limit).map((f) => (
            <FontRow key={f.family} font={f} sample={sample} selected={f.family === current} onSelect={() => onSelect(f)} />
          ))}
          {limit < shown.length && <div ref={sentinel} className="font-more">Loading more fonts…</div>}
        </div>
      )}
    </Modal>
  )
}

// One font, previewed in itself; the font file is fetched only when the row scrolls into view
function FontRow({ font, sample, selected, onSelect }) {
  const ref = useRef(null)
  const [ready, setReady] = useState(false)
  const text = sample || font.family

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const io = new IntersectionObserver((entries) => {
      if (!entries[0].isIntersecting) return
      io.disconnect()
      const regular = font.weights.reduce((a, b) => (Math.abs(b - 400) < Math.abs(a - 400) ? b : a))
      loadFontFamily(font.family, `wght@${regular}`, text).then(() => setReady(true))
    }, { rootMargin: '200px' })
    io.observe(el)
    return () => io.disconnect()
  }, [font, text])

  return (
    <button ref={ref} type="button" className={`font-row ${selected ? 'is-on' : ''}`} onClick={onSelect}>
      <span className="font-row-sample" style={{ fontFamily: ready ? fontStack(font.family) : 'inherit', opacity: ready ? 1 : 0.35 }}>{text}</span>
      <span className="font-row-meta">
        <strong>{font.family}</strong>
        <span className="muted small">
          {CATEGORY_LABELS[font.category]}
          {font.scripts.length > 0 && `, ${font.scripts.map((s) => SCRIPT_SAMPLES[s].label).join(', ')}`}
          {font.system && (font.fallback ? `, Windows font (shows as ${font.fallback} on phones, same look)` : ', Windows font (phones show a similar font)')}
        </span>
      </span>
    </button>
  )
}
