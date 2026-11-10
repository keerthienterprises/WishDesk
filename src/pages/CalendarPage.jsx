import { useEffect, useMemo, useState } from 'react'
import { ChevronLeft, ChevronRight, CalendarDays } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'
import RecipientCard from '../components/RecipientCard'
import { EmptyState, PageHeader, Segmented, Spinner } from '../components/ui'
import { fetchRecipients, fetchTeam } from '../lib/data'
import { MONTHS, formatDate, monthBounds, toIso, todayIso } from '../lib/dates'
import { CAMPAIGN_TYPES, typeMeta } from '../lib/campaignTypes'

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

export default function CalendarPage() {
  const { user, canManage } = useAuth()
  const toast = useToast()
  const now = new Date()
  const [cursor, setCursor] = useState({ year: now.getFullYear(), month: now.getMonth() + 1 })
  const [selected, setSelected] = useState(todayIso())
  const [scope, setScope] = useState('mine')
  const [rows, setRows] = useState(null)
  const [team, setTeam] = useState([])

  useEffect(() => {
    const [from, to] = monthBounds(cursor.year, cursor.month)
    setRows(null)
    fetchRecipients({ from, to, assignedTo: scope === 'mine' ? user.id : undefined })
      .then(setRows)
      .catch((e) => { toast(e.message, 'error'); setRows([]) })
  }, [cursor, scope, user.id, toast])

  useEffect(() => {
    if (canManage) fetchTeam().then(setTeam).catch((e) => toast(e.message, 'error'))
  }, [canManage, toast])

  const byDay = useMemo(() => {
    const map = {}
    for (const r of rows ?? []) (map[r.due_date] ??= []).push(r)
    return map
  }, [rows])

  const move = (delta) => {
    const d = new Date(cursor.year, cursor.month - 1 + delta, 1)
    setCursor({ year: d.getFullYear(), month: d.getMonth() + 1 })
  }
  const goToday = () => {
    setCursor({ year: now.getFullYear(), month: now.getMonth() + 1 })
    setSelected(todayIso())
  }

  const firstWeekday = new Date(cursor.year, cursor.month - 1, 1).getDay()
  const daysInMonth = new Date(cursor.year, cursor.month, 0).getDate()
  const cells = [...Array(firstWeekday).fill(null), ...Array.from({ length: daysInMonth }, (_, i) => toIso(new Date(cursor.year, cursor.month - 1, i + 1)))]
  const today = todayIso()
  const dayList = byDay[selected] ?? []
  const nameOf = (id) => team.find((u) => u.id === id)?.full_name
  const replace = (u) => setRows((list) => list.map((r) => (r.id === u.id ? u : r)))

  return (
    <div className="page">
      <PageHeader
        title="Calendar"
        subtitle="Every birthday, anniversary, festival and offer on one timeline."
        actions={canManage && (
          <Segmented value={scope} onChange={setScope} options={[{ value: 'mine', label: 'My messages' }, { value: 'team', label: 'Whole team' }]} />
        )}
      />

      <div className="calendar-layout">
        <section className="card calendar-card">
          <div className="cal-toolbar">
            <div className="cal-nav">
              <button className="icon-btn" onClick={() => move(-1)} aria-label="Previous month"><ChevronLeft size={18} /></button>
              <button className="icon-btn" onClick={() => move(1)} aria-label="Next month"><ChevronRight size={18} /></button>
              <h2>{MONTHS[cursor.month - 1]} {cursor.year}</h2>
            </div>
            <div className="cal-legend">
              {Object.entries(CAMPAIGN_TYPES).map(([k, t]) => (
                <span key={k} className="legend-item"><span className="legend-dot" style={{ background: t.color }} />{t.label}</span>
              ))}
              <button className="btn btn-ghost btn-sm" onClick={goToday}>Today</button>
            </div>
          </div>

          {!rows ? <Spinner /> : (
            <div className="cal-grid">
              {WEEKDAYS.map((w) => <div key={w} className="cal-weekday">{w}</div>)}
              {cells.map((iso, i) => {
                if (!iso) return <div key={`e${i}`} className="cal-cell is-empty" />
                const items = byDay[iso] ?? []
                const pending = items.filter((r) => r.status === 'pending').length
                return (
                  <button
                    key={iso}
                    className={`cal-cell ${iso === today ? 'is-today' : ''} ${iso === selected ? 'is-selected' : ''} ${iso < today ? 'is-past' : ''}`}
                    onClick={() => setSelected(iso)}
                  >
                    <div className="cal-cell-head">
                      <span className="cal-day">{Number(iso.slice(8))}</span>
                      {items.length > 0 && (
                        <span className={`cal-count ${pending ? (iso < today ? 'is-overdue' : 'is-pending') : 'is-done'}`}>
                          {pending ? `${pending} to send` : '✓ done'}
                        </span>
                      )}
                    </div>
                    {items.slice(0, 3).map((r) => (
                      <span key={r.id} className={`cal-chip ${r.status !== 'pending' ? 'is-done' : ''}`} style={{ '--type-color': typeMeta(r.campaign?.type).color }}>
                        {r.contact?.full_name}
                      </span>
                    ))}
                    {items.length > 3 && <span className="cal-more">+{items.length - 3} more</span>}
                  </button>
                )
              })}
            </div>
          )}
        </section>

        <aside className="card day-panel">
          <div className="card-title">{formatDate(selected, { weekday: true })}</div>
          <p className="muted small">{dayList.length} message{dayList.length === 1 ? '' : 's'}</p>
          {dayList.length === 0 ? (
            <EmptyState icon={CalendarDays} title="Nothing scheduled" text="Pick another day to see its messages." />
          ) : (
            <div className="task-list compact">
              {dayList.map((r) => (
                <RecipientCard key={r.id} recipient={r} onChange={replace} assigneeName={scope === 'team' ? nameOf(r.assigned_to) : undefined} />
              ))}
            </div>
          )}
        </aside>
      </div>
    </div>
  )
}
