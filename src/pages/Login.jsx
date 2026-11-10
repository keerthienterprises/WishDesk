import { useState } from 'react'
import { Navigate } from 'react-router-dom'
import { CalendarCheck, MessageCircle, Users } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { DateBlock, PasswordInput } from '../components/ui'

export default function Login() {
  const { user, signIn } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [reduceMotion] = useState(() => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false)

  if (user) return <Navigate to="/" replace />

  async function handleSubmit(e) {
    e.preventDefault()
    setBusy(true)
    setError('')
    const { error } = await signIn(email.trim(), password)
    if (error) setError(error.message === 'Invalid login credentials' ? 'That email and password don’t match. Check them and try again.' : error.message)
    setBusy(false)
  }

  return (
    <div className="auth">
      <section className="auth-side">
        {/* A golden shield forms over a family home: plays once, then rests on the protected last frame.
            People who turn off motion see that last frame as a still image. */}
        {reduceMotion ? (
          <img className="auth-media" src="/login/protection-poster.jpg" alt="" />
        ) : (
          <video className="auth-media" src="/login/protection.mp4" poster="/login/protection-poster.jpg" autoPlay muted playsInline aria-hidden="true" />
        )}
        <div className="auth-shade" />
        <div className="wordmark">
          <span className="wordmark-name">WishDesk<span>.</span></span>
        </div>

        <div className="auth-today">
          <DateBlock size="lg" />
          <p>Sign in to see whose birthday, anniversary or festival greeting is due today.</p>
        </div>

        <ul className="auth-list">
          <li><CalendarCheck size={18} /><span>Your list for the day is ready when you sign in, with anything you missed from earlier.</span></li>
          <li><MessageCircle size={18} /><span>Each greeting opens in WhatsApp with the client's card and name filled in.</span></li>
          <li><Users size={18} /><span>Your manager decides who greets which client, so nobody gets wished twice.</span></li>
        </ul>
      </section>

      <section className="auth-form-wrap">
        <form className="auth-form" onSubmit={handleSubmit}>
          <h2>Sign in</h2>
          <p className="muted">Use the email and password your administrator gave you.</p>
          <label className="field">
            <span className="field-label">Email</span>
            <input type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus />
          </label>
          <label className="field">
            <span className="field-label">Password</span>
            <PasswordInput autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
          </label>
          {error && <div className="alert alert-error">{error}</div>}
          <button className="btn btn-primary btn-lg btn-block" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</button>
          <p className="muted small">Forgot your password? Your administrator can reset it from the Team page.</p>
        </form>
      </section>
    </div>
  )
}
