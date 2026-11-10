import { readFileSync } from 'node:fs'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// Production security headers live in vercel.json. `npm run preview` serves the built app with the
// same headers, so the Content-Security-Policy can be tested locally before deploying.
const vercel = JSON.parse(readFileSync(new URL('./vercel.json', import.meta.url), 'utf8'))
const securityHeaders = Object.fromEntries(
  vercel.headers.find((h) => h.source === '/(.*)').headers
    .filter((h) => h.key !== 'Strict-Transport-Security') // HSTS on localhost would force https for every local project
    .map((h) => [h.key, h.key === 'Content-Security-Policy' ? h.value.replace('; upgrade-insecure-requests', '') : h.value]),
)

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  preview: { headers: securityHeaders },
})
