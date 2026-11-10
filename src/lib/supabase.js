import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const key = import.meta.env.VITE_SUPABASE_ANON_KEY

export const supabaseConfigured = Boolean(url && key && !url.includes('YOUR-PROJECT'))
export const supabase = supabaseConfigured ? createClient(url, key) : null

// Calls the admin-only Edge Function (see supabase/functions/manage-users)
export async function manageUsers(body) {
  const { data, error } = await supabase.functions.invoke('manage-users', { body })
  if (error) {
    let message = error.message
    try { message = (await error.context.json()).error ?? message } catch { /* keep default */ }
    throw new Error(message)
  }
  return data
}
