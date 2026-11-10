import { dataUrlToBlob, dataUrlToPngBlob } from './image'

let defaultCountryCode = import.meta.env.VITE_DEFAULT_COUNTRY_CODE || '91'

// Called once organisation settings load
export function setDefaultCountryCode(code) {
  if (code) defaultCountryCode = String(code).replace(/\D/g, '')
}

// Returns digits with country code (e.g. 919876543210), or null if invalid
export function normalizePhone(value) {
  let digits = String(value ?? '').replace(/\D/g, '')
  if (digits.startsWith('00')) digits = digits.slice(2)
  if (digits.length === 11 && digits.startsWith('0')) digits = digits.slice(1)
  if (digits.length === 10) digits = defaultCountryCode + digits
  return digits.length >= 11 && digits.length <= 15 ? digits : null
}

export function formatPhone(digits) {
  if (!digits) return ''
  if (digits.length === 12 && digits.startsWith('91')) return `+91 ${digits.slice(2, 7)} ${digits.slice(7)}`
  return `+${digits}`
}

export function renderMessage(template, { contact, company = '', sender = '' }) {
  let text = template || ''
  if (contact) {
    const name = contact.full_name ?? ''
    text = text.replaceAll('{first_name}', name.split(' ')[0]).replaceAll('{name}', name)
  }
  return text
    .replaceAll('{company}', company)
    .replaceAll('{sender}', sender)
}

export const SEND_RESULT_MESSAGES = {
  copied: 'Card copied. Paste it into the WhatsApp chat with Ctrl+V, then send.',
  opened: 'WhatsApp is open with the message. Download the card if you want to attach it.',
  shared: 'Sent to WhatsApp.',
}

export const isMobile = () => /Android|iPhone|iPad|iPod/i.test(navigator.userAgent)

export const chatUrl = (phone, text) => `https://wa.me/${phone}?text=${encodeURIComponent(text)}`

/**
 * WhatsApp links (wa.me) can only pre-fill TEXT — no website can attach an image
 * to a WhatsApp chat automatically. So:
 *  - Mobile: open the share sheet with the image + message; user taps WhatsApp → contact.
 *  - Desktop: copy the image to the clipboard and open the contact's chat; user presses Ctrl+V.
 * Returns 'shared' | 'copied' | 'opened' | 'cancelled'.
 */
export async function sendWhatsApp({ phone, text, imageBase64, fileName = 'greeting' }) {
  if (imageBase64 && isMobile() && navigator.canShare) {
    const blob = await dataUrlToBlob(imageBase64)
    const file = new File([blob], `${fileName}.jpg`, { type: blob.type })
    if (navigator.canShare({ files: [file] })) {
      try {
        await navigator.share({ files: [file], text })
        return 'shared'
      } catch (err) {
        if (err.name === 'AbortError') return 'cancelled'
      }
    }
  }

  let copied = false
  if (imageBase64) {
    try {
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': dataUrlToPngBlob(imageBase64) })])
      copied = true
    } catch {
      /* clipboard images unsupported — user can download the card instead */
    }
  }
  window.open(chatUrl(phone, text), '_blank', 'noopener')
  return copied ? 'copied' : 'opened'
}
