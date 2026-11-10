import { useEffect, useState } from 'react'
import { Eye, EyeOff, X } from 'lucide-react'
import { typeMeta } from '../lib/campaignTypes'

// Password field with a show/hide toggle
export function PasswordInput(props) {
  const [visible, setVisible] = useState(false)
  return (
    <div className="password-input">
      <input {...props} type={visible ? 'text' : 'password'} />
      <button
        type="button"
        className="password-toggle"
        onClick={() => setVisible((v) => !v)}
        aria-label={visible ? 'Hide password' : 'Show password'}
        title={visible ? 'Hide password' : 'Show password'}
      >
        {visible ? <EyeOff size={17} /> : <Eye size={17} />}
      </button>
    </div>
  )
}

export function PageHeader({ title, subtitle, actions }) {
  return (
    <div className="page-header">
      <div>
        <h1>{title}</h1>
        {subtitle && <p className="page-subtitle">{subtitle}</p>}
      </div>
      {actions && <div className="page-actions">{actions}</div>}
    </div>
  )
}

// One cell of the summary strip. Only 'danger' and 'ok' tones colour the number.
export function StatCard({ label, value, tone, hint }) {
  return (
    <div className={`stat ${tone === 'danger' || tone === 'ok' ? `stat-${tone}` : ''}`}>
      <div className="stat-value">{value}</div>
      <div className="stat-label">{label}</div>
      {hint && <div className="stat-hint">{hint}</div>}
    </div>
  )
}

// Desk-calendar style date: month band, big day number, weekday
export function DateBlock({ date = new Date(), size }) {
  return (
    <div className={`date-block ${size === 'lg' ? 'date-block-lg' : ''}`} aria-label={date.toDateString()}>
      <span className="date-block-month">{date.toLocaleDateString('en-IN', { month: 'long' })}</span>
      <span className="date-block-day">{date.getDate()}</span>
      <span className="date-block-weekday">{date.toLocaleDateString('en-IN', { weekday: 'long' })}</span>
    </div>
  )
}

export function Modal({ title, subtitle, onClose, children, footer, size = 'md' }) {
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose()
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <div className={`modal modal-${size}`} onMouseDown={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
        <div className="modal-head">
          <div>
            <h2>{title}</h2>
            {subtitle && <p className="muted">{subtitle}</p>}
          </div>
          <button className="icon-btn" onClick={onClose} aria-label="Close"><X size={18} /></button>
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-foot">{footer}</div>}
      </div>
    </div>
  )
}

export function EmptyState({ icon: Icon, title, text, action }) {
  return (
    <div className="empty-state">
      {Icon && <div className="empty-icon"><Icon size={28} strokeWidth={1.5} /></div>}
      <h3>{title}</h3>
      {text && <p>{text}</p>}
      {action}
    </div>
  )
}

const AVATAR_COLORS = ['#1f5f4a', '#2b5a8a', '#8a4b2b', '#6b4fa0', '#a3324f', '#3f6b2a', '#5c5f66', '#9a6a07']

export function Avatar({ name = '', size = 32 }) {
  const initials = name.split(' ').filter(Boolean).slice(0, 2).map((p) => p[0].toUpperCase()).join('') || '?'
  const color = AVATAR_COLORS[[...name].reduce((a, c) => a + c.charCodeAt(0), 0) % AVATAR_COLORS.length]
  return (
    <span className="avatar" style={{ width: size, height: size, background: color, fontSize: size * 0.38 }}>{initials}</span>
  )
}

export function Progress({ value, tone = 'ok' }) {
  return (
    <div className="progress">
      <div className={`progress-bar tone-${tone}`} style={{ width: `${Math.min(100, Math.max(0, value))}%` }} />
    </div>
  )
}

export function TypeBadge({ type, size = 'md' }) {
  const meta = typeMeta(type)
  const Icon = meta.icon
  return (
    <span className={`type-badge type-badge-${size}`} style={{ '--type-color': meta.color }}>
      <Icon size={size === 'sm' ? 12 : 14} /> {meta.label}
    </span>
  )
}

export function TypeIcon({ type, size = 36 }) {
  const meta = typeMeta(type)
  const Icon = meta.icon
  return (
    <span className="type-icon" style={{ '--type-color': meta.color, width: size, height: size }}>
      <Icon size={size * 0.5} />
    </span>
  )
}

const STATES = {
  active: ['Live', 'ok'],
  scheduled: ['Scheduled', 'info'],
  completed: ['Completed', 'neutral'],
  overdue: ['Behind schedule', 'warn'],
  paused: ['Paused', 'warn'],
  archived: ['Archived', 'neutral'],
  pending: ['Pending', 'warn'],
  sent: ['Sent', 'ok'],
  skipped: ['Skipped', 'neutral'],
}

export function StatePill({ state }) {
  const [label, tone] = STATES[state] ?? [state, 'neutral']
  return <span className={`pill pill-${tone}`}>{label}</span>
}

export function Tabs({ tabs, value, onChange }) {
  return (
    <div className="tabs" role="tablist">
      {tabs.map((t) => (
        <button key={t.value} role="tab" className={`tab ${value === t.value ? 'is-active' : ''}`} onClick={() => onChange(t.value)}>
          {t.label}
          {t.count != null && <span className="tab-count">{t.count}</span>}
        </button>
      ))}
    </div>
  )
}

export function Spinner({ label = 'Loading…' }) {
  return <div className="spinner-wrap"><span className="spinner" />{label}</div>
}

export function Field({ label, hint, children, className = '' }) {
  return (
    <label className={`field ${className}`}>
      {label && <span className="field-label">{label}</span>}
      {children}
      {hint && <span className="field-hint">{hint}</span>}
    </label>
  )
}

export function Segmented({ options, value, onChange }) {
  return (
    <div className="segmented">
      {options.map((o) => (
        <button key={o.value} type="button" className={value === o.value ? 'is-active' : ''} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  )
}
