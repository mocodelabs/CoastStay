# CoastStay — Deployment & Operations

How to take CoastStay from this repository to a hosted production system, keep it backed up, release
updates and roll them back. Everything here was rehearsed against the local stack (2026-10-13); the
hosted-only steps (dashboard settings, billing-dependent backups) are marked **hosted**.

**What gets deployed**

| Piece | Where | Source |
|---|---|---|
| Web app (static SPA) | Vercel, Netlify or Cloudflare Pages | `npm run build` → `dist/` |
| Database, Auth, Storage | One Supabase project per environment | `supabase/migrations/*` (20 files) |
| Calendar sync | Supabase Edge Function `ical-sync` | `supabase/functions/ical-sync` |
| Reminders | pg_cron job `coaststay-reminders` (every 30 min) | created by migration 16 |
| Calendar sync schedule | pg_cron job `coaststay-ical-sync` (hourly) | `supabase/production/schedule-ical-sync.sql` |

Use **separate Supabase projects** for staging and production. Never point a local `.env.local`,
tests or `npm run seed:dev` at production — the test and seed scripts refuse non-local URLs on purpose.

---

## 1. Prerequisites

- Node 22+ and npm (Node 22.18+ / 24 for `npm run hosting:config`, which runs TypeScript directly).
- A Supabase account. The CLI runs through `npx supabase` (no global install needed).
- An account on the static host you choose, and the domain you will serve the app from
  (examples below use `https://app.example.co.ke`).
- An SMTP provider for auth emails (see 2.3). Supabase's built-in email sender is rate-limited and meant
  for testing only.

## 2. Create and configure the Supabase project (**hosted**)

### 2.1 Project

1. Create a new project. Pick the region with the lowest latency to your users that the dashboard offers,
   and record the **database password** in your password manager.
2. From **Project Settings → API keys** note:
   - Project URL `https://<project-ref>.supabase.co`
   - **Publishable** key (`sb_publishable_…`, or the legacy `anon` key) — the only key the web app gets.
   - The **secret / service-role** key stays in the dashboard. CoastStay's frontend, hosting config
     and scheduler never need it; Edge Functions receive it automatically from Supabase.

### 2.2 Extensions

**Database → Extensions**: enable **pg_cron** and **pg_net** *before* pushing migrations.
Migration 16 creates the reminders job only if pg_cron is available; if it was skipped, see §10.
`btree_gist` and `citext` are created by migration 1; Vault is on by default.

### 2.3 Authentication

**Authentication → URL configuration**

| Setting | Value |
|---|---|
| Site URL | `https://app.example.co.ke` |
| Redirect URLs | `https://app.example.co.ke/**` (add a staging/preview origin only on the staging project) |

The app sends users back to `/login` (email confirmation), `/reset-password` (password reset) and
`/accept-invite?token=…` (staff invitations, shared by the owner) — all covered by the wildcard.

**Authentication → Providers → Email**

| Setting | Production value | Why |
|---|---|---|
| Enable sign-ups | On | Invited staff create their own accounts. Businesses can't be created freely (§4). |
| Confirm email | **On** | Proves address ownership: the bootstrap safeguard requires a confirmed email, and an invitation can only be accepted by an account with the invited address. Local dev has it off. |
| Secure email change | On | |
| Secure password change | On | |
| Minimum password length | 10 or more | Local uses 8; production should be stricter. |
| Password requirements | Letters and digits (or stronger) | |
| Leaked password protection | On, if your plan offers it | |

**Authentication → SMTP**: configure your provider (sender e.g. `no-reply@example.co.ke`) and set a
sensible rate limit. **Authentication → Emails**: optionally brand the templates — keep the
`{{ .ConfirmationURL }}` placeholders intact.

Disable every provider you don't use (phone, OAuth). MFA is not used by the app yet.

## 3. Database migrations

```bash
npx supabase login
npx supabase link --project-ref <project-ref>
npx supabase db push --dry-run     # lists the migrations that would run
npx supabase db push               # applies them in order
```

- Migrations are **forward-only** and versioned by timestamp. `db push` records each one in
  `supabase_migrations.schema_migrations` and never re-runs an applied file.
- `db push` does **not** run seed data (there is no `supabase/seed.sql`; `npm run seed:dev` is local-only).
- Storage buckets and their policies are created by migration 9 — no manual bucket setup.
- After pushing, open **Advisors → Security** in the dashboard; it should report no RLS or
  search-path findings (the same checks are in `supabase/production/verify.sql`).

**Rules for future schema changes**

1. Never edit a migration that has run anywhere outside your machine. Add a new file:
   `npx supabase migration new <name>`.
2. Apply and test locally (`npx supabase migration up`, `npm run db:types`, `npm run test:integration`).
3. Push to **staging** first, run the smoke test (§8), then production.

## 4. Reserve the first business for the administrator

On an empty database the first signed-in user may create the business and becomes its **owner**. Close
that window *before* the URL is public. In the SQL editor:

```sql
update public.platform_settings set bootstrap_owner_email = 'admin@example.co.ke';
```

Only that email address, once confirmed, can create the first business (migration 20). Everyone else
sees "ask the owner to invite you". After the business exists this setting has no further effect, and
creating additional businesses stays disabled (`platform_settings.allow_self_service_orgs = false`).
`platform_settings` has no client policies, so neither value can be read or changed from the browser.

## 5. Calendar sync Edge Function

```bash
# A random secret shared between the scheduler and the function (≥ 32 chars)
openssl rand -hex 32
npx supabase secrets set ICAL_SYNC_SECRET=<secret> --project-ref <project-ref>
npx supabase functions deploy ical-sync --no-verify-jwt --project-ref <project-ref>
```

- `--no-verify-jwt` matches `supabase/config.toml`: the function authenticates callers itself —
  signed-in owners by access token (checked with Supabase Auth, then RLS decides which feed they may
  sync), the scheduler by the `x-sync-secret` header. The service-role key never leaves Supabase.
- **Never** set `ICAL_ALLOW_HTTP` in a hosted project; it exists only for local testing with plain-http
  feeds. Feed URLs must be `https://` (also enforced by a database check).
- Then schedule it: open `supabase/production/schedule-ical-sync.sql`, replace the two placeholders
  **in the SQL editor only** (don't save real values to the file), and run it. It stores the project URL
  and the secret in Vault and creates the hourly `coaststay-ical-sync` job. Rotation steps are at the
  bottom of that file.

The scheduling chain (cron → Vault → pg_net → function → `sync_calendar_feed`) was tested end to end
locally, including a failing feed being recorded as an error without exposing its URL.

## 6. Web app hosting

### 6.1 Environment variables (build time — Vite inlines them into the bundle)

| Variable | Value | Notes |
|---|---|---|
| `VITE_SUPABASE_URL` | `https://<project-ref>.supabase.co` | |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | publishable / anon key | Public by design; RLS protects the data. |
| `VITE_APP_URL` | `https://app.example.co.ke` | Used in invitation and password-reset links. |

Anything prefixed `VITE_` is shipped to every browser. **Never** add the secret/service-role key, the
database password or `ICAL_SYNC_SECRET` as a `VITE_` variable.

### 6.2 Build settings

Build command `npm run build` (typecheck + Vite build), output directory `dist`, Node 22+.

### 6.3 Hosts

Security headers and caching are defined once in `deploy/security-headers.ts` and written to the host
files by `npm run hosting:config`; a unit test fails if the committed files drift.

| Host | Files used | SPA fallback |
|---|---|---|
| Vercel | `vercel.json` (rewrites + headers) | rewrite to `/index.html` |
| Netlify | `netlify.toml` (build, redirect) + `public/_headers` | `/* → /index.html 200` |
| Cloudflare Pages | `public/_headers` | automatic (no `404.html`) |

Headers sent on every response: a strict **Content-Security-Policy** (scripts only from the app's own
origin; network only to the app and `*.supabase.co`; no framing, plugins or foreign form targets), HSTS
(2 years), `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`,
`Referrer-Policy: strict-origin-when-cross-origin` (invitation tokens never leak to other sites),
`Permissions-Policy` (camera, microphone, geolocation, payment off) and
`Cross-Origin-Opener-Policy: same-origin`. Hashed files under `/assets/` are cached for a year;
`index.html` is always revalidated so a deploy takes effect immediately.

**If you use a Supabase custom domain**, change `HOSTED_SUPABASE_ORIGINS` in
`deploy/security-headers.ts`, run `npm run hosting:config`, and commit the regenerated files.

**Check the CSP before deploying:** `npm run build && npm run preview` serves the production build with
the same headers, pointed at whichever Supabase URL the build used. Open it, sign in, visit the main
screens and confirm the browser console shows no "Content Security Policy" errors (done for this
release: dashboard with charts, reports, calendar, properties, finances, bookings, messages, integrations).

## 7. Administrator onboarding

1. Open the production URL, **Create an account** with the email set in §4, and confirm it from the email.
2. Sign in → **Set up your business** (name, phone, email). You become the owner; the business is seeded
   with default expense categories, cleaning checklists and message templates.
3. **Settings → Business**: contact details, currency KES and time zone Africa/Nairobi.
   **Settings → Bookings & payments**: default check-in/out times, suggested deposit, when the balance
   is due, booking reference prefix and the payment methods you accept.
4. **Settings → Message templates**, **Checklists**, **Expense categories** and **Notifications**:
   review the seeded defaults (guest message wording, cleaning checklists, categories, which reminders
   staff receive).
5. **Properties**: add each property, its units, rates, cleaning fee and photos.
6. **Settings → Staff & access → Invite staff**: choose the role (owner, manager, finance or
   housekeeping), property access and finance visibility. Share the one-time link by WhatsApp or email;
   the invitee signs up with the invited address and accepts. See `docs/PERMISSIONS.md` for exactly
   what each role can do.
7. **Settings → Integrations** (owners): add Airbnb/Booking.com iCal export links per unit and press
   **Sync now** once. Imported stays appear as blocked dates; overlaps with your own bookings are flagged
   for review, never changed automatically.
8. Record existing future bookings and their deposits so balances, reminders and reports start correct.

Payments: M-Pesa, bank and card payments are **recorded manually** with their reference. CoastStay
does not connect to M-Pesa (Daraja) or any payment provider, and never marks a payment as verified by
a provider. Guest messages are prepared in the app and sent by staff through WhatsApp (`wa.me`); nothing
is sent automatically.

## 8. Go-live verification

1. Run `supabase/production/verify.sql` in the SQL editor (read-only). Every row should be `ok`; the
   calendar-sync rows may say `CHECK` until §5 is done, and "reminders ran" until 30 min after deploy.
2. Smoke test on the live URL with a throwaway property, then delete or archive it:
   - Sign in as owner; create a property and a booking; record a deposit; see the balance update.
   - Open the booking calendar and the dashboard; open Reports.
   - Invite a test staff address with the housekeeping role; accept; confirm they see their cleaning
     work and no money, then remove them.
   - Request a password reset and check the email arrives and the link opens `/reset-password`.
   - If you use feeds: **Sync now** on one feed and check `last synced` updates.
3. Browser console on the live site: no CSP errors.

## 9. Backups & recovery

**What must be backed up**

| Data | Lives in | Covered by Supabase DB backups? |
|---|---|---|
| Bookings, guests, payments, expenses, tasks, audit log | Postgres | Yes |
| Auth users | Postgres (`auth` schema) | Yes |
| Photos, receipts, attachments, logos | Supabase Storage (objects) | **No** — only the metadata rows |
| Edge Function secret, Vault secrets | Supabase config / Vault | Vault: yes (encrypted). Function secret: keep in your password manager |

**Hosted backups (**hosted**, plan-dependent)**: paid plans include automated daily backups with a
retention window set by the plan; **Point-in-Time Recovery** is an add-on that lets you restore to any
second within its window. For a business that takes payments, enable PITR on production, then confirm in
**Database → Backups** what your plan actually retains.

**Your own off-site copy** (recommended weekly, plus before every production migration):

```bash
npx supabase db dump --linked -f backups/schema-$(date +%F).sql
npx supabase db dump --linked --data-only -f backups/data-$(date +%F).sql
npx supabase db dump --linked --role-only -f backups/roles-$(date +%F).sql
```

Store dumps encrypted, outside the repo (they contain guest personal data — `backups/` must never be
committed) and outside Supabase. Copy Storage buckets too, e.g. with any S3-compatible tool against the
project's Storage S3 endpoint (credentials from **Storage → S3 access keys**, kept off developer laptops).

**Restore drill** (do this once before go-live and then quarterly): restore the latest dump into a fresh
staging project (`psql` with the roles, schema, then data files), point a local build at it, sign in and
run the §8 smoke test. Record how long it took — that is your realistic recovery time.

**Recovery choices**

- *A bad record or mistaken entry*: fix it in the app. Payments and expenses are append-only — use
  reversals/voids so the history stays auditable (`docs/FINANCE_MODEL.md`).
- *Data corrupted by a bad release*: prefer a corrective migration. If data was destroyed, use PITR to a
  moment before the release into a **new** project, extract the affected rows, and re-insert them; a
  full in-place restore also discards every legitimate change made since that moment.
- *Lost project*: restore the latest backup or dump into a new project, re-deploy the function and
  secrets (§5), re-run the schedule script, point the web app's environment at it and redeploy.

## 10. Releasing updates & rolling back

**Release order** (each step on staging first):

1. Take a dump (§9) or confirm a fresh backup exists.
2. `npx supabase db push --dry-run`, then `npx supabase db push`. Migrations are written to be additive
   so the previous frontend keeps working while the new one deploys.
3. `npx supabase functions deploy ical-sync --no-verify-jwt` if the function changed.
4. Deploy the frontend (push to the branch your host builds, or run its CLI).
5. Run the §8 smoke test.

**Rollback**

| Layer | How |
|---|---|
| Frontend | Re-promote the previous deployment in your host (instant on Vercel/Netlify/Cloudflare). |
| Edge Function | Check out the previous release tag and `functions deploy` again. |
| Database | **No automatic down-migrations.** Write a new migration that reverses the change (drop the new column/function, restore the old definition from the previous migration file), test locally, push. Restore from backup/PITR only when data itself must be recovered (see §9). |

Tag every production release in git (e.g. `v1.0.0`) so you can rebuild exactly what was running.

**Re-creating the reminders job** (only if pg_cron was enabled after migration 16 ran):

```sql
select cron.schedule('coaststay-reminders', '*/30 * * * *', 'select public.run_reminders()');
```

## 11. Operating checklist

- **Daily/weekly**: the notifications bell and dashboard for balances due and today's tasks;
  Settings → Integrations for feeds in error or conflicts to resolve.
- **Background jobs**: `select * from cron.job_run_details order by start_time desc limit 20;` —
  reminders runs are also logged in `public.reminder_runs`; calendar runs in `public.calendar_sync_runs`
  and `net._http_response` (kept 6 h).
- **Security**: review **Advisors → Security** after each migration; rotate `ICAL_SYNC_SECRET` if it may
  have leaked; remove staff who leave via **Settings → Staff & access** (access is revoked immediately).
- **Updates**: `npm audit` and dependency updates monthly, through staging.

## 12. Security summary

- The browser holds only the publishable key; all authorization is in Postgres (RLS on every table,
  guard triggers, security-definer functions with pinned `search_path`), verified by 74 integration tests.
- Private calendar feed URLs are fetched only by the Edge Function and are readable only by owners.
- No secrets are committed: `.env*` files are git-ignored except `.env.example`; production secrets live
  in the host's environment settings, Supabase function secrets and Vault.
- Public bucket `branding` holds logos only (2 MB, images); everything else is private and served through
  short-lived signed URLs.
