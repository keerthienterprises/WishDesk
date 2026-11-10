import { supabase } from './supabase'
import { fetchAll } from './data'
import { downloadFile } from './csv'
import { todayIso } from './dates'

// Every table an admin can read, saved as JSON files inside one ZIP.
// (The Supabase free plan has no automatic backups, so this is the safety net.)
const TABLES = ['profiles', 'org_settings', 'contacts', 'campaigns', 'campaign_recipients', 'templates', 'media', 'audit_log']

export async function downloadBackup(onProgress = () => {}) {
  const files = {}
  const counts = {}
  for (const [i, table] of TABLES.entries()) {
    onProgress(`${table} (${i + 1} of ${TABLES.length})`)
    // Tables without an "id" column (none today) would need another sort key
    const rows = await fetchAll(() => supabase.from(table).select('*').order('id'))
    counts[table] = rows.length
    files[`${table}.json`] = new TextEncoder().encode(JSON.stringify(rows, null, 2))
  }
  files['README.txt'] = new TextEncoder().encode(
    `WishDesk backup taken ${new Date().toISOString()}\n\n` +
    Object.entries(counts).map(([t, n]) => `${t}: ${n} rows`).join('\n') +
    '\n\nEach file is a JSON array of rows, exactly as stored in the database.\n' +
    'Images in the image library are stored separately in Supabase Storage (bucket "media").\n',
  )
  const { zipSync } = await import('fflate')
  downloadFile(new Blob([zipSync(files)], { type: 'application/zip' }), `wishdesk-backup-${todayIso()}.zip`)
  return counts
}
