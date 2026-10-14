# CoastStay — Implementation Plan

Short-stay / holiday-rental property management for a small business on the Kenyan Coast.
Source requirements: `docs/MASTER_PROMPT.md`.

## Phase A — repository inspection (2026-10-13)

- `C:\Claude_code` is a multi-project workspace (not a git repo). No CoastStay code existed.
  Sibling projects (`keja-enterprise`, `mizpah-pms`, `daywell`, …) are separate products and are
  **not modified**.
- CoastStay is a new project at `C:\Claude_code\coaststay`, scaffolded with `create-vite` (react-ts).
- Toolchain available: Node 24, npm 11, Docker 29, git 2.49. No global Supabase CLI or psql — the
  Supabase CLI is installed as a dev dependency (`npx supabase`), and the local Supabase stack runs in
  Docker (API 54321, DB 54322, Studio 54323, Mailpit 54324).

## Stack (as installed)

React 19 + Vite 8 + TypeScript 6 (strict) · Tailwind CSS 4 · Radix primitives (`radix-ui`) with
shadcn-style components written in `src/components/ui` · React Router 8 · TanStack Query 5 ·
React Hook Form 7 + Zod 4 · Recharts 3 · date-fns 4 · Lucide · Sonner toasts · Supabase
(Postgres 17, Auth, RLS, Storage, Edge Functions) · Vitest 5 · Playwright.

## Phases

| Phase | Scope | Status |
|---|---|---|
| A | Inspect, plan, schema design | done |
| B | Tooling, design system, Supabase client, full schema + RLS, auth, onboarding, org membership, app shell, RLS/isolation tests | done (2026-10-13) |
| C | Properties & units, guests, bookings & calendar, payments & expenses, housekeeping, maintenance, inventory | done (2026-10-13) |
| D | Dashboard, reports, notifications, message templates & WhatsApp hand-off, scheduled jobs, iCal sync | done (2026-10-13) |
| E | QA: lint, typecheck, unit/integration/e2e, responsive, RLS & secrets review | done (2026-10-13) |
| F | Deployment docs, env, backups, rollback, clean-checkout verification | done (2026-10-13) |

## Database relationship overview

```
auth.users 1─1 profiles
organizations 1─1 organization_settings
organizations 1─* organization_members *─1 profiles          (role, status, can_view_finances)
organizations 1─* organization_invitations                   (hashed token → accept_invitation)
organizations 1─* properties 1─* property_units              (default unit auto-created)
                 properties 1─* property_photos, staff_property_assignments *─1 members
                 property_units 1─* property_blocks
                 property_units 1─* unit_occupancy ◄── bookings / property_blocks (EXCLUDE overlap)
organizations 1─* guests 1─* bookings *─1 property_units
                 bookings 1─* booking_payments (ledger; reversal → original)
                 bookings 1─* housekeeping_tasks (turnover:<booking> key) 1─* checklist_items/comments/photos
organizations 1─* expenses *─1 expense_categories (org, code); ─? property / booking / maintenance
organizations 1─* maintenance_requests 1─* maintenance_attachments; ─? property_blocks
organizations 1─* inventory_items 1─* inventory_movements (signed qty, balance_after)
organizations 1─* checklist_templates, recurring_task_templates, communication_templates,
                  communication_logs, notifications, audit_logs, calendar_feeds 1─* sync_runs/external_events
```

Child tables reference parents with composite keys `(organization_id, parent_id)` so a row can never
point at another organization's property, unit, guest, booking or member.

## Risks and dependencies

| Risk | Mitigation |
|---|---|
| Overlapping bookings under concurrency | Exclusion constraint on `unit_occupancy`; tested with 6 concurrent inserts |
| RLS gaps / cross-tenant leaks | RLS on every table, composite FKs, integration tests with two orgs and every role |
| Floating-point money errors | `numeric(12,2)` in DB, integer cents in UI, unit tests |
| Time-zone date shifts (UTC vs Nairobi) | ISO date strings for calendar dates, `todayISO(tz)`, tests at the UTC midnight boundary |
| No Airbnb API | Manual entry now; iCal feeds via a backend worker later (tables ready) |
| M-Pesa verification | Manual entries are `recorded` only; `verified` reserved for a service-role integration |
| WhatsApp automation needs a business provider | Manual `wa.me` hand-off; provider integration optional |
| Email delivery for password reset | Local Mailpit; production needs Supabase SMTP configured |
| Developer machine memory (16 GB, Docker) | Studio/Realtime disabled locally; tsc needs ~1 GB free |
| Windows reserved ports 54296–54395 | Local Supabase on 5632x |

## Phase B report (2026-10-13)

**Implemented**
- Vite + React 19 + TS strict + Tailwind 4 project, path aliases, oxlint, Vitest (unit/integration
  projects), coastal design tokens and shadcn-style UI kit (button, inputs, select, checkbox, switch,
  dialog/sheet/alert-dialog, dropdown, tabs, table, badge, card, skeleton, avatar), feedback states
  (empty/error/skeleton/QueryState), confirm dialog, accessible `Field`.
- Supabase local stack and 9 migrations: complete schema for all modules (31 tables), enums,
  generated booking totals, availability exclusion constraint, ledger triggers, inventory ledger,
  housekeeping auto-generation, guard triggers, audit triggers, storage buckets + policies, RLS on
  every table, invitation RPCs, guest anonymization, org defaults (expense categories, checklist,
  9 message templates).
- Auth: login, signup, forgot/reset password, accept-invite, onboarding (create business), protected
  routes, role-aware navigation, permission-guarded routes, organization switcher.
- App shell: collapsible desktop sidebar, mobile top bar + sheet menu + bottom navigation.
- Settings: my profile + password, business details + logo upload, booking defaults + payment
  methods, staff & access (invite links shown once with WhatsApp/email share, edit role/properties,
  finance flag, suspend, remove, pending invitations with new link/revoke).
- Phase-B dashboard (first-run setup checklist); other modules show a "being built" placeholder.

**Tested**
- 63 unit tests (money, dates incl. Nairobi midnight, phone normalization, templates, booking maths,
  ledger, permissions, error mapping, CSV).
- 51 integration tests against local Supabase: org bootstrap, two-org isolation, invitation rules,
  membership safeguards, permission-matrix parity, booking totals/validation, double booking incl.
  concurrency, blocks, status workflow, scoped staff, payments/refunds/reversals/adjustments/
  cancellation fees, ledger immutability, duplicate M-Pesa codes, verified-status protection, audit,
  finance permissions, expenses void flow, turnover tasks idempotency, housekeeping/maintenance column
  guards, inventory ledger, storage policies.
- `supabase db lint`: no errors. `tsc -b` and oxlint clean.
- Manual browser run: signup → onboarding → dashboard → invite caretaker → accept → role-filtered
  navigation, direct-URL access denial, mobile layout and menu.

**Bugs found and fixed during testing**: storage policy column shadowing (`name`), member removal
blocked by the completed-task guard, organization deletion blocked by the last-owner guard, settings
query firing with a null organization id.

**Configuration needed from the client**: none for local development. For production: a Supabase
project, SMTP for auth emails, the app URL in Auth redirect settings (see Phase F docs).

## Phase C report (2026-10-13)

**Implemented**
- **Database** (migrations 10–14): idempotency keys (`client_request_id`) on bookings, payments, expenses
  and stock movements; `create_booking` RPC (new guest + booking + first deposit in one transaction,
  SECURITY INVOKER so RLS applies, retry returns the original booking); `bookings_overview` view
  (security invoker, search text, payment state); `unit_conflicts` availability check;
  `housekeeping_schedule` (arrivals/departures for caretakers without guest/booking access);
  `finance_summary` (cash-basis period summary, invoker); `inventory_items.is_low_stock`; FKs for
  embedding (payment → property, assignees → profiles); early check-out brings the turnover clean
  forward.
- **Properties**: searchable/filterable portfolio with cover photos, create/edit/deactivate, units
  (add/edit/deactivate, warning when whole-property and room units overlap), photo upload with
  type/size validation, reorder, cover, captions, delete; detail tabs Overview / Units / Bookings /
  Housekeeping / Maintenance / Inventory / Financial summary.
- **Guests**: search by name/phone/email, profile, edit, WhatsApp link, stay & payment summary,
  bookings, owner-only “remove personal data” (anonymization keeps financial history).
- **Bookings**: list with search, status/source/payment/property/date filters and pagination; create
  (guest picker or new guest, live pricing, capacity and availability check, optional deposit,
  suggested deposit %), edit (locked once finished), confirm / pending / check-in (early-arrival and
  balance warnings) / check-out / no-show / cancel (fee + reason, shows refund owed), payments panel
  (record deposit/balance/payment/refund/adjustments, reverse with reason), audit history, printable
  confirmation, guest message composer (templates → WhatsApp/email hand-off, logged).
- **Calendar**: day (arrivals, departures, in house, blocked, available), week and month timelines by
  unit with status colours, multi-night bars, lanes for overlaps, today highlight and auto-scroll,
  select a range to create a booking or block, block details/removal, property filter, show cancelled.
- **Finances**: overview KPIs with formula notes, transactions ledger (filters, CSV), expenses (record,
  edit, void with reason, receipts, categories, CSV), balances owed / credits owed, print.
- **Housekeeping**: workspace (overdue, today, awaiting inspection, upcoming, completed, next-7-days
  arrivals/departures), filters (property, my tasks, unassigned, person), new task with checklist
  template, task detail (start, complete or submit for inspection, sign-off, send back, reopen,
  cancel, delete manual tasks, reassign, priority, checklist with optimistic ticks, photos with camera
  capture, comments).
- **Maintenance**: list (open first, urgent highlighted, overdue target dates), report with photos
  (caretakers), manager edit/assign/technician/estimate/target date, status progression, resolve with
  notes and actual cost, close, block unit dates, record cost as an expense, attachments.
- **Inventory**: items per property or shared store, opening stock, low-stock banner/filter, movement
  dialog (received, used, returned, adjustment with reason) by permission, history with running
  balance, stock value.

**Tested**: 70 unit tests (adds booking/payment/cancel schema tests), 59 integration tests (adds
`create_booking` atomicity/idempotency/permissions, `unit_conflicts`, `housekeeping_schedule` data
minimization, `bookings_overview` RLS, `finance_summary` incl. reversals/void/excluded categories,
early check-out). Browser walk-through: create property, booking with new guest + M-Pesa deposit,
validation errors, balance payment, early check-in warning, check-in/out, calendar week/month,
housekeeping auto task, caretaker start/tick flow, finances overview/ledger, guest profile, property
financial summary.

**Bugs found and fixed**: M-Pesa validation error attached to a hidden field (blocked booking submit
silently — now shown, plus an "invalid form" toast and a regression test); KPI values truncated;
calendar opened at the 1st instead of today; turnover clean not moved forward on early check-out;
raw amounts in booking history.

**Known limitations / next**: Reports module and live dashboard KPIs (Phase D); notifications and
scheduled reminders (Phase D); template/checklist/category editors in Settings (Phase D); main JS
chunk ~530 kB before gzip (Phase E split); photo upload not exercised in the browser automation (covered
by storage integration tests); early check-out keeps the booked check-out date (charges unchanged), so
occupancy reports count the remaining nights unless dates are edited before check-out.

## Phase D report (2026-10-13)

**Implemented**
- **Reporting engine** (migration 15): `report_property_performance` (night-allocated occupancy, ADR,
  RevPAR inputs, reservation value, collected, expenses per property), `report_monthly` (12-month
  series), `dashboard_today` — all SECURITY INVOKER. Definitions in `docs/REPORTS.md`.
- **Dashboard**: role-aware KPIs (properties, occupied/available tonight, arrivals, departures,
  collected, expenses, estimated operating income, outstanding), 7-day unit timeline, today’s
  arrivals/departures, housekeeping needing attention, overdue payments, urgent/overdue maintenance,
  messages ready to send, 6-month collected-vs-expenses chart, recent transactions, property occupancy
  comparison; first-run empty state.
- **Reports**: Summary (bookings by source/status, cash KPIs, cancellations), Occupancy &
  performance, Monthly (12 months), Expenses by category, Operations (housekeeping completion,
  maintenance costs, inventory consumption) — date-range and property filters, CSV export, print
  layout, formula notes on every section. Charts use the validated reference palette (blue/orange).
- **Notifications & reminders** (migration 16): in-app notifications with bell + unread count;
  `run_reminders()` every 30 min via **pg_cron** (arrivals tomorrow, departures today, overdue
  balances, housekeeping deadlines/overdue, urgent/overdue maintenance, low stock) with per-org
  preferences, role/property-aware recipients and dedupe keys; immediate notifications on task /
  repair assignment and new urgent repairs; run log + “Check now”.
- **Guest messaging**: reminders prepare templated guest messages (check-in instructions, balance due,
  check-out, review request) into an outbox; staff send via WhatsApp hand-off or skip; guests
  without a phone are logged as skipped. No automatic sending without a provider.
- **Settings**: message templates (placeholders, live preview, unknown-token check), housekeeping
  checklists (items, photo-required, ordering, default per task type), expense categories
  (operating-income flag, hide), notification preferences, integrations status.
- **iCal availability sync** (migrations 17–19 + Edge Function `ical-sync`): owner-only feeds; server
  fetch (https only, 15 s timeout, 2 MB cap, sanitized errors that never contain the private URL);
  transactional reconciliation into blocks; conflicts flagged + managers notified, never auto-resolved;
  removed events release dates; imported blocks protected from manual edits; removing a feed releases
  its dates.

**Tested**: 78 unit tests (adds report metrics, booking summary, iCal parser, error sanitizing);
74 integration tests (adds night allocation across months, blocks in availability, pending/cancelled
exclusion, dashboard snapshot, report isolation, reminder recipients/dedupe/preferences/skipped
messages, sweep permissions, assignment notifications, outbox guard, calendar sync create/update/
remove/conflict/errors/permissions/feed removal). Edge Function exercised locally end-to-end (HTTP
feed → 2 blocks; owner token allowed, caretaker refused; sanitized DNS error). pg_cron run observed in
the run log. Browser: dashboard, all report tabs, settings pages, “Check now”, integrations, outbox.

**Fixed during the phase**: feed deletion would have orphaned imported blocks; feed fetch errors
leaked the private feed URL; KPI grid too wide.

**Configuration needed for production**: enable pg_cron (Supabase dashboard → Database → Extensions)
before migrating; deploy the `ical-sync` function and schedule it hourly (snippet in Phase F docs).

## Phase E report (2026-10-13)

**Done**: Playwright suite (`npm run test:e2e`, 13 tests, stable across repeated runs): full 13-step owner
journey, validation failures, caretaker URL blocking, cross-business id tampering, sign-in redirect,
empty states, mobile layout (no horizontal scroll, bottom nav, menu sheet), axe WCAG 2.1 AA audit of
public, main and detail screens/dialogs (fixed: skeletons now `role="status"`). Bundle split into
vendor chunks; charts no longer preloaded (largest chunk 374 kB, lazy). DB security audit (RLS on all
tables, definer functions pin search_path, anon limited to invitation preview, views invoker); no
secrets in source/bundle; npm audit clean. All 19 migrations rebuilt from an empty DB;
`npm run seed:dev` recreates demo data. Totals: 78 unit, 74 integration, 13 e2e.

## Phase F report (2026-10-13)

**Implemented**
- `docs/DEPLOYMENT.md`: Supabase project setup (extensions, auth URLs/email/password policy, SMTP),
  migration procedure and rules, Edge Function deploy + secrets, hosting (env vars, build, Vercel/
  Netlify/Cloudflare), administrator onboarding, go-live verification, backups & recovery (what is and
  isn't covered, own dumps, restore drill), release order and rollback per layer, operating checklist.
- Migration 20: `platform_settings.bootstrap_owner_email` — on an empty production database only that
  confirmed address may create the first business (closes the "first visitor becomes owner" window).
- Scheduler hardening: `ical-sync` no longer accepts the service-role key; the pg_cron job presents a
  dedicated `ICAL_SYNC_SECRET` (Vault + function secret, constant-time compare), users are verified with
  Supabase Auth, gateway JWT check off for this function (`config.toml`, `--no-verify-jwt`).
- `supabase/production/schedule-ical-sync.sql` (Vault + pg_cron + pg_net, idempotent, rotation steps) and
  `supabase/production/verify.sql` (read-only go-live checks).
- Security headers/CSP in one module (`deploy/security-headers.ts`) → `vercel.json`, `public/_headers`
  via `npm run hosting:config`; `netlify.toml`; `npm run preview` serves the build with the same headers.
- `.gitignore` excludes `backups/`; README links the guide and lists every script.

**Tested**
- Bootstrap gate in a rolled-back transaction on an emptied database: no email set → anyone; email set →
  only that user (RPC create succeeds), others refused with the friendly message; afterwards blocked.
- Function auth paths: no credentials 401, forged bearer 401, wrong sync secret 401, owner token with
  unknown feed 403, missing feed_id 400.
- Scheduling chain end to end: the production snippet installed locally, job command fired → Vault →
  pg_net → function (secret accepted) → `sync_calendar_feed` recorded a sanitized error for an
  unreachable https feed. Test job, secrets, feed and pg_net removed afterwards.
- CSP: production build under `npm run preview` with enforced policy — sign-in, dashboard (charts),
  reports, calendar, properties, finances, bookings, messages, integrations: zero violations; a
  deliberate foreign fetch and inline script were blocked (proves enforcement).
- Clean checkout (copy without node_modules/dist/.env.local): `npm ci`, typecheck, lint, 82 unit tests,
  build all pass; README steps (`.env.example` → `.env.local`, `npm run dev`) start the app and sign-in
  works against the local stack.
- Regression: 82 unit, 74 integration and 13 e2e tests pass (the 17-screen axe test now has its own
  4-minute budget after hitting the 60 s default on a slow run); `verify.sql` all ok locally (calendar
  schedule rows expected to flag until configured).

**Configuration needed for production** — see `docs/DEPLOYMENT.md` §2–6: Supabase project, pg_cron +
pg_net, auth URLs + email confirmation + SMTP, `db push`, `bootstrap_owner_email`, `ICAL_SYNC_SECRET` +
function deploy + schedule script, host env vars. Nothing has been deployed to a hosted project.

## Definition of done (master prompt §26)

| Requirement | Status / evidence |
|---|---|
| Authentication works | Sign-in/up, reset, invitations, protected routes — e2e + integration |
| Roles and org isolation enforced | RLS on all tables; 2-org × 4-role integration tests; URL tampering e2e |
| Properties can be managed | Properties/units/photos — owner journey e2e |
| Bookings persist and show on the calendar | e2e steps 4–6 |
| Double bookings prevented | Exclusion constraint; concurrent-insert integration test |
| Payments and refunds consistent | Append-only ledger, reversals; finance integration + unit tests; `FINANCE_MODEL.md` |
| Dashboard from real data | `dashboard_today` RPC; seeded and e2e data |
| Expenses linked to properties | Expense form + reports by property |
| Housekeeping assignable/completable | Turnover generation + completion in e2e |
| Maintenance tracked | Statuses, costs, blocks; integration tests |
| Inventory movements reliable | Movement ledger, no negative stock; integration tests |
| Reports with documented formulas | `docs/REPORTS.md`; report unit + integration tests |
| Usable mobile layouts | Mobile e2e project (no horizontal scroll, bottom nav) |
| Migrations and setup docs | 20 migrations rebuild from empty; README + `DEPLOYMENT.md` |
| Automated tests on critical logic | 82 unit · 74 integration · 13 e2e |
| No secrets in frontend | Only publishable key; bundle scanned; CSP; scheduler doesn't hold service key |
| No core workflow depends on demo data | Clean DB → bootstrap → onboarding; seed is optional and local-only |

**Deliberately not built (documented, not claimed)**: M-Pesa/Daraja verification (payments recorded
manually, never marked verified), automated WhatsApp sending (manual `wa.me` hand-off), Airbnb/Booking.com
APIs (iCal import only). Requirements §24 lists `supabase/seed.sql`; demo data is instead
`scripts/seed-dev.mjs`, which uses the real APIs and refuses non-local URLs.

## Key design decisions

### Tenancy and authorization
- Every business row carries `organization_id`. RLS is enabled on **every** table in `public`.
- Authorization helpers live in a private `app` schema (not exposed by PostgREST), are
  `SECURITY DEFINER`, `STABLE`, with `search_path = ''`:
  - `app.member_role(org)` → the caller's active role in that org (or null).
  - `app.has_perm(org, perm)` → role → permission matrix (see `docs/PERMISSIONS.md`), including the
    per-member `can_view_finances` flag for property managers.
  - `app.can_access_property(org, property)` → owners/finance see all properties; managers and
    housekeeping only properties assigned in `staff_property_assignments`.
- The frontend mirrors the matrix in `src/lib/permissions.ts` **only** to hide UI; the database is the
  enforcement point. A test asserts the two matrices are identical.
- Organization creation: `create_organization()` RPC. Allowed when no organization exists yet
  (first-run bootstrap) or when `platform_settings.allow_self_service_orgs` is true. Default after the
  first org: off — suitable for a single-business deployment.
- Staff onboarding: owner creates an invitation (`organization_invitations`, hashed token, role,
  property scope). The invite link is shared by email/WhatsApp; the invitee signs up / signs in and
  calls `accept_invitation(token)`, which requires the token **and** a matching email. No
  service-role key is needed in the browser.

### Bookings and availability
- Every reservation belongs to a rentable `property_units` row; a property gets a default unit on
  creation (trigger).
- `unit_occupancy` is a single table holding the date ranges of availability-blocking bookings and
  owner/maintenance blocks, protected by
  `EXCLUDE USING gist (unit_id WITH =, during WITH &&)` (btree_gist). Triggers on `bookings` and
  `property_blocks` keep it in sync inside the same transaction, so concurrent conflicting inserts
  fail atomically (SQLSTATE 23P01 → friendly message in the UI).
- Ranges are `[check_in, check_out)` — check-in inclusive, check-out exclusive, so a same-day
  turnover is allowed.
- Blocking statuses: `pending`, `confirmed`, `checked_in`. `inquiry`, `cancelled`, `no_show` and
  `checked_out` free the dates (checked-out stays are in the past; early check-out frees the rest).
- `nights`, `accommodation_amount`, `total_amount` are generated columns. Money is `numeric(12,2)`;
  the frontend does arithmetic in integer cents.
- Status transitions are validated by a trigger (e.g. a cancelled booking cannot be checked in).

### Payments accounting model (see `docs/FINANCE_MODEL.md`)
- `booking_payments` rows are immutable once `completed` except through a reversal row; amounts are
  always positive and the `payment_type` decides the effect.
- Incoming: `deposit`, `balance`, `payment`. Outgoing: `refund`. Non-cash: `adjustment_credit`,
  `adjustment_debit`. Correction: `reversal` (points to the original, at most one per original).
- `bookings.amount_paid`, `amount_refunded`, `adjustment_total` are maintained by trigger;
  `balance_due` is generated:
  `chargeable − (amount_paid − amount_refunded) + adjustment_total`, where `chargeable` is
  `cancellation_fee` for cancelled bookings and `total_amount` otherwise. A negative balance is a
  credit owed to the guest.
- Manual M-Pesa entries are stored as `recorded` / unverified; `verified` is reserved for a trusted
  integration callback.

### Automation
- Turnover cleaning task is created idempotently when a booking is confirmed (and again — no-op —
  at check-out) with a unique `(organization_id, generation_key)`; it is never auto-completed.
- Scheduled reminders/notifications run server-side (pg_cron → SQL function / Edge Function), with a
  dedupe key per reminder. WhatsApp sending is manual hand-off (`wa.me`) unless a provider is
  configured.

## First files (Phase B)

- `supabase/config.toml` (ports, auth redirect URLs, password policy)
- `supabase/migrations/0001_…0012_*.sql` (extensions, helpers, core, properties, bookings, finance,
  operations, inventory, comms, RLS, RPCs, storage)
- `supabase/seed.sql` (local dev only)
- `src/lib/{supabase,permissions,currency,date-utils,phone,errors}.ts`, `src/types/database.ts`
- `src/app/{App,router,providers}.tsx`, `src/components/{ui,layout,feedback}/*`
- `src/features/auth/*`, `src/features/onboarding/*`, `src/features/settings/staff/*`
- `tests/integration/*` (RLS, isolation, double booking, finance), `tests/unit/*`
