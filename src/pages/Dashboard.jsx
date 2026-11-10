import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { CheckCircle2, Inbox, Plus } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'
import RecipientCard from '../components/RecipientCard'
import { Avatar, DateBlock, EmptyState, Progress, Spinner, StatCard, Tabs } from '../components/ui'
import { fetchRecipients, fetchTeam } from '../lib/data'
import { addDays, formatDate, localDateOf, monthBounds, relativeDay, todayIso } from '../lib/dates'
import { CAMPAIGN_TYPES, typeMeta } from '../lib/campaignTypes'

function greeting() {
  const h = new Date().getHours()
  return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening'
}

export default function Dashboard() {
  const { user, profile, canManage } = useAuth()
  const toast = useToast()
  const [rows, setRows] = useState(null)
  const [team, setTeam] = useState([])
  const [tab, setTab] = useState('today')
  const [typeFilter, setTypeFilter] = useState('all')

  const today = todayIso()
  const now = new Date()
  const [monthStart, monthEnd] = monthBounds(now.getFullYear(), now.getMonth() + 1)

  useEffect(() => {
    const from = [addDays(today, -30), monthStart].sort()[0]
    const to = [addDays(today, 7), monthEnd].sort()[1]
    fetchRecipients({ from, to, assignedTo: canManage ? undefined : user.id })
      .then(setRows)
      .catch((e) => { toast(e.message, 'error'); setRows([]) })
    if (canManage) fetchTeam().then(setTeam).catch((e) => toast(e.message, 'error'))
  }, [user.id, canManage, today, monthStart, monthEnd, toast])

  const mine = useMemo(() => (rows ?? []).filter((r) => r.assigned_to === user.id), [rows, user.id])
  const byType = (list) => (typeFilter === 'all' ? list : list.filter((r) => r.campaign?.type === typeFilter))

  const lists = {
    today: mine.filter((r) => r.due_date === today).sort((a, b) => (a.status === 'pending' ? -1 : 1) - (b.status === 'pending' ? -1 : 1)),
    overdue: mine.filter((r) => r.status === 'pending' && r.due_date < today),
    upcoming: mine.filter((r) => r.due_date > today && r.due_date <= addDays(today, 7)),
  }

  const weekAgo = addDays(today, -6)
  const sentThisWeek = mine.filter((r) => r.status === 'sent' && r.sent_at && localDateOf(r.sent_at) >= weekAgo).length
  const monthMine = mine.filter((r) => r.due_date >= monthStart && r.due_date <= monthEnd)
  const monthDone = monthMine.filter((r) => r.status !== 'pending').length
  const monthRate = monthMine.length ? Math.round((monthDone / monthMine.length) * 100) : 0
  const pendingToday = lists.today.filter((r) => r.status === 'pending').length

  const replace = (u) => setRows((list) => list.map((r) => (r.id === u.id ? u : r)))

  const leaderboard = useMemo(() => {
    if (!canManage || !rows) return []
    const month = rows.filter((r) => r.due_date >= monthStart && r.due_date <= monthEnd)
    return team
      .filter((u) => u.is_active)
      .map((u) => {
        const theirs = month.filter((r) => r.assigned_to === u.id)
        const done = theirs.filter((r) => r.status !== 'pending').length
        const overdue = rows.filter((r) => r.assigned_to === u.id && r.status === 'pending' && r.due_date < today).length
        return { ...u, total: theirs.length, done, overdue, rate: theirs.length ? Math.round((done / theirs.length) * 100) : 0 }
      })
      .filter((u) => u.total > 0 || u.overdue > 0)
      .sort((a, b) => b.done - a.done)
  }, [canManage, rows, team, monthStart, monthEnd, today])

  if (!rows) return <Spinner />

  const shown = byType(lists[tab])
  const earlier = lists.overdue.length
  const headline = pendingToday
    ? `${pendingToday} greeting${pendingToday > 1 ? 's' : ''} to send today${earlier ? `, plus ${earlier} from earlier days` : ''}.`
    : earlier
      ? `Nothing due today, but ${earlier} from earlier days still need sending.`
      : 'Nothing left to send today.'
  const upcomingDays = [...new Set(lists.upcoming.map((r) => r.due_date))].slice(0, 5)

  return (
    <div className="page">
      <div className="dash-head">
        <DateBlock />
        <div className="dash-head-text">
          <h1>{greeting()}, {profile?.full_name?.split(' ')[0]}</h1>
          <p>{headline}</p>
        </div>
        {canManage && <Link to="/campaigns/new" className="btn btn-primary"><Plus size={16} /> New campaign</Link>}
      </div>

      <div className="stat-grid">
        <StatCard label="Due today" value={lists.today.length} hint={`${pendingToday} still to send`} />
        <StatCard label="Overdue" value={lists.overdue.length} tone={lists.overdue.length ? 'danger' : undefined} hint="From the last 30 days" />
        <StatCard label="Sent in the last 7 days" value={sentThisWeek} tone="ok" />
        <StatCard label="Coming up" value={lists.upcoming.length} hint="In the next 7 days" />
      </div>

      <div className="dash-grid">
        <section className="card">
          <div className="card-head">
            <Tabs
              value={tab}
              onChange={setTab}
              tabs={[
                { value: 'today', label: 'Today', count: lists.today.length },
                { value: 'overdue', label: 'Overdue', count: lists.overdue.length },
                { value: 'upcoming', label: 'Next 7 days', count: lists.upcoming.length },
              ]}
            />
            <select className="select-sm" value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}>
              <option value="all">All occasions</option>
              {Object.entries(CAMPAIGN_TYPES).map(([k, t]) => <option key={k} value={k}>{t.label}</option>)}
            </select>
          </div>
          {shown.length === 0 ? (
            <EmptyState
              icon={tab === 'overdue' ? CheckCircle2 : Inbox}
              title={tab === 'today' ? 'Nothing due today' : tab === 'overdue' ? 'Nothing overdue' : 'Nothing in the next 7 days'}
              text={tab === 'overdue' ? 'Every greeting from earlier days has been sent or skipped.' : 'Greetings show up here once a campaign assigns clients to you.'}
            />
          ) : (
            <div className="task-list">
              {shown.map((r) => <RecipientCard key={r.id} recipient={r} onChange={replace} />)}
            </div>
          )}
        </section>

        <aside className="side-stack">
          <div className="card">
            <div className="card-title">Your month</div>
            <div className="month-figure"><strong>{monthDone}</strong><span className="muted">of {monthMine.length} done</span></div>
            <Progress value={monthRate} />
            <div className="month-lines">
              <span><b>{monthMine.filter((r) => r.status === 'sent').length}</b> sent</span>
              <span><b>{monthMine.filter((r) => r.status === 'skipped').length}</b> skipped</span>
              <span><b>{monthMine.filter((r) => r.status === 'pending').length}</b> left</span>
            </div>
          </div>

          <div className="card">
            <div className="card-title-row">
              <div className="card-title">Coming up</div>
              <Link to="/calendar" className="btn btn-link btn-xs">Open calendar</Link>
            </div>
            {upcomingDays.length === 0 && <p className="muted small">No occasions in the next 7 days.</p>}
            {upcomingDays.map((day) => (
              <div key={day} className="upcoming-day">
                <div className="upcoming-date">{relativeDay(day)}<span>{formatDate(day, { year: false, weekday: true })}</span></div>
                {lists.upcoming.filter((r) => r.due_date === day).map((r) => (
                  <div key={r.id} className="upcoming-item" style={{ '--type-color': typeMeta(r.campaign?.type).color }}>
                    <span>{r.contact?.full_name}</span>
                    <span className="muted small">{typeMeta(r.campaign?.type).label}</span>
                  </div>
                ))}
              </div>
            ))}
          </div>

          {canManage && leaderboard.length > 0 && (
            <div className="card">
              <div className="card-title-row">
                <div className="card-title">Team this month</div>
                <Link to="/reports" className="btn btn-link btn-xs">Full report</Link>
              </div>
              {leaderboard.map((u) => (
                <div key={u.id} className="leader-row">
                  <Avatar name={u.full_name} size={30} />
                  <div className="leader-main">
                    <div className="leader-name">
                      <span>{u.full_name}</span>
                      <span className="muted small">{u.done}/{u.total}{u.overdue > 0 && <span className="danger-text sep">{u.overdue} overdue</span>}</span>
                    </div>
                    <Progress value={u.rate} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </aside>
      </div>
    </div>
  )
}
