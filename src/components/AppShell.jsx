import { useEffect, useState } from 'react'
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom'
import {
  BarChart3, CalendarDays, Images, LayoutDashboard, LayoutTemplate, LogOut, Megaphone, Menu, PenTool, Plus, Settings, Users, UsersRound,
} from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { useSettings } from '../context/SettingsContext'
import { roleLabel } from '../lib/roles'
import { Avatar } from './ui'

export default function AppShell() {
  const { profile, isAdmin, canManage, signOut } = useAuth()
  const { settings } = useSettings()
  const [open, setOpen] = useState(false)
  const location = useLocation()

  useEffect(() => setOpen(false), [location.pathname])

  const groups = [
    {
      label: 'Workspace',
      items: [
        { to: '/', label: 'Dashboard', icon: LayoutDashboard, end: true },
        { to: '/calendar', label: 'Calendar', icon: CalendarDays },
      ],
    },
    {
      label: 'Engage',
      items: [
        canManage && { to: '/campaigns', label: 'Campaigns', icon: Megaphone },
        canManage && { to: '/designer', label: 'Card designer', icon: PenTool },
        canManage && { to: '/images', label: 'Images', icon: Images },
        canManage && { to: '/templates', label: 'Templates', icon: LayoutTemplate },
        { to: '/contacts', label: canManage ? 'Contacts' : 'My Contacts', icon: UsersRound },
      ],
    },
    {
      label: 'Insights',
      items: [canManage && { to: '/reports', label: 'Reports', icon: BarChart3 }],
    },
    {
      label: 'Administration',
      items: [
        isAdmin && { to: '/team', label: 'Team', icon: Users },
        { to: '/settings', label: 'Settings', icon: Settings },
      ],
    },
  ]

  const today = new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' })

  return (
    <div className={`shell ${open ? 'nav-open' : ''}`}>
      <aside className="sidebar">
        <Link to="/" className="wordmark">
          <span className="wordmark-name">WishDesk<span>.</span></span>
          <span className="wordmark-org">{settings.company_name}</span>
        </Link>

        <nav className="side-nav">
          {groups.map((g) => {
            const items = g.items.filter(Boolean)
            if (!items.length) return null
            return (
              <div key={g.label} className="nav-group">
                {items.map(({ to, label, icon: Icon, end }) => (
                  <NavLink key={to} to={to} end={end} className="nav-item">
                    <Icon size={18} /> {label}
                  </NavLink>
                ))}
              </div>
            )
          })}
        </nav>

        <div className="side-user">
          <Avatar name={profile?.full_name} size={36} />
          <div className="side-user-info">
            <div className="side-user-name">{profile?.full_name}</div>
            <div className="side-user-role">{roleLabel(profile?.role)}</div>
          </div>
          <button className="icon-btn" onClick={signOut} title="Log out" aria-label="Log out"><LogOut size={17} /></button>
        </div>
      </aside>
      <div className="scrim" onClick={() => setOpen(false)} />

      <div className="main-col">
        <header className="topbar">
          <button className="icon-btn menu-btn" onClick={() => setOpen(true)} aria-label="Open menu"><Menu size={20} /></button>
          <div className="topbar-date">{today}</div>
          <div className="topbar-actions">
            {canManage && (
              <Link to="/campaigns/new" className="btn btn-primary btn-sm"><Plus size={16} /> New campaign</Link>
            )}
          </div>
        </header>
        <main className="content">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
