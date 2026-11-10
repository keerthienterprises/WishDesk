import { useEffect, useState } from 'react'
import { renderMessage } from './whatsapp'

// Any Google Font can be used on a card. A field stores the font family plus `fontQuery`,
// the weights/italics to request (e.g. "ital,wght@0,400;0,700;1,400;1,700"), so cards can be
// rendered anywhere without the font catalogue.

// Windows / Microsoft Office fonts. They are only installed on some devices (not phones), so each one
// that has a free metric-compatible twin on Google Fonts falls back to it and looks the same everywhere.
export const SYSTEM_FONTS = [
  { family: 'Times New Roman', category: 'serif', fallback: 'Tinos' },
  { family: 'Georgia', category: 'serif', fallback: 'Gelasio' },
  { family: 'Cambria', category: 'serif', fallback: 'Caladea' },
  { family: 'Garamond', category: 'serif', fallback: 'EB Garamond' },
  { family: 'Book Antiqua', category: 'serif' },
  { family: 'Palatino Linotype', category: 'serif' },
  { family: 'Bookman Old Style', category: 'serif' },
  { family: 'Constantia', category: 'serif' },
  { family: 'Arial', category: 'sans-serif', fallback: 'Arimo' },
  { family: 'Arial Black', category: 'sans-serif' },
  { family: 'Calibri', category: 'sans-serif', fallback: 'Carlito' },
  { family: 'Verdana', category: 'sans-serif' },
  { family: 'Tahoma', category: 'sans-serif' },
  { family: 'Trebuchet MS', category: 'sans-serif' },
  { family: 'Segoe UI', category: 'sans-serif' },
  { family: 'Century Gothic', category: 'sans-serif' },
  { family: 'Candara', category: 'sans-serif' },
  { family: 'Corbel', category: 'sans-serif' },
  { family: 'Franklin Gothic Medium', category: 'sans-serif' },
  { family: 'Impact', category: 'display' },
  { family: 'Comic Sans MS', category: 'handwriting' },
  { family: 'Monotype Corsiva', category: 'handwriting' },
  { family: 'Lucida Handwriting', category: 'handwriting' },
  { family: 'Brush Script MT', category: 'handwriting' },
  { family: 'Gabriola', category: 'handwriting' },
  { family: 'Courier New', category: 'monospace', fallback: 'Cousine' },
  { family: 'Consolas', category: 'monospace' },
]
const SYSTEM_BY_NAME = new Map(SYSTEM_FONTS.map((f) => [f.family, f]))
export const isSystemFont = (family) => SYSTEM_BY_NAME.has(family)
const FALLBACK_QUERY = 'ital,wght@0,400;0,700;1,400;1,700' // all the fallback twins have these

// The Google Fonts css2 axis query for a font: its closest-to-regular and closest-to-bold weights
export function fontQuery(weights, italic) {
  const closest = (target) => weights.reduce((a, b) => (Math.abs(b - target) < Math.abs(a - target) ? b : a))
  const ws = [...new Set([closest(400), closest(700)])].sort((a, b) => a - b)
  if (italic) return `ital,wght@${[...ws.map((w) => `0,${w}`), ...ws.map((w) => `1,${w}`)].join(';')}`
  return `wght@${ws.join(';')}`
}

export const googleFontUrl = (family, query, text) =>
  `https://fonts.googleapis.com/css2?family=${encodeURIComponent(family).replace(/%20/g, '+')}${query ? `:${query}` : ''}` +
  `${text ? `&text=${encodeURIComponent(text)}` : ''}&display=swap`

const fontSheets = new Map()

/** Adds the Google Fonts stylesheet for a family once; resolves when it has loaded. */
export function loadGoogleFont(family, query, text) {
  const href = googleFontUrl(family, query, text)
  if (!fontSheets.has(href)) {
    fontSheets.set(href, new Promise((resolve) => {
      const link = Object.assign(document.createElement('link'), { rel: 'stylesheet', href })
      link.onload = resolve
      link.onerror = resolve // unknown font: the browser falls back to Georgia
      document.head.appendChild(link)
    }))
  }
  return fontSheets.get(href)
}

// Positions and sizes are fractions of the image, so a layout fits any resolution.
//   x, y      anchor point (y is the vertical middle of the text)
//   size      font size as a fraction of image width
//   maxWidth  long names shrink to fit inside this fraction of the width
export function newField(overrides = {}) {
  return {
    id: Math.random().toString(36).slice(2, 9),
    text: '{name}',
    x: 0.5,
    y: 0.5,
    size: 0.05,
    maxWidth: 0.5,
    font: 'Playfair Display',
    fontQuery: 'ital,wght@0,400;0,700;1,400;1,700',
    color: '#1d2a4a',
    bold: true,
    italic: false,
    align: 'center',
    ...overrides,
  }
}

export const hasFields = (layout) => Boolean(layout?.fields?.length)

// "Ravi Kumar" -> "Ravi_Kumar" (letters, vowel signs and digits in any script are kept)
export function cardFileName(name) {
  return String(name ?? '').trim().replace(/[^\p{L}\p{M}\p{N}]+/gu, '_').replace(/^_+|_+$/g, '') || 'greeting'
}

/** CSS font-family list for a family, including its free twin when it's a Windows font. */
export function fontStack(family) {
  const fallback = SYSTEM_BY_NAME.get(family)?.fallback
  return `"${family}", ${fallback ? `"${fallback}", ` : ''}Georgia, serif`
}

const fontSpec = (f, px) => `${f.italic ? 'italic ' : ''}${f.bold ? 700 : 400} ${px}px ${fontStack(f.font)}`

/** Loads whatever a family needs: the Google font, or a Windows font's Google twin. */
export function loadFontFamily(family, query, text) {
  const system = SYSTEM_BY_NAME.get(family)
  if (!system) return loadGoogleFont(family, query, text)
  return system.fallback ? loadGoogleFont(system.fallback, FALLBACK_QUERY, text) : Promise.resolve()
}

const fieldText = (f, vars) => renderMessage(f.text, { ...vars, contact: vars?.contact ?? { full_name: '' } }).trim()

/** Waits until every field's font can draw that field's text (vars give the client name). */
export function ensureFonts(layout, vars = {}) {
  if (!hasFields(layout) || !document.fonts) return Promise.resolve()
  return Promise.all(layout.fields.map(async (f) => {
    await loadFontFamily(f.font, f.fontQuery)
    await document.fonts.load(fontSpec(f, 40), fieldText(f, vars) || 'A').catch(() => null)
  }))
}

const imageCache = new Map()
export function loadImage(src) {
  if (!imageCache.has(src)) {
    imageCache.set(src, new Promise((resolve, reject) => {
      const img = new Image()
      if (!src.startsWith('data:')) img.crossOrigin = 'anonymous'
      img.onload = () => resolve(img)
      img.onerror = (err) => {
        imageCache.delete(src)
        reject(err)
      }
      img.src = src
    }))
    if (imageCache.size > 30) imageCache.delete(imageCache.keys().next().value)
  }
  return imageCache.get(src)
}

/** Draws the card and its text fields. Returns each field's box in canvas pixels. */
export function drawCard(ctx, img, layout, vars, { editing = false } = {}) {
  const W = img.naturalWidth
  const H = img.naturalHeight
  ctx.canvas.width = W
  ctx.canvas.height = H
  ctx.drawImage(img, 0, 0, W, H)

  const boxes = []
  for (const f of layout?.fields ?? []) {
    const text = fieldText(f, vars)
    let px = f.size * W
    if (!text) {
      if (editing) {
        const w = f.maxWidth * W
        const anchor = f.x * W
        const left = f.align === 'center' ? anchor - w / 2 : f.align === 'right' ? anchor - w : anchor
        boxes.push({ id: f.id, x: left, y: f.y * H - px * 0.65, w, h: px * 1.3 })
      }
      continue
    }
    ctx.font = fontSpec(f, px)
    let width = ctx.measureText(text).width
    const max = f.maxWidth * W
    if (width > max) {
      px *= max / width
      ctx.font = fontSpec(f, px)
      width = ctx.measureText(text).width
    }
    ctx.fillStyle = f.color
    ctx.textAlign = f.align
    ctx.textBaseline = 'middle'
    ctx.fillText(text, f.x * W, f.y * H)

    const anchorX = f.x * W
    const left = f.align === 'center' ? anchorX - width / 2 : f.align === 'right' ? anchorX - width : anchorX
    boxes.push({ id: f.id, x: left, y: f.y * H - px * 0.65, w: Math.max(width, px), h: px * 1.3 })
  }
  return boxes
}

const renderCache = new Map()

/** Personalised card for one client as a JPEG data URL. Returns the plain image if there's no layout. */
export async function renderCard(image, layout, vars) {
  if (!image || !hasFields(layout)) return image
  const key = `${image.length}:${image.slice(-40)}:${JSON.stringify(layout)}:${vars.contact?.full_name}:${vars.company}:${vars.sender}`
  if (renderCache.has(key)) return renderCache.get(key)
  await ensureFonts(layout, vars)
  const img = await loadImage(image)
  const canvas = document.createElement('canvas')
  drawCard(canvas.getContext('2d'), img, layout, vars)
  const url = canvas.toDataURL('image/jpeg', 0.92)
  renderCache.set(key, url)
  if (renderCache.size > 60) renderCache.delete(renderCache.keys().next().value)
  return url
}

/** React hook: the personalised card for previews and thumbnails. */
export function useCardImage(image, layout, { contact, company, sender } = {}) {
  const [url, setUrl] = useState(image)
  const layoutKey = JSON.stringify(layout ?? null)
  const name = contact?.full_name

  useEffect(() => {
    let cancelled = false
    renderCard(image, layout, { contact, company, sender })
      .then((u) => !cancelled && setUrl(u))
      .catch(() => !cancelled && setUrl(image))
    return () => { cancelled = true }
  }, [image, layoutKey, name, company, sender]) // eslint-disable-line react-hooks/exhaustive-deps

  return url
}
