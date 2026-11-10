import { BrowserRouter, Navigate, Outlet, Route, Routes } from 'react-router-dom'
import { AuthProvider, useAuth } from './context/AuthContext'
import { SettingsProvider } from './context/SettingsContext'
import { ToastProvider } from './context/ToastContext'
import { supabaseConfigured } from './lib/supabase'
import AppShell from './components/AppShell'
import { Spinner } from './components/ui'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import CalendarPage from './pages/CalendarPage'
import Campaigns from './pages/Campaigns'
import CampaignNew from './pages/CampaignNew'
import CampaignDetail from './pages/CampaignDetail'
import Contacts from './pages/Contacts'
import Templates from './pages/Templates'
import CardDesigner from './pages/CardDesigner'
import ImageLibrary from './pages/ImageLibrary'
import Reports from './pages/Reports'
import Team from './pages/Team'
import Settings from './pages/Settings'

function FullScreen({ children }) {
  return <div className="fullscreen-msg">{children}</div>
}

function RequireAuth() {
  const { user, profile, loading } = useAuth()
  if (loading) return <FullScreen><Spinner /></FullScreen>
  if (!user) return <Navigate to="/login" replace />
  if (!profile) return <FullScreen>Your account has no profile yet. Ask your admin to check the database setup.</FullScreen>
  if (!profile.is_active) return <FullScreen>Your account has been deactivated. Contact your administrator.</FullScreen>
  return (
    <SettingsProvider>
      <Outlet />
    </SettingsProvider>
  )
}

function RequireRole({ allow }) {
  const auth = useAuth()
  return allow(auth) ? <Outlet /> : <Navigate to="/" replace />
}

export default function App() {
  if (!supabaseConfigured) {
    return <FullScreen>Add your Supabase URL and key to <code>.env</code>, then restart <code>npm run dev</code>.</FullScreen>
  }

  return (
    <BrowserRouter>
      <ToastProvider>
        <AuthProvider>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route element={<RequireAuth />}>
              <Route element={<AppShell />}>
                <Route index element={<Dashboard />} />
                <Route path="calendar" element={<CalendarPage />} />
                <Route path="contacts" element={<Contacts />} />
                <Route path="settings" element={<Settings />} />
                <Route element={<RequireRole allow={(a) => a.canManage} />}>
                  <Route path="campaigns" element={<Campaigns />} />
                  <Route path="campaigns/new" element={<CampaignNew />} />
                  <Route path="campaigns/:id" element={<CampaignDetail />} />
                  <Route path="templates" element={<Templates />} />
                  <Route path="designer" element={<CardDesigner />} />
                  <Route path="designer/:id" element={<CardDesigner />} />
                  <Route path="images" element={<ImageLibrary />} />
                  <Route path="reports" element={<Reports />} />
                </Route>
                <Route element={<RequireRole allow={(a) => a.isAdmin} />}>
                  <Route path="team" element={<Team />} />
                </Route>
              </Route>
            </Route>
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </AuthProvider>
      </ToastProvider>
    </BrowserRouter>
  )
}
