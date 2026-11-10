// Admin-only user management. The service role key stays on the server.
// Deploy:  supabase functions deploy manage-users   (or paste into Dashboard -> Edge Functions)
// Body: { action: 'create', email, password, full_name, role }
//       { action: 'reset_password', user_id, password }
//       { action: 'set_active', user_id, is_active }
import { createClient } from 'npm:@supabase/supabase-js@2'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } })

const ROLES = ['admin', 'team_lead', 'member']

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })

  try {
    const url = Deno.env.get('SUPABASE_URL')!
    const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)

    // Verify the caller is a logged-in, active admin
    const token = (req.headers.get('Authorization') ?? '').replace('Bearer ', '')
    const { data: { user }, error: authError } = await admin.auth.getUser(token)
    if (authError || !user) return json({ error: 'Not authenticated' }, 401)

    const { data: caller } = await admin.from('profiles').select('role, is_active').eq('id', user.id).single()
    if (caller?.role !== 'admin' || !caller.is_active) return json({ error: 'Admins only' }, 403)

    let body
    try {
      body = await req.json()
    } catch {
      return json({ error: 'Request body must be JSON' }, 400)
    }

    if (body.action === 'create') {
      const { email, password, full_name } = body
      const role = ROLES.includes(body.role) ? body.role : 'member'
      if (!email || !password || password.length < 6) return json({ error: 'Email and a 6+ character password are required' }, 400)
      // The role goes in app_metadata: only the server can set it, so nobody can pick their own role
      const { data, error } = await admin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { full_name },
        app_metadata: { role },
      })
      if (error) return json({ error: error.message }, 400)
      // Belt and braces in case the database trigger is an older version
      const { error: profileError } = await admin.from('profiles').update({ role, full_name: full_name || email.split('@')[0] }).eq('id', data.user.id)
      if (profileError) return json({ error: `Account created, but setting the role failed: ${profileError.message}` }, 500)
      return json({ user_id: data.user.id })
    }

    if (body.action === 'reset_password') {
      if (!body.user_id) return json({ error: 'user_id is required' }, 400)
      if (!body.password || body.password.length < 6) return json({ error: 'Password must be 6+ characters' }, 400)
      const { error } = await admin.auth.admin.updateUserById(body.user_id, { password: body.password })
      if (error) return json({ error: error.message }, 400)
      return json({ ok: true })
    }

    if (body.action === 'set_active') {
      if (!body.user_id) return json({ error: 'user_id is required' }, 400)
      if (body.user_id === user.id) return json({ error: "You can't deactivate yourself" }, 400)
      const isActive = Boolean(body.is_active)
      const { error } = await admin.auth.admin.updateUserById(body.user_id, { ban_duration: isActive ? 'none' : '876000h' })
      if (error) return json({ error: error.message }, 400)
      const { error: profileError } = await admin.from('profiles').update({ is_active: isActive }).eq('id', body.user_id)
      if (profileError) return json({ error: `Sign-in ${isActive ? 'enabled' : 'blocked'}, but the profile update failed: ${profileError.message}` }, 500)
      return json({ ok: true })
    }

    return json({ error: 'Unknown action' }, 400)
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : 'Unexpected error' }, 500)
  }
})
