import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Megaphone, Plus, Search } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { CAMPAIGN_COLS, campaignState, fetchAll, fetchCampaignStats, summarize } from '../lib/data'
import { useToast } from '../context/ToastContext'
import { formatDate, MONTHS } from '../lib/dates'
import { CAMPAIGN_TYPES, isRecurring } from '../lib/campaignTypes'
import { EmptyState, PageHeader, Progress, Spinner, StatCard, StatePill, Tabs, TypeBadge, TypeIcon } from '../components/ui'

export function campaignWhen(c) {
  if (isRecurring(c.type)) return `${MONTHS[c.period_month - 1]} ${c.period_year}`
  return formatDate(c.send_date)
}

export default function Campaigns() {
  const navigate = useNavigate()
  const toast = useToast()
  const [campaigns, setCampaigns] = useState(null)
  const [stats, setStats] = useState({})
  const [search, setSearch] = useState('')
  const [type, setType] = useState('all')
  const [state, setState] = useState('all')

  useEffect(() => {
    Promise.all([
      fetchAll(() => supabase.from('campaigns').select(CAMPAIGN_COLS).order('created_at', { ascending: false }).order('id')),
      fetchCampaignStats(),
    ])
      .then(([list, totals]) => {
        setStats(totals)
        setCampaigns(list)
      })
      .catch((e) => {
        toast(e.message, 'error')
        setCampaigns([])
      })
  }, [toast])

  const enriched = useMemo(
    () => (campaigns ?? []).map((c) => {
      const s = stats[c.id] ?? summarize([])
      return { ...c, stats: s, state: campaignState(c, s) }
    }),
    [campaigns, stats],
  )

  if (!campaigns) return <Spinner />

  const counts = enriched.reduce((acc, c) => ({ ...acc, [c.state]: (acc[c.state] ?? 0) + 1 }), {})
  const shown = enriched.filter((c) =>
    (type === 'all' || c.type === type) &&
    (state === 'all' || c.state === state || (state === 'active' && c.state === 'overdue')) &&
    (!search || c.name.toLowerCase().includes(search.toLowerCase())),
  )
  const live = enriched.filter((c) => ['active', 'overdue'].includes(c.state))
  const totals = enriched.filter((c) => c.state !== 'archived').reduce(
    (a, c) => ({ total: a.total + c.stats.total, sent: a.sent + c.stats.sent, done: a.done + c.stats.done }),
    { total: 0, sent: 0, done: 0 },
  )

  return (
    <div className="page">
      <PageHeader
        title="Campaigns"
        subtitle="Every greeting your team sends goes out as part of a campaign."
        actions={<Link to="/campaigns/new" className="btn btn-primary"><Plus size={16} /> New campaign</Link>}
      />

      <div className="stat-grid">
        <StatCard label="Live campaigns" value={live.length} tone="brand" hint={`${counts.scheduled ?? 0} scheduled`} />
        <StatCard label="Total messages" value={totals.total} tone="info" hint="Across non-archived campaigns" />
        <StatCard label="Sent" value={totals.sent} tone="ok" />
        <StatCard label="Completion" value={`${totals.total ? Math.round((totals.done / totals.total) * 100) : 0}%`} tone="neutral" />
      </div>

      <section className="card table-card">
        <div className="toolbar">
          <Tabs
            value={state}
            onChange={setState}
            tabs={[
              { value: 'all', label: 'All', count: enriched.length },
              { value: 'active', label: 'Live', count: (counts.active ?? 0) + (counts.overdue ?? 0) },
              { value: 'scheduled', label: 'Scheduled', count: counts.scheduled ?? 0 },
              { value: 'completed', label: 'Completed', count: counts.completed ?? 0 },
              { value: 'paused', label: 'Paused', count: counts.paused ?? 0 },
              { value: 'archived', label: 'Archived', count: counts.archived ?? 0 },
            ]}
          />
          <div className="toolbar-right">
            <div className="search-box"><Search size={16} /><input placeholder="Search campaigns…" value={search} onChange={(e) => setSearch(e.target.value)} /></div>
            <select className="select-sm" value={type} onChange={(e) => setType(e.target.value)}>
              <option value="all">All types</option>
              {Object.entries(CAMPAIGN_TYPES).map(([k, t]) => <option key={k} value={k}>{t.label}</option>)}
            </select>
          </div>
        </div>

        {enriched.length === 0 ? (
          <EmptyState
            icon={Megaphone}
            title="Create your first campaign"
            text="Upload a greeting card, choose your audience and split the work across your team."
            action={<Link to="/campaigns/new" className="btn btn-primary"><Plus size={16} /> New campaign</Link>}
          />
        ) : shown.length === 0 ? (
          <EmptyState icon={Search} title="No matching campaigns" text="Try a different filter or search term." />
        ) : (
          <div className="table-wrap">
            <table className="table table-hover">
              <thead>
                <tr><th>Campaign</th><th>Type</th><th>When</th><th className="num">Audience</th><th style={{ width: 200 }}>Progress</th><th>Status</th></tr>
              </thead>
              <tbody>
                {shown.map((c) => (
                  <tr key={c.id} onClick={() => navigate(`/campaigns/${c.id}`)}>
                    <td>
                      <div className="cell-with-icon">
                        <TypeIcon type={c.type} />
                        <div>
                          <div className="cell-title">{c.name}</div>
                          <div className="muted small">Created {formatDate(c.created_at.slice(0, 10))}</div>
                        </div>
                      </div>
                    </td>
                    <td><TypeBadge type={c.type} size="sm" /></td>
                    <td>
                      <div>{campaignWhen(c)}</div>
                      <div className="muted small">{isRecurring(c.type) ? 'Each contact on their date' : 'Everyone on this day'}</div>
                    </td>
                    <td className="num">{c.stats.total}</td>
                    <td>
                      <div className="progress-cell">
                        <Progress value={c.stats.rate} />
                        <span className="muted small">{c.stats.done}/{c.stats.total}</span>
                      </div>
                    </td>
                    <td><StatePill state={c.state} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  )
}
