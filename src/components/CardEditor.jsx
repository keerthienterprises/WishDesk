import { useEffect, useRef, useState } from 'react'
import { AlignCenter, AlignLeft, AlignRight, Bold, Italic, Minus, Plus, Trash2 } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { useSettings } from '../context/SettingsContext'
import { drawCard, ensureFonts, loadImage, newField } from '../lib/cardRender'
import { MESSAGE_VARIABLES } from '../lib/campaignTypes'
import ColorPicker from './ColorPicker'
import FontPicker from './FontPicker'
import { Field, Segmented } from './ui'

const clamp = (v, min = 0, max = 1) => Math.min(max, Math.max(min, v))

// Sizes are shown on a 1080 px-wide scale (a typical card), so "54" means the same on any image.
// Internally a size is stored as a fraction of the card width.
const SCALE = 1080
const MIN_SIZE = 8
const MAX_SIZE = 300
const PRESET_SIZES = [12, 14, 16, 18, 20, 24, 28, 32, 36, 40, 44, 48, 54, 60, 66, 72, 80, 90, 100, 120, 144, 160, 200, 250, 300]

function FontSize({ value, onChange }) {
  const size = Math.round(value * SCALE)
  const set = (n) => onChange(clamp(Math.round(n), MIN_SIZE, MAX_SIZE) / SCALE)
  const step = (dir) => {
    // Jump to the next preset size, like the A↑ / A↓ buttons in document editors
    const next = dir > 0 ? PRESET_SIZES.find((p) => p > size) : [...PRESET_SIZES].reverse().find((p) => p < size)
    set(next ?? size + dir)
  }

  return (
    <div className="font-size">
      <div className="font-size-row">
        <button type="button" className="icon-btn" onClick={() => step(-1)} aria-label="Smaller" title="Smaller"><Minus size={15} /></button>
        <input
          type="number"
          className="font-size-input"
          min={MIN_SIZE}
          max={MAX_SIZE}
          value={size}
          onChange={(e) => e.target.value && set(Number(e.target.value))}
          aria-label="Font size"
        />
        <button type="button" className="icon-btn" onClick={() => step(1)} aria-label="Bigger" title="Bigger"><Plus size={15} /></button>
        <select className="select-sm" value={PRESET_SIZES.includes(size) ? size : ''} onChange={(e) => e.target.value && set(Number(e.target.value))} aria-label="Common sizes">
          <option value="">Sizes</option>
          {PRESET_SIZES.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
      </div>
      <input type="range" min={MIN_SIZE} max={MAX_SIZE} step="1" value={size} onChange={(e) => set(Number(e.target.value))} aria-label="Font size slider" />
    </div>
  )
}

/**
 * Place personalised text (client name etc.) on a greeting card.
 * `layout` is { fields: [...] }; changes are reported through onChange.
 * Bulk mode passes `extraVariables` (spreadsheet column names usable as {Column}),
 * `extraValues` (the previewed row's values) and `previewSlot` (a row navigator instead of the name box).
 */
export default function CardEditor({
  image, layout, onChange, previewName: controlledName, onPreviewNameChange,
  extraVariables = [], extraValues = {}, previewSlot = null,
}) {
  const { profile } = useAuth()
  const { settings } = useSettings()
  const fields = layout?.fields ?? []
  const [selectedId, setSelectedId] = useState(fields[0]?.id ?? null)
  const [ownName, setOwnName] = useState('')
  const previewName = controlledName ?? ownName
  const setPreviewName = onPreviewNameChange ?? setOwnName
  const [img, setImg] = useState(null)
  const [boxes, setBoxes] = useState([])
  const [guide, setGuide] = useState(false)
  const [fontsTick, setFontsTick] = useState(0)
  const canvasRef = useRef(null)
  const stageRef = useRef(null)

  const selected = fields.find((f) => f.id === selectedId)
  const vars = { contact: { full_name: previewName.trim() }, company: settings.company_name, sender: profile?.full_name, extra: extraValues }
  const extraKey = JSON.stringify(extraValues)
  const fontsKey = fields.map((f) => `${f.font}${f.bold}${f.italic}`).join('|')

  useEffect(() => {
    loadImage(image).then(setImg).catch(() => setImg(null))
  }, [image])

  useEffect(() => {
    ensureFonts(layout, vars).then(() => setFontsTick((t) => t + 1))
  }, [fontsKey, previewName, extraKey]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!img || !canvasRef.current) return
    setBoxes(drawCard(canvasRef.current.getContext('2d'), img, layout, vars, { editing: true }))
  }, [img, layout, previewName, extraKey, settings.company_name, fontsTick]) // eslint-disable-line react-hooks/exhaustive-deps

  const setFields = (next) => onChange({ ...(layout ?? {}), fields: next })
  const update = (id, changes) => setFields(fields.map((f) => (f.id === id ? { ...f, ...changes } : f)))

  function addField() {
    const f = newField({ y: fields.length ? clamp(fields.at(-1).y + 0.08) : 0.5 })
    setFields([...fields, f])
    setSelectedId(f.id)
  }

  // Typing a name on a card with no text yet adds a name box so the name shows straight away
  function previewNameChanged(value) {
    setPreviewName(value)
    if (value.trim() && fields.length === 0) {
      const f = newField()
      setFields([f])
      setSelectedId(f.id)
    }
  }

  function removeField(id) {
    setFields(fields.filter((f) => f.id !== id))
    setSelectedId(null)
  }

  function startDrag(e, f) {
    e.preventDefault()
    e.stopPropagation()
    setSelectedId(f.id)
    const rect = stageRef.current.getBoundingClientRect()
    const start = { px: e.clientX, py: e.clientY, x: f.x, y: f.y }
    const move = (ev) => {
      let x = clamp(start.x + (ev.clientX - start.px) / rect.width)
      const y = clamp(start.y + (ev.clientY - start.py) / rect.height)
      const snap = Math.abs(x - 0.5) < 0.012
      if (snap) x = 0.5
      setGuide(snap)
      update(f.id, { x, y })
    }
    const up = () => {
      setGuide(false)
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }

  function onKey(e) {
    if (!selected || !['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) return
    e.preventDefault()
    const step = e.shiftKey ? 0.01 : 0.002
    const dx = e.key === 'ArrowLeft' ? -step : e.key === 'ArrowRight' ? step : 0
    const dy = e.key === 'ArrowUp' ? -step : e.key === 'ArrowDown' ? step : 0
    update(selected.id, { x: clamp(selected.x + dx), y: clamp(selected.y + dy) })
  }

  const W = img?.naturalWidth || 1
  const H = img?.naturalHeight || 1
  const pct = (v, total) => `${(v / total) * 100}%`
  const selectedBox = boxes.find((b) => b.id === selectedId)

  return (
    <div className="card-editor">
      <div className="ce-stage-wrap">
        <div
          ref={stageRef}
          className="ce-stage"
          tabIndex={0}
          onKeyDown={onKey}
          onPointerDown={() => setSelectedId(null)}
          aria-label="Card preview. Drag a text box to move it; arrow keys nudge the selected box."
        >
          <canvas ref={canvasRef} className="ce-canvas" />
          {guide && <div className="ce-guide" />}
          {selected && selectedBox && (
            <div
              className="ce-maxwidth"
              style={{
                left: pct(selected.align === 'center' ? (selected.x - selected.maxWidth / 2) * W : selected.align === 'right' ? (selected.x - selected.maxWidth) * W : selected.x * W, W),
                width: `${selected.maxWidth * 100}%`,
                top: pct(selectedBox.y + selectedBox.h, H),
              }}
            />
          )}
          {boxes.map((b) => {
            const f = fields.find((x) => x.id === b.id)
            if (!f) return null
            return (
              <div
                key={b.id}
                className={`ce-box ${b.id === selectedId ? 'is-selected' : ''}`}
                style={{ left: pct(b.x, W), top: pct(b.y, H), width: pct(b.w, W), height: pct(b.h, H) }}
                onPointerDown={(e) => startDrag(e, f)}
                title="Drag to move"
              />
            )
          })}
        </div>
        <p className="muted small">Drag a text box to move it. Click a box, then use the arrow keys for fine adjustments (hold Shift for bigger steps).</p>
      </div>

      <aside className="ce-panel">
        {previewSlot ?? (
          <Field label="Preview with a name" hint="Optional, only for checking the fit. Each client gets their own name when you send.">
            <input value={previewName} onChange={(e) => previewNameChanged(e.target.value)} placeholder="Type any client name" />
          </Field>
        )}

        <div className="ce-fields">
          <div className="ce-fields-head">
            <span className="field-label">Text on the card</span>
            <button type="button" className="btn btn-ghost btn-xs" onClick={addField}><Plus size={13} /> Add text</button>
          </div>
          {fields.length === 0 && <p className="muted small">No text yet. Add a text box, then drag it onto the blank line of your card.</p>}
          {fields.map((f, i) => (
            <button key={f.id} type="button" className={`ce-field-row ${f.id === selectedId ? 'is-on' : ''}`} onClick={() => setSelectedId(f.id)}>
              <span className="ce-field-num">{i + 1}</span>
              <span className="ce-field-text">{f.text || '(empty)'}</span>
            </button>
          ))}
        </div>

        {selected && (
          <div className="ce-props">
            <Field label="Text">
              <input value={selected.text} onChange={(e) => update(selected.id, { text: e.target.value })} />
            </Field>
            <div className="quick-picks">
              {MESSAGE_VARIABLES.map((v) => (
                <button key={v.key} type="button" className="chip chip-button" onClick={() => update(selected.id, { text: v.key })} title={v.label}>
                  {v.label}
                </button>
              ))}
              {extraVariables.map((col) => (
                <button key={col} type="button" className="chip chip-button" onClick={() => update(selected.id, { text: `{${col}}` })} title={`Column "${col}" from your file`}>
                  {col}
                </button>
              ))}
            </div>

            <div className="field">
              <span className="field-label">Font</span>
              <FontPicker value={selected.font} sampleText={previewName} onChange={(font) => update(selected.id, font)} />
            </div>

            <div className="field">
              <span className="field-label">Font size</span>
              <FontSize value={selected.size} onChange={(size) => update(selected.id, { size })} />
            </div>

            <Field label={`Fit long names within ${Math.round(selected.maxWidth * 100)}% of the width`} hint="The dashed line on the card shows this space">
              <input type="range" min="0.1" max="1" step="0.01" value={selected.maxWidth} onChange={(e) => update(selected.id, { maxWidth: Number(e.target.value) })} />
            </Field>

            <div className="ce-row">
              <div className="ce-style-btns">
                <button type="button" className={`icon-btn ${selected.bold ? 'is-on' : ''}`} onClick={() => update(selected.id, { bold: !selected.bold })} aria-pressed={selected.bold} title="Bold"><Bold size={16} /></button>
                <button type="button" className={`icon-btn ${selected.italic ? 'is-on' : ''}`} onClick={() => update(selected.id, { italic: !selected.italic })} aria-pressed={selected.italic} title="Italic"><Italic size={16} /></button>
              </div>
              <Segmented
                value={selected.align}
                onChange={(align) => update(selected.id, { align })}
                options={[
                  { value: 'left', label: <AlignLeft size={15} aria-label="Align left" /> },
                  { value: 'center', label: <AlignCenter size={15} aria-label="Align centre" /> },
                  { value: 'right', label: <AlignRight size={15} aria-label="Align right" /> },
                ]}
              />
            </div>

            {/* Not a <label>: the picker holds many buttons */}
            <div className="field">
              <span className="field-label">Colour</span>
              <ColorPicker value={selected.color} onChange={(color) => update(selected.id, { color })} />
            </div>

            <button type="button" className="btn btn-danger-ghost btn-sm" onClick={() => removeField(selected.id)}><Trash2 size={14} /> Remove this text</button>
          </div>
        )}
      </aside>
    </div>
  )
}
