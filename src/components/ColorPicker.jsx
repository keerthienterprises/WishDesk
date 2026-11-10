import { useState } from 'react'
import { Pipette } from 'lucide-react'

// Colours common on greeting cards
const CARD_SET = ['#1d2a4a', '#0b2545', '#111111', '#ffffff', '#d4af37', '#b8862b', '#c9a227', '#7a1f2b', '#8b0000', '#1f5f4a', '#5b2a86', '#e75480']

// Full palette: a grey row, a bright row, then each hue from light tint to dark shade
const PALETTE = [
  ['#000000', '#434343', '#666666', '#999999', '#b7b7b7', '#cccccc', '#d9d9d9', '#efefef', '#f3f3f3', '#ffffff'],
  ['#980000', '#ff0000', '#ff9900', '#ffff00', '#00ff00', '#00ffff', '#4a86e8', '#0000ff', '#9900ff', '#ff00ff'],
  ['#e6b8af', '#f4cccc', '#fce5cd', '#fff2cc', '#d9ead3', '#d0e0e3', '#c9daf8', '#cfe2f3', '#d9d2e9', '#ead1dc'],
  ['#dd7e6b', '#ea9999', '#f9cb9c', '#ffe599', '#b6d7a8', '#a2c4c9', '#a4c2f4', '#9fc5e8', '#b4a7d6', '#d5a6bd'],
  ['#cc4125', '#e06666', '#f6b26b', '#ffd966', '#93c47d', '#76a5af', '#6d9eeb', '#6fa8dc', '#8e7cc3', '#c27ba0'],
  ['#a61c00', '#cc0000', '#e69138', '#f1c232', '#6aa84f', '#45818e', '#3c78d8', '#3d85c6', '#674ea7', '#a64d79'],
  ['#85200c', '#990000', '#b45f06', '#bf9000', '#38761d', '#134f5c', '#1155cc', '#0b5394', '#351c75', '#741b47'],
  ['#5b0f00', '#660000', '#783f04', '#7f6000', '#274e13', '#0c343d', '#1c4587', '#073763', '#20124d', '#4c1130'],
]

const RECENT_KEY = 'wishdesk.recentColors'

function readRecent() {
  try {
    return JSON.parse(localStorage.getItem(RECENT_KEY)) ?? []
  } catch {
    return []
  }
}

const isHex = (v) => /^#[0-9a-f]{6}$/i.test(v)

export default function ColorPicker({ value, onChange }) {
  const [recent, setRecent] = useState(readRecent)
  const [hex, setHex] = useState(value)
  const [lastValue, setLastValue] = useState(value)
  const canPickFromScreen = typeof window !== 'undefined' && 'EyeDropper' in window

  // Keep the hex box in sync when another field is selected
  if (value !== lastValue) {
    setLastValue(value)
    setHex(value)
  }

  function choose(color) {
    const c = color.toLowerCase()
    onChange(c)
    const next = [c, ...recent.filter((r) => r !== c)].slice(0, 10)
    setRecent(next)
    try {
      localStorage.setItem(RECENT_KEY, JSON.stringify(next))
    } catch {
      /* storage unavailable; recent colours just won't persist */
    }
  }

  async function pickFromScreen() {
    try {
      const { sRGBHex } = await new window.EyeDropper().open()
      choose(sRGBHex)
    } catch {
      /* user pressed Escape */
    }
  }

  const swatch = (c) => (
    <button
      key={c}
      type="button"
      className={`cp-swatch ${value?.toLowerCase() === c ? 'is-on' : ''}`}
      style={{ background: c }}
      onClick={() => choose(c)}
      title={c}
      aria-label={`Colour ${c}`}
    />
  )

  return (
    <div className="color-picker">
      <div className="cp-current">
        <span className="cp-preview" style={{ background: value }} />
        <input
          className="cp-hex"
          value={hex}
          onChange={(e) => {
            const v = e.target.value.startsWith('#') ? e.target.value : `#${e.target.value}`
            setHex(v)
            if (isHex(v)) choose(v)
          }}
          maxLength={7}
          aria-label="Hex colour code"
          spellCheck={false}
        />
        <label className="btn btn-ghost btn-xs cp-wheel" title="Choose any colour">
          <input type="color" value={isHex(value) ? value : '#000000'} onChange={(e) => choose(e.target.value)} />
          Any colour
        </label>
        {canPickFromScreen && (
          <button type="button" className="btn btn-ghost btn-xs" onClick={pickFromScreen} title="Click any spot on the card to copy its colour">
            <Pipette size={13} /> Pick from card
          </button>
        )}
      </div>

      {recent.length > 0 && (
        <>
          <div className="cp-label">Recently used</div>
          <div className="cp-row">{recent.map(swatch)}</div>
        </>
      )}

      <div className="cp-label">Card colours</div>
      <div className="cp-row">{CARD_SET.map(swatch)}</div>

      <div className="cp-label">All colours</div>
      <div className="cp-grid">
        {PALETTE.map((row, i) => (
          <div key={i} className={`cp-grid-row ${i === 1 ? 'cp-gap' : ''}`}>{row.map(swatch)}</div>
        ))}
      </div>
    </div>
  )
}
