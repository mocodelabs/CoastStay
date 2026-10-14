# CoastStay

Property management for short-stay and holiday rentals on the Kenyan Coast — properties and units,
bookings and availability, guests, payments and expenses, housekeeping, maintenance, inventory,
guest messaging and reports.

**Stack:** React 19 · Vite · TypeScript (strict) · Tailwind CSS 4 · Radix primitives · React Router ·
TanStack Query · React Hook Form + Zod · Recharts · date-fns · Supabase (Postgres, Auth, RLS, Storage).

Defaults: KES · Africa/Nairobi · DD/MM/YYYY · en-KE.

## Documentation

| Doc | What it covers |
|---|---|
| [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) | Production setup, migrations, hosting, onboarding, backups, rollback |
| [docs/IMPLEMENTATION_PLAN.md](docs/IMPLEMENTATION_PLAN.md) | Phases, status, key design decisions |
| [docs/PERMISSIONS.md](docs/PERMISSIONS.md) | Roles, permission matrix, enforcement |
| [docs/FINANCE_MODEL.md](docs/FINANCE_MODEL.md) | Ledger, balances, refunds, reversals |
| [docs/REPORTS.md](docs/REPORTS.md) | Every dashboard/report metric and its formula |
| [docs/MASTER_PROMPT.md](docs/MASTER_PROMPT.md) | Original product requirements |

## Local development

Requirements: Node 22+, Docker Desktop.

```bash
npm install
npx supabase start          # local Postgres/Auth/Storage in Docker (first run downloads images)
cp .env.example .env.local  # then paste the publishable key from `npx supabase status`
npm run dev                 # http://localhost:5203
```

Local Supabase ports are moved to the **5632x** range (API `56321`, DB `56322`, Mailpit `56324`)
because Windows/Hyper-V reserves 54296–54395 on this machine. Studio and Realtime are disabled in
`supabase/config.toml` to save memory; set `enabled = true` to use Studio.

### First run

1. Open http://localhost:5203 and **Create an account**.
2. The first account on a fresh database may create the business (it becomes the owner). Afterwards,
   creating further businesses is disabled (`platform_settings.allow_self_service_orgs`), and new
   people join through **Settings → Staff & access → Invite staff**.
3. Invitation links are shown once and can be shared by WhatsApp or email. The invitee signs up with
   the invited email and accepts.

Password-reset and confirmation emails are captured locally by Mailpit at http://127.0.0.1:56324.

### Background jobs and Edge Functions

- Reminders and notifications: `public.run_reminders()` is scheduled every 30 minutes by pg_cron
  (created by migration 16). Owners can also run it from Settings → Notifications → “Check now”.
- Calendar sync: the `ical-sync` Edge Function is served by the local stack at
  `http://127.0.0.1:56321/functions/v1/ical-sync`. Owners trigger it from Settings → Integrations
  (“Sync now”). The scheduled hourly run authenticates with `ICAL_SYNC_SECRET` (see
  docs/DEPLOYMENT.md §5). To test scheduling or plain-http feeds locally, run
  `npx supabase functions serve --env-file <file with ICAL_SYNC_SECRET=… and/or ICAL_ALLOW_HTTP=true>`
  — never set `ICAL_ALLOW_HTTP` in production. After stopping `functions serve`, run
  `npx supabase stop` and `npx supabase start` to restore the default function runtime.

### Scripts

| Script | Purpose |
|---|---|
| `npm run dev` | Vite dev server on port 5203 |
| `npm run typecheck` | TypeScript (app + tests) |
| `npm run lint` | oxlint |
| `npm test` | Unit tests (pure logic) |
| `npm run test:integration` | Database/RLS tests against the **local** stack (refuses non-local URLs) |
| `npm run test:e2e` | Playwright end-to-end + accessibility tests (desktop and mobile) against the local stack |
| `npm run build` / `npm run preview` | Production build; preview serves it with the production security headers |
| `npm run hosting:config` | Regenerate `vercel.json` and `public/_headers` from `deploy/security-headers.ts` |
| `npm run seed:dev` | Demo business on the **local** stack (refuses other URLs) |
| `npm run db:reset` | Recreate the local database from `supabase/migrations` |
| `npm run db:types` | Regenerate `src/types/database.ts` from the local schema |

Integration tests create users on `@coaststay.test` and delete everything they created afterwards
(set `KEEP_TEST_DATA=1` to inspect it).

## Security notes

- The browser only ever receives the **publishable** key. All authorization is enforced by Postgres
  Row Level Security, guard triggers and security-definer functions — see docs/PERMISSIONS.md.
- Never put a service-role/secret key in a `VITE_*` variable or commit `.env.local`.
- Financial records are append-only (reversals, voids); see docs/FINANCE_MODEL.md.
