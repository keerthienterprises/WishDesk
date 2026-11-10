import { supabase } from './supabase'
import { monthBounds, occurrenceIn, todayIso } from './dates'
import { isRecurring, typeMeta } from './campaignTypes'

export const CONTACT_COLS = 'id, full_name, phone, email, dob, anniversary, city, company, tags, owner_id, notes, opted_out, created_at'
export const CAMPAIGN_COLS = 'id, name, type, status, description, message, send_date, period_month, period_year, layout, created_by, created_at, updated_at'
export const RECIPIENT_COLS = 'id, campaign_id, contact_id, assigned_to, due_date, status, sent_at, sent_by'
export const RECIPIENT_WITH_JOINS =
  `${RECIPIENT_COLS}, contact:contacts(id, full_name, phone, dob, anniversary, notes, tags, opted_out), campaign:campaigns(id, name, type, status)`

export const chunk = (arr, size) => Array.from({ length: Math.ceil(arr.length / size) }, (_, i) => arr.slice(i * size, i * size + size))

export function check({ data, error }) {
  if (error) throw error
  return data
}

/**
 * Supabase returns at most 1,000 rows per request, whatever .limit() says.
 * Fetches every page of a query. `makeQuery` must build a fresh, consistently ordered query.
 */
export async function fetchAll(makeQuery, pageSize = 1000) {
  const rows = []
  for (let from = 0; ; from += pageSize) {
    const page = check(await makeQuery().range(from, from + pageSize - 1))
    rows.push(...page)
    if (page.length < pageSize) return rows
  }
}

// ---------- Campaign content (large images are fetched once per campaign and shared) ----------
// The promise is cached, so 50 cards for one campaign mounting together make a single request.
const contentCache = new Map()

export function getCampaignContent(id, { fresh = false } = {}) {
  if (fresh || !contentCache.has(id)) {
    const request = supabase.from('campaigns').select('id, name, type, image_base64, message, layout').eq('id', id).single().then(check)
    request.catch(() => contentCache.delete(id)) // don't keep a failed request around
    contentCache.set(id, request)
  }
  return contentCache.get(id)
}

export async function updateCampaign(id, changes) {
  const data = check(await supabase.from('campaigns').update(changes).eq('id', id).select(`${CAMPAIGN_COLS}, image_base64`).single())
  contentCache.set(id, Promise.resolve(data))
  return data
}

export const forgetCampaign = (id) => contentCache.delete(id)

// ---------- Campaign lifecycle ----------
export function campaignWindow(c) {
  if (isRecurring(c.type)) return monthBounds(c.period_year, c.period_month)
  return [c.send_date, c.send_date]
}

// Display state combining stored status with dates and progress
export function campaignState(c, stats) {
  if (c.status === 'archived') return 'archived'
  if (c.status === 'paused') return 'paused'
  if (stats && stats.total > 0 && stats.pending === 0) return 'completed'
  const [start, end] = campaignWindow(c)
  const today = todayIso()
  if (start > today) return 'scheduled'
  if (end < today && stats?.pending) return 'overdue'
  return 'active'
}

// Totals for every campaign, computed in the database (see the campaign_stats view)
export async function fetchCampaignStats() {
  const rows = await fetchAll(() => supabase.from('campaign_stats').select('*').order('campaign_id'))
  return Object.fromEntries(rows.map((r) => [r.campaign_id, withRates(r)]))
}

function withRates(s) {
  const done = s.sent + s.skipped
  return { ...s, done, rate: s.total ? Math.round((done / s.total) * 100) : 0 }
}

export function summarize(recipients) {
  const s = { total: recipients.length, sent: 0, pending: 0, skipped: 0, overdue: 0 }
  const today = todayIso()
  for (const r of recipients) {
    s[r.status]++
    if (r.status === 'pending' && r.due_date < today) s.overdue++
  }
  return withRates(s)
}

// ---------- Recipients ----------
export async function fetchRecipients({ from, to, assignedTo, campaignId } = {}) {
  const rows = await fetchAll(() => {
    let q = supabase.from('campaign_recipients').select(RECIPIENT_WITH_JOINS)
    if (from) q = q.gte('due_date', from)
    if (to) q = q.lte('due_date', to)
    if (assignedTo) q = q.eq('assigned_to', assignedTo)
    if (campaignId) q = q.eq('campaign_id', campaignId)
    return q.order('due_date').order('id')
  })
  // Paused/archived campaigns don't create work
  return campaignId ? rows : rows.filter((r) => r.campaign?.status === 'active')
}

// Columns to write when a greeting is marked sent / skipped / pending again.
// (For members the database overrides sent_at and sent_by with its own values.)
export function statusChanges(status, userId) {
  return status === 'pending'
    ? { status, sent_at: null, sent_by: null }
    : { status, sent_at: new Date().toISOString(), sent_by: userId }
}

export async function setRecipientStatus(id, status, userId) {
  return check(await supabase.from('campaign_recipients').update(statusChanges(status, userId)).eq('id', id).select(RECIPIENT_COLS).single())
}

export async function updateRecipients(ids, changes) {
  for (const part of chunk(ids, 200)) {
    check(await supabase.from('campaign_recipients').update(changes).in('id', part))
  }
}

// ---------- Team ----------
export async function fetchTeam() {
  return check(await supabase.from('profiles').select('*').order('full_name'))
}

// ---------- Contacts ----------
export function fetchContacts() {
  return fetchAll(() => supabase.from('contacts').select(CONTACT_COLS).order('full_name').order('id'))
}

const CONTACT_FIELDS = ['full_name', 'email', 'dob', 'anniversary', 'city', 'company', 'notes']

/** Insert new contacts and merge CSV data into existing ones (matched by phone). Returns the saved contacts. */
export async function upsertContacts(rows, userId) {
  const existing = new Map()
  for (const part of chunk(rows.map((r) => r.phone), 200)) {
    for (const c of check(await supabase.from('contacts').select('*').in('phone', part))) existing.set(c.phone, c)
  }

  const inserts = []
  const updates = []
  for (const r of rows) {
    const e = existing.get(r.phone)
    const values = Object.fromEntries(CONTACT_FIELDS.filter((f) => r[f]).map((f) => [f, r[f]]))
    if (e) {
      const tags = [...new Set([...(e.tags ?? []), ...(r.tags ?? [])])]
      const { created_at: _c, updated_at: _u, ...base } = e
      updates.push({ ...base, ...values, tags })
    } else {
      inserts.push({ ...values, phone: r.phone, tags: r.tags ?? [], created_by: userId })
    }
  }
  for (const part of chunk(inserts, 500)) check(await supabase.from('contacts').insert(part))
  for (const part of chunk(updates, 500)) check(await supabase.from('contacts').upsert(part, { onConflict: 'id' }))

  const saved = []
  for (const part of chunk(rows.map((r) => r.phone), 200)) {
    saved.push(...check(await supabase.from('contacts').select(CONTACT_COLS).in('phone', part)))
  }
  return saved
}

// Which contacts a campaign reaches, and on what date
export function eligibleRecipients(type, contacts, { periodMonth, periodYear, sendDate }) {
  const field = typeMeta(type).dateField
  return contacts
    .filter((c) => !c.opted_out)
    .flatMap((c) => {
      if (!field) return [{ contact: c, due_date: sendDate }]
      const date = c[field]
      if (!date || Number(date.slice(5, 7)) !== periodMonth) return []
      return [{ contact: c, due_date: occurrenceIn(date, periodYear) }]
    })
    .sort((a, b) => a.due_date.localeCompare(b.due_date) || a.contact.full_name.localeCompare(b.contact.full_name))
}

/**
 * mode 'even': round-robin across userIds (spreads dates evenly)
 * mode 'owner': keep each contact's relationship owner; unowned contacts are split evenly
 */
export function assignRecipients(items, { mode, userIds }) {
  let i = 0
  return items.map((item) => {
    const owner = item.contact.owner_id
    if (mode === 'owner' && owner && userIds.includes(owner)) return { ...item, assigned_to: owner }
    return { ...item, assigned_to: userIds[i++ % userIds.length] }
  })
}

// Creates the campaign, its recipients and owner assignments in one database transaction
// (create_campaign in migrations/005): either everything is saved or nothing is.
export async function createCampaign(campaign, assigned) {
  const recipients = assigned.map((a) => ({ contact_id: a.contact.id, assigned_to: a.assigned_to, due_date: a.due_date }))
  const id = check(await supabase.rpc('create_campaign', { p_campaign: campaign, p_recipients: recipients }))
  return { id }
}

// Another live campaign for the same occasion and period, so clients aren't wished twice
export async function findOverlappingCampaign(campaign) {
  let q = supabase.from('campaigns').select('id, name').eq('type', campaign.type).neq('status', 'archived').limit(1)
  q = campaign.send_date
    ? q.eq('send_date', campaign.send_date)
    : q.eq('period_month', campaign.period_month).eq('period_year', campaign.period_year)
  return check(await q)[0] ?? null
}
