import { useEffect, useMemo, useState } from 'react'
import { Download } from 'lucide-react'
import { useToast } from '../context/ToastContext'
import { supabase } from '../lib/supabase'
import { fetchAll, fetchTeam, summarize } from '../lib/data'
import { addDays, formatDayMonth, localDateOf, MONTHS, todayIso } from '../lib/dates'
import { CAMPAIGN_TYPES, typeMeta } from '../lib/campaignTypes'
import { downloadFile, toCsv } from '../lib/csv'
import { BarChart, HBarList } from '../components/charts'
import { Avatar, PageHeader, Progress, Segmented, Spinner, StatCard } from '../components/ui'

function rangeFor(key) {
  const today = todayIso()
  const now = new Date()
  const y = now.getFullYear()
  const m = now.getMonth() + 1
  const pad = (n) => String(n).padStart(2, '0')
  switch (key) {
    case '7d': return [addDays(today, -6), today]
    case '30d': return [addDays(today, -29), today]
    case 'month': return [`${y}-${pad(m)}-01`, `${y}-${pad(m)}-${new Date(y, m, 0).getDate()}`]
    case 'year': return [`${y}-01-01`, `${y}-12-31`]
    default: return [addDays(today, -29), today]
  }
}

export default function Reports() {
  const toast = useToast()
  const [range, setRange] = useState('month')
  const [rows, setRows] = useState(null)
  const [team, setTeam] = useState([])
  const [from, to] = rangeFor(range)

  useEffect(() => {
    setRows(null)
    fetchAll(() => supabase
      .from('campaign_recipients')
      .select('id, status, due_date, sent_at, sent_by, assigned_to, campaign:campaigns(id, name, type, status)')
      .gte('due_date', from)
      .lte('due_date', to)
      .order('id'))
      .then((data) => setRows(data.filter((r) => r.campaign?.status !== 'archived')))
      .catch((e) => {
        toast(e.message, 'error')
        setRows([])
      })
  }, [from, to, toast])

  useEffect(() => { fetchTeam().then(setTeam).catch((e) => toast(e.message, 'error')) }, [toast])

  const s = useMemo(() => summarize(rows ?? []), [rows])

  const daily = useMemo(() => {
    if (!rows) return []
    const days = []
    const end = to < todayIso() ? to : todayIso()
    const count = Math.round((new Date(end) - new Date(from)) / 86400000) + 1
    const step = count > 62 ? 'month' : 'day'
    if (step === 'month') {
      const byMonth = {}
      for (const r of rows) if (r.status === 'sent' && r.sent_at) { const k = localDateOf(r.sent_at).slice(0, 7); byMonth[k] = (byMonth[k] ?? 0) + 1 }
      const y = from.slice(0, 4)
      for (let m = 1; m <= 12; m++) { const k = `${y}-${String(m).padStart(2, '0')}`; days.push({ label: k, value: byMonth[k] ?? 0 }) }
      return days
    }
    const byDay = {}
    for (const r of rows) if (r.status === 'sent' && r.sent_at) { const k = localDateOf(r.sent_at); byDay[k] = (byDay[k] ?? 0) + 1 }
    for (let i = 0; i < count; i++) { const d = addDays(from, i); days.push({ label: d, value: byDay[d] ?? 0 }) }
    return days
  }, [rows, from, to])

  const byType = useMemo(() => Object.entries(CAMPAIGN_TYPES).map(([k, t]) => {
    const list = (rows ?? []).filter((r) => r.campaign?.type === k)
    return { key: k, label: t.label, color: t.color, value: list.length, sent: list.filter((r) => r.status === 'sent').length }
  }).filter((x) => x.value > 0), [rows])

  const people = useMemo(() => team.map((u) => {
    const theirs = (rows ?? []).filter((r) => r.assigned_to === u.id)
    return { ...u, ...summarize(theirs) }
  }).filter((u) => u.total > 0).sort((a, b) => b.rate - a.rate || b.sent - a.sent), [rows, team])

  const campaigns = useMemo(() => {
    const map = {}
    for (const r of rows ?? []) (map[r.campaign.id] ??= { campaign: r.campaign, rows: [] }).rows.push(r)
    return Object.values(map).map(({ campaign, rows: list }) => ({ ...campaign, ...summarize(list) })).sort((a, b) => b.total - a.total)
  }, [rows])

  function exportCsv() {
    downloadFile(toCsv(people, [
      { label: 'Team member', value: (u) => u.full_name },
      { label: 'Assigned', value: (u) => u.total },
      { label: 'Sent', value: (u) => u.sent },
      { label: 'Skipped', value: (u) => u.skipped },
      { label: 'Pending', value: (u) => u.pending },
      { label: 'Overdue', value: (u) => u.overdue },
      { label: 'Completion %', value: (u) => u.rate },
    ]), `team-report-${from}-to-${to}.csv`)
  }

  return (
    <div className="page">
      <PageHeader
        title="Reports"
        subtitle={`Engagement from ${formatDayMonth(from)} to ${formatDayMonth(to)} ${to.slice(0, 4)}`}
        actions={
          <>
            <Segmented value={range} onChange={setRange} options={[
              { value: '7d', label: '7 days' }, { value: '30d', label: '30 days' }, { value: 'month', label: 'This month' }, { value: 'year', label: 'This year' },
            ]} />
            <button className="btn btn-ghost" onClick={exportCsv} disabled={!people.length}><Download size={16} /> Export</button>
          </>
        }
      />

      {!rows ? <Spinner /> : (
        <>
          <div className="stat-grid">
            <StatCard label="Messages scheduled" value={s.total} tone="brand" />
            <StatCard label="Sent" value={s.sent} tone="ok" hint={`${s.skipped} skipped`} />
            <StatCard label="Completion rate" value={`${s.rate}%`} tone="info" />
            <StatCard label="Overdue" value={s.overdue} tone={s.overdue ? 'danger' : 'neutral'} hint="Past due, not sent" />
          </div>

          <div className="report-grid">
            <section className="card">
              <div className="card-title">Messages sent</div>
              <BarChart
                data={daily}
                height={220}
                formatLabel={(l) => (l.length === 7 ? MONTHS[Number(l.slice(5)) - 1].slice(0, 3) : formatDayMonth(l))}
              />
            </section>
            <section className="card">
              <div className="card-title">By occasion</div>
              {byType.length === 0 ? <p className="muted small">No data in this period.</p> : (
                <HBarList items={byType.map((t) => ({ label: t.label, value: t.value, color: t.color }))} />
              )}
            </section>
          </div>

          <div className="report-grid">
            <section className="card table-card">
              <div className="card-title">Team performance</div>
              {people.length === 0 ? <p className="muted small">No assignments in this period.</p> : (
                <div className="table-wrap">
                  <table className="table">
                    <thead><tr><th>Member</th><th className="num">Assigned</th><th className="num">Sent</th><th className="num">Overdue</th><th style={{ width: 160 }}>Completion</th></tr></thead>
                    <tbody>
                      {people.map((u) => (
                        <tr key={u.id}>
                          <td><div className="cell-with-icon"><Avatar name={u.full_name} size={28} /> {u.full_name}</div></td>
                          <td className="num">{u.total}</td>
                          <td className="num">{u.sent}</td>
                          <td className="num">{u.overdue ? <span className="danger-text">{u.overdue}</span> : 0}</td>
                          <td><div className="progress-cell"><Progress value={u.rate} /><span className="small">{u.rate}%</span></div></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
            <section className="card table-card">
              <div className="card-title">Campaigns</div>
              {campaigns.length === 0 ? <p className="muted small">No campaigns in this period.</p> : (
                <div className="table-wrap">
                  <table className="table">
                    <thead><tr><th>Campaign</th><th className="num">Messages</th><th style={{ width: 140 }}>Done</th></tr></thead>
                    <tbody>
                      {campaigns.map((c) => (
                        <tr key={c.id}>
                          <td><span className="legend-dot" style={{ background: typeMeta(c.type).color }} /> {c.name}</td>
                          <td className="num">{c.total}</td>
                          <td><div className="progress-cell"><Progress value={c.rate} /><span className="small">{c.rate}%</span></div></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          </div>
        </>
      )}
    </div>
  )
}
