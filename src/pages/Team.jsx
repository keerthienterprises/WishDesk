import { useEffect, useState } from 'react'
import { KeyRound, Shield, UserCheck, UserPlus } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'
import { manageUsers, supabase } from '../lib/supabase'
import { ROLES } from '../lib/roles'
import { fetchAll, fetchTeam } from '../lib/data'
import { formatDate, todayIso } from '../lib/dates'
import { Avatar, Field, Modal, PageHeader, Spinner, StatCard } from '../components/ui'

export default function Team() {
  const { user } = useAuth()
  const toast = useToast()
  const [team, setTeam] = useState(null)
  const [workload, setWorkload] = useState({})
  const [inviting, setInviting] = useState(false)
  const [resetFor, setResetFor] = useState(null)

  const load = () => fetchTeam().then(setTeam).catch((e) => { toast(e.message, 'error'); setTeam((t) => t ?? []) })
  useEffect(() => {
    load()
    fetchAll(() => supabase.from('campaign_recipients').select('id, assigned_to, status, due_date, campaign:campaigns(status)').eq('status', 'pending').order('id')).then((data) => {
      const w = {}
      const today = todayIso()
      for (const r of data) {
        if (r.campaign?.status !== 'active' || !r.assigned_to) continue
        w[r.assigned_to] ??= { pending: 0, overdue: 0 }
        w[r.assigned_to].pending++
        if (r.due_date < today) w[r.assigned_to].overdue++
      }
      setWorkload(w)
    }).catch((e) => toast(e.message, 'error'))
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  async function changeRole(u, role) {
    const { error } = await supabase.from('profiles').update({ role }).eq('id', u.id)
    if (error) return toast(error.message, 'error')
    toast(`${u.full_name} is now ${ROLES[role].label}`, 'success')
    load()
  }

  async function toggleActive(u) {
    if (u.is_active && !confirm(`Deactivate ${u.full_name}? They won't be able to sign in. Reassign their pending messages from each campaign.`)) return
    try {
      await manageUsers({ action: 'set_active', user_id: u.id, is_active: !u.is_active })
      toast(u.is_active ? 'User deactivated' : 'User reactivated', 'success')
      load()
    } catch (err) {
      toast(err.message, 'error')
    }
  }

  if (!team) return <Spinner />

  const active = team.filter((u) => u.is_active)

  return (
    <div className="page">
      <PageHeader
        title="Team"
        subtitle="Invite people, set their role and keep an eye on workload."
        actions={<button className="btn btn-primary" onClick={() => setInviting(true)}><UserPlus size={16} /> Add member</button>}
      />

      <div className="stat-grid">
        <StatCard label="Active members" value={active.length} tone="brand" />
        <StatCard label="Admins" value={active.filter((u) => u.role === 'admin').length} icon={Shield} tone="info" />
        <StatCard label="Team leads" value={active.filter((u) => u.role === 'team_lead').length} icon={UserCheck} tone="ok" />
        <StatCard label="Inactive" value={team.length - active.length} tone="neutral" />
      </div>

      <section className="card table-card">
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>Member</th><th>Role</th><th className="num">Pending</th><th className="num">Overdue</th><th>Status</th><th>Joined</th><th /></tr></thead>
            <tbody>
              {team.map((u) => (
                <tr key={u.id} className={u.is_active ? '' : 'row-muted'}>
                  <td>
                    <div className="cell-with-icon">
                      <Avatar name={u.full_name} size={34} />
                      <div>
                        <div className="cell-title">{u.full_name}{u.id === user.id && <span className="muted small"> (you)</span>}</div>
                        <div className="muted small">{u.email}</div>
                      </div>
                    </div>
                  </td>
                  <td>
                    {u.id === user.id ? <span className="pill pill-info">{ROLES[u.role].label}</span> : (
                      <select className="select-sm" value={u.role} onChange={(e) => changeRole(u, e.target.value)}>
                        {Object.entries(ROLES).map(([r, { label }]) => <option key={r} value={r}>{label}</option>)}
                      </select>
                    )}
                  </td>
                  <td className="num">{workload[u.id]?.pending ?? 0}</td>
                  <td className="num">{workload[u.id]?.overdue ? <span className="danger-text">{workload[u.id].overdue}</span> : 0}</td>
                  <td>{u.is_active ? <span className="pill pill-ok">Active</span> : <span className="pill pill-neutral">Inactive</span>}</td>
                  <td className="muted small nowrap">{formatDate(u.created_at.slice(0, 10))}</td>
                  <td className="num nowrap">
                    <button className="btn btn-ghost btn-sm" onClick={() => setResetFor(u)}><KeyRound size={14} /> Password</button>
                    {u.id !== user.id && (
                      <button className="btn btn-ghost btn-sm" onClick={() => toggleActive(u)}>{u.is_active ? 'Deactivate' : 'Activate'}</button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="card role-guide">
        <div className="card-title">Roles & permissions</div>
        <div className="role-grid">
          {Object.entries(ROLES).map(([k, r]) => (
            <div key={k} className="role-item"><strong>{r.label}</strong><p>{r.description}</p></div>
          ))}
        </div>
      </section>

      {inviting && <InviteModal onClose={() => setInviting(false)} onDone={load} />}
      {resetFor && <ResetPasswordModal user={resetFor} onClose={() => setResetFor(null)} />}
    </div>
  )
}

function InviteModal({ onClose, onDone }) {
  const toast = useToast()
  const [form, setForm] = useState({ full_name: '', email: '', password: '', role: 'member' })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }))

  async function submit(e) {
    e.preventDefault()
    setBusy(true)
    setError('')
    try {
      await manageUsers({ action: 'create', ...form, email: form.email.trim() })
      toast(`${form.full_name} added. Share their email and password with them.`, 'success', 7000)
      onDone()
      onClose()
    } catch (err) {
      setError(err.message)
      setBusy(false)
    }
  }

  return (
    <Modal
      title="Add team member"
      subtitle="They can sign in immediately with the email and temporary password you set."
      onClose={onClose}
      footer={
        <>
          <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" form="invite-form" disabled={busy}>{busy ? 'Creating…' : 'Create account'}</button>
        </>
      }
    >
      <form id="invite-form" onSubmit={submit}>
        <Field label="Full name"><input value={form.full_name} onChange={set('full_name')} required autoFocus /></Field>
        <Field label="Work email"><input type="email" value={form.email} onChange={set('email')} required /></Field>
        <Field label="Temporary password" hint="At least 6 characters. Ask them to change it in Settings."><input value={form.password} onChange={set('password')} minLength={6} required /></Field>
        <Field label="Role">
          <div className="role-options">
            {Object.entries(ROLES).map(([k, r]) => (
              <label key={k} className={`role-option ${form.role === k ? 'is-on' : ''}`}>
                <input type="radio" name="role" value={k} checked={form.role === k} onChange={set('role')} />
                <div><strong>{r.label}</strong><span>{r.description}</span></div>
              </label>
            ))}
          </div>
        </Field>
        {error && <div className="alert alert-error">{error}</div>}
      </form>
    </Modal>
  )
}

function ResetPasswordModal({ user, onClose }) {
  const toast = useToast()
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit(e) {
    e.preventDefault()
    setBusy(true)
    try {
      await manageUsers({ action: 'reset_password', user_id: user.id, password })
      toast(`Password updated for ${user.full_name}`, 'success')
      onClose()
    } catch (err) {
      toast(err.message, 'error')
      setBusy(false)
    }
  }

  return (
    <Modal
      title={`Reset password`}
      subtitle={user.full_name}
      onClose={onClose}
      size="sm"
      footer={
        <>
          <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" form="reset-form" disabled={busy || password.length < 6}>Update</button>
        </>
      }
    >
      <form id="reset-form" onSubmit={submit}>
        <Field label="New password" hint="At least 6 characters"><input value={password} onChange={(e) => setPassword(e.target.value)} autoFocus /></Field>
      </form>
    </Modal>
  )
}
