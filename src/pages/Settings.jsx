import { useEffect, useState } from 'react'
import { Building2, KeyRound, Smartphone, UserRound } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { useSettings } from '../context/SettingsContext'
import { useToast } from '../context/ToastContext'
import { supabase } from '../lib/supabase'
import { roleLabel } from '../lib/roles'
import { Avatar, Field, PageHeader, PasswordInput } from '../components/ui'

export default function Settings() {
  const { profile, isAdmin, refreshProfile } = useAuth()
  const { settings, refresh } = useSettings()
  const toast = useToast()
  const [name, setName] = useState(profile?.full_name ?? '')
  const [password, setPassword] = useState('')
  const [confirmPw, setConfirmPw] = useState('')
  const [org, setOrg] = useState(settings)

  useEffect(() => setOrg(settings), [settings])

  async function saveName(e) {
    e.preventDefault()
    const { error } = await supabase.rpc('update_my_name', { new_name: name })
    if (error) return toast(error.message, 'error')
    await refreshProfile()
    toast('Profile updated', 'success')
  }

  async function savePassword(e) {
    e.preventDefault()
    if (password !== confirmPw) return toast('Passwords do not match', 'error')
    const { error } = await supabase.auth.updateUser({ password })
    if (error) return toast(error.message, 'error')
    setPassword('')
    setConfirmPw('')
    toast('Password changed', 'success')
  }

  async function saveOrg(e) {
    e.preventDefault()
    const { error } = await supabase.from('org_settings').update({
      company_name: org.company_name.trim(),
      default_country_code: org.default_country_code.replace(/\D/g, ''),
      signature: org.signature,
    }).eq('id', 1)
    if (error) return toast(error.message, 'error')
    await refresh()
    toast('Organisation settings saved', 'success')
  }

  return (
    <div className="page settings-page">
      <PageHeader title="Settings" subtitle="Manage your profile and workspace preferences." />

      <section className="card settings-section">
        <div className="settings-intro">
          <UserRound size={20} />
          <div><h3>Your profile</h3><p className="muted small">Your name appears as {'{sender}'} in messages.</p></div>
        </div>
        <form onSubmit={saveName} className="settings-body">
          <div className="profile-row">
            <Avatar name={profile?.full_name} size={52} />
            <div><strong>{profile?.full_name}</strong><div className="muted small">{profile?.email}, {roleLabel(profile?.role)}</div></div>
          </div>
          <Field label="Display name"><input value={name} onChange={(e) => setName(e.target.value)} required /></Field>
          <div className="row-end"><button className="btn btn-primary" disabled={!name.trim() || name === profile?.full_name}>Save profile</button></div>
        </form>
      </section>

      <section className="card settings-section">
        <div className="settings-intro">
          <KeyRound size={20} />
          <div><h3>Password</h3><p className="muted small">Use at least 6 characters.</p></div>
        </div>
        <form onSubmit={savePassword} className="settings-body form-grid">
          <Field label="New password"><PasswordInput value={password} onChange={(e) => setPassword(e.target.value)} minLength={6} required /></Field>
          <Field label="Confirm password"><PasswordInput value={confirmPw} onChange={(e) => setConfirmPw(e.target.value)} minLength={6} required /></Field>
          <div className="row-end span-2"><button className="btn btn-primary" disabled={password.length < 6}>Change password</button></div>
        </form>
      </section>

      {isAdmin && (
        <section className="card settings-section">
          <div className="settings-intro">
            <Building2 size={20} />
            <div><h3>Organisation</h3><p className="muted small">Applies to everyone in the workspace.</p></div>
          </div>
          <form onSubmit={saveOrg} className="settings-body form-grid">
            <Field label="Company name" hint="Used for {company} in messages and shown in the sidebar">
              <input value={org.company_name} onChange={(e) => setOrg((o) => ({ ...o, company_name: e.target.value }))} required />
            </Field>
            <Field label="Default country code" hint="Added to 10-digit numbers, e.g. 91 for India">
              <input value={org.default_country_code} onChange={(e) => setOrg((o) => ({ ...o, default_country_code: e.target.value }))} required />
            </Field>
            <div className="row-end span-2"><button className="btn btn-primary">Save organisation</button></div>
          </form>
        </section>
      )}

      <section className="card settings-section">
        <div className="settings-intro">
          <Smartphone size={20} />
          <div><h3>How sending works</h3><p className="muted small">WhatsApp limits what websites can do.</p></div>
        </div>
        <div className="settings-body help-list">
          <p><strong>On your phone:</strong> tap <em>Send</em>. Your phone's share menu opens with the card and message. Choose WhatsApp, then the client.</p>
          <p><strong>On a computer:</strong> click <em>Send</em>. The card is copied and the client's chat opens with the message typed in. Press <kbd>Ctrl</kbd>+<kbd>V</kbd> to paste the card, then send.</p>
          <p className="muted small">Fully automatic sending needs the paid WhatsApp Business Cloud API. It can be added later without changing how your team works.</p>
        </div>
      </section>
    </div>
  )
}
