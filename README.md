# WishDesk

Client engagement on WhatsApp for small teams: birthdays, anniversaries, festivals, offers and
announcements. Managers create campaigns from a shared contact directory and template library; the work is
split across the team, and everyone gets a daily queue with a one-tap **Send on WhatsApp** button.

**Stack:** React (Vite) · Supabase (Postgres + Auth + Edge Functions) · lucide-react icons

| Page | What it does |
|---|---|
| Dashboard | Today / overdue / next-7-days queue, monthly progress, upcoming occasions, team leaderboard |
| Calendar | Month view of every message, colour-coded by occasion; mine vs whole team |
| Campaigns | Create (5-step wizard), track, pause, duplicate, archive, export; re-split and reassign recipients |
| Contacts | Directory with tags, owners, birthdays, anniversaries, opt-out; CSV import/export, bulk actions |
| Templates | Reusable greeting cards + messages per occasion, festival starter texts |
| Reports | Sent per day, by occasion, team performance, campaign completion; CSV export |
| Team / Settings | Users and roles (admin), company name & country code, profile and password |

## Setup

### 1. Create the Supabase project
1. Create a project at [supabase.com](https://supabase.com).
2. **SQL Editor → New query** → paste all of `supabase/schema.sql` → **Run**.
   Then run each file in `supabase/migrations/` in number order (003, 004, 005…).
   Existing installs: run only the migrations you haven't run yet.
3. **Authentication → Users → Add user** → create your own login (tick *Auto confirm*).
4. Make yourself admin (SQL Editor):
   ```sql
   update public.profiles set role = 'admin' where email = 'you@company.com';
   ```
5. **Authentication → Sign In / Providers → Email**: turn **off** "Allow new users to sign up"
   (only admins create accounts).

### 2. Deploy the user-management function
Admins create team logins through an Edge Function, because that needs the secret service key.

```bash
npx supabase login
npx supabase link --project-ref YOUR_PROJECT_REF
npx supabase functions deploy manage-users
```

### 3. Run the app
```bash
cp .env.example .env     # then fill in URL + anon key from Project Settings → API
npm install
npm run dev
```

## Roles

| Role | Can do |
|---|---|
| **Admin** | Everything, plus team management and organisation settings |
| **Team Lead** | Campaigns, contacts, templates and reports |
| **Member** | Their own dashboard, calendar and assigned contacts |

### CSV format
Required: `name`, `number` (or `phone`, `mobile`, `whatsapp`). Optional: `dob`, `anniversary`, `email`, `city`, `company`, `tags` (separate with `;`), `notes`. Contacts are matched by number, so re-importing updates instead of duplicating.

```csv
name,dob,number
Ravi Kumar,05-11-1988,9876543210
Priya Sharma,1992-11-18,+91 98765 43211
```
Dates may be `DD-MM-YYYY`, `DD/MM/YYYY`, `YYYY-MM-DD` or `25 Nov 1990`. 10-digit numbers get
the default country code from Settings (91) prepended.

### About WhatsApp + images
WhatsApp's click-to-chat links can only pre-fill **text**; no website can attach an image automatically.
WishDesk works around this:
- **Phone:** opens the share sheet with the card image + message → tap WhatsApp → pick the contact.
- **Computer:** copies the card to the clipboard and opens the client's chat → press **Ctrl+V**, then send.

Fully automatic sending (no taps) needs the paid **WhatsApp Business Cloud API** — see the roadmap.

## Roadmap ideas
- Automatic sending via WhatsApp Business Cloud API (scheduled Edge Function at 9 AM)
- Daily reminder email/push to each member: "3 birthdays today"
- Anniversaries, festivals (Diwali, Sankranti, New Year), and client-joining anniversaries
- Multiple card designs per campaign and personalised cards (client name printed on the image)
- Move images from base64 to Supabase Storage if the database grows large
- Reports: wishes sent per member per month, missed birthdays
