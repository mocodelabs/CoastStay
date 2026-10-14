# CoastStay — Master Requirements (as supplied by the client, 2026-10-13)

Condensed faithfully from the original master prompt; section numbers match the original.

## 1–2. Role and objectives
Build **CoastStay**, a production-ready, lightweight PMS for a client with short-stay Airbnb/holiday
rentals on the Kenyan Coast. Functional, secure, responsive, maintainable; no static prototype — every
feature has working forms, persistence, validation, loading states, error handling and access control.
Work incrementally; reuse working code.

Owner must be able to: manage multiple properties; record/manage reservations; see occupancy and
availability on a calendar; maintain guests; record deposits, payments, balances, refunds; track
revenue and operating expenses; assign housekeeping and maintenance tasks; manage supplies with
low-stock alerts; send/prepare guest messages; monitor performance via reports; manage staff via roles.

Defaults: KES, Africa/Nairobi, DD/MM/YYYY, en-KE, English; responsive desktop/tablet/mobile. Product
name CoastStay, with configurable business name, logo, contact info and branding.

## 3. Stack
React + Vite, TypeScript strict, Tailwind, shadcn/ui or equivalent accessible primitives, Supabase
Postgres/Auth/RLS/Storage, React Router, TanStack Query, React Hook Form + Zod, Recharts, date-fns,
Lucide. Current stable versions. Separate modules for queries, business logic, validation, UI. Never
expose service-role keys or secrets in frontend code.

## 4. Design
Premium, modern coastal hospitality. Palette: deep ocean teal (primary/navigation), warm sand (subtle
backgrounds), off-white (content), charcoal (text), soft blue (upcoming), amber (pending), red
(overdue/urgent), muted green (completed/paid). Desktop sidebar; collapsible on smaller screens;
mobile bottom nav or menu; consistent typography/spacing; property cards with photos and location;
compact KPI cards; useful empty states and skeletons; toasts; confirmation dialogs for destructive
actions; accessible forms, keyboard navigation, readable contrast; no unnecessary animation, big
gradients or clutter. Build the shell and design system first.

## 5. Navigation
Dashboard, Properties, Bookings, Calendar, Guests, Finances, Housekeeping, Maintenance, Inventory,
Reports, Settings — filtered by role.

## 6. Auth & permissions
Supabase Auth: login, logout, password reset, protected routes, profile, role-based nav, secure
sessions, invitation/admin-managed onboarding. Roles: **Owner/Administrator** (everything);
**Property Manager** (assigned properties, bookings, guests, housekeeping, maintenance; finance access
configurable); **Caretaker/Housekeeping** (assigned properties and tasks, statuses, checklists,
inspection photos; no financial reports or unrelated guest info); **Finance Staff** (permitted bookings
and finances, record payments/expenses, reports; no user admin unless granted). Permission matrix
enforced in database policies. Every record belongs to an organization; all queries respect org and
property scope.

## 7. Database
SQL migrations with FKs, indexes, constraints, RLS. UUID PKs, timestamps. Tables: organizations,
profiles, organization_members (unique org+user), properties, property_units (default unit per
property; every reservation tied to a unit), property_photos, guests, bookings (sources Airbnb,
Booking.com, Direct, WhatsApp, Phone, Other; statuses Inquiry, Pending, Confirmed, Checked In, Checked
Out, Cancelled, No Show; cancelled bookings never block availability; exact numeric money; database
protection against overlapping reservations per unit via exclusion constraint/GiST or equivalent
concurrent-safe approach; check-in inclusive, check-out exclusive), booking_payments (deposits,
balances, refunds, adjustments; history preserved; no arbitrary edits of finalized transactions —
reversals/adjustments), expenses (categories utilities, internet, cleaning, laundry, maintenance,
supplies, staff, platform fees, transport, other), housekeeping_tasks, housekeeping_checklist_items,
maintenance_requests, inventory_items, inventory_movements (receipts, consumption, adjustments,
returns), property_blocks (no overlap with blocks or active bookings), notifications, audit_logs
(booking, financial and permission changes). Plus supporting tables for org settings, staff-property
assignments, recurring task templates, communication logs. Indexes on org, property, unit, guest,
dates, statuses, transaction dates. Business rules validated server-side.

## 8. Dashboard
KPIs from real data: total properties, occupied units today, available units today, arrivals today,
departures today, revenue collected this month, operating expenses this month, estimated operating
income, outstanding balances. Plus 7-day booking preview, today's arrivals/departures, housekeeping
needing attention, overdue payments, urgent maintenance, recent transactions, monthly revenue vs
expenses chart, property performance comparison. Explicit definitions (reservation value vs payments
received vs refunds vs expenses vs estimated income). First-run empty state with "add first property".

## 9. Properties
Searchable/filterable portfolio; create/view/edit/deactivate; photo upload and reorder (size/type
validation, storage paths, secure policies); amenities, capacity, units, rates, cleaning fees;
caretakers/managers; check-in/out instructions; upcoming reservations and maintenance; occupancy and
performance. Detail tabs: Overview, Units, Bookings, Housekeeping, Maintenance, Inventory, Financial
Summary.

## 10. Bookings
List and detail; create/edit; search by guest, reference, property; filters for dates, source,
status, payment status; manual bookings; inquiry→confirmation; cancellation; check-in/out; guest counts
and requests; deposit/balance tracking; printable confirmation; history/audit. Auto-calc nights,
accommodation, fees/discounts, total, successful payments, refunds, outstanding balance. Validate dates,
capacity, availability, pricing, financial inputs. Cancellation preserves history; refunds separate.

## 11. Calendar
Day/week/month; multi-day bookings; filter by property/unit; distinguish confirmed, inquiries, blocks,
cancelled; show check-in/out; open booking on select; create booking from a date range; create
maintenance/owner blocks; arrivals/departures; prevent conflicts; mobile-friendly. Drag-and-drop (if
any) validated before saving.

## 12. Guests
List, profile, history; search; edit; previous/upcoming bookings; payment summaries; preferences/notes;
WhatsApp link; booking-specific message templates. No cross-org exposure; caretakers see only what
tasks require.

## 13. Finances
Sections: income/payments, expenses, outstanding balances, refunds/adjustments, property performance,
monthly summaries. Methods: M-Pesa, bank transfer, cash, card/platform payout, other. Record reference,
date, amount, type, recording user. Manual M-Pesa recording; never claim verification without a
trusted integration. Documented balance model distinguishing refunds from reversals, no
double-counting. Date/property/category filters, printable summaries, CSV, receipt uploads, payment
histories. Never silently delete financial transactions. Document what operating income includes; not
"profit".

## 14. Housekeeping
Workspace: today's cleans, upcoming departures, assigned staff, overdue, inspection-required,
completed. Automatic, idempotent cleaning task on qualifying checkout (unique generation key).
Configurable checklist (linen, bedrooms, bathrooms, kitchen, bins, toiletries, drinking water, towels,
Wi-Fi test, AC/appliances, keys/access, damages, inspection photos). Reassignment, comments,
priorities, completion timestamps, manager sign-off. Never auto-complete on checkout time.

## 15. Maintenance
Create, assign, track, resolve. Statuses Reported, Assigned, In Progress, Waiting for Parts, Resolved,
Closed. Priorities Low, Normal, High, Urgent. Images, technician details, estimates, actual cost,
resolution notes. Overdue/urgent on dashboard. Authorized users can create an availability block.

## 16. Inventory
Items, property-specific or shared stock, quantity, unit of measure, minimum threshold, receipts and
consumption, movement history, low-stock alerts, adjustment permissions, optional cost reporting.
Stock from movements or transaction-safe maintained balance with reconciliation. No invalid negative
stock.

## 17. Communication & reminders
Editable templates: booking confirmation, deposit received, balance due, directions, check-in
instructions, Wi-Fi, check-out reminder, review request, cancellation. Placeholders such as
{{guest_name}}, {{property_name}}, {{check_in_date}}, {{check_out_date}}, {{booking_reference}},
{{balance_due}}, {{check_in_instructions}}. WhatsApp button with encoded prefilled text. Normalize
Kenyan numbers to +254, validate, allow correction. In-app notifications for check-ins, departures,
overdue balances, housekeeping deadlines, maintenance, low stock. Server-side scheduled reminders (not
browser-dependent), logged attempts/failures, no duplicates. Automated WhatsApp only via an authorized
provider — optional; manual messaging otherwise.

## 18. Reports
Date-range and property filters: booking summary, revenue collected, reservation value, outstanding
balances, expenses by category, estimated operating income, occupancy rate, ADR, RevPAR (per unit-night),
cancellation summary, property performance, housekeeping completion, maintenance costs, inventory
consumption. Document every formula (occupancy = occupied unit-nights / available unit-nights × 100,
excluding blocked nights where appropriate; ADR = accommodation revenue / occupied unit-nights; RevPAR =
accommodation revenue / available unit-nights). Avoid double-counting stays across months — allocate
per night consistently. CSV and print-friendly pages.

## 19. Settings
Business name/branding, currency/time zone, default check-in/out times, booking defaults, payment
methods, expense categories, checklist templates, staff invitations and roles, property assignments,
notification preferences, communication templates, integration status with setup instructions.

## 20. Integrations
No assumed Airbnb API. MVP: manual entry + integration layer for calendar feeds. iCal (if built):
authorized configuration, backend/worker fetching only, private URLs hidden, safe parsing, duplicate
detection by UID/fingerprint, sync status/errors, imported events treated as external availability
events until the owner confirms a workflow, never as payments. M-Pesa as a separate optional backend
integration with verified callbacks, authentication, idempotency, reconciliation.

## 21. Security
RLS on every business table, org isolation, property-level staff permissions, secure uploads, Zod,
server-side authorization for privileged ops, protection of booking/payment changes, audit trails,
safe errors, no hardcoded secrets or service keys in frontend, retention/deletion workflows, minimal
guest data. Test with ≥2 orgs and multiple roles; changing IDs in URLs/API must not leak data.

## 22. Reliability
Every async screen: loading, empty, error, retry, success, validation errors, disabled while saving.
No duplicate submissions; graceful network failures; transactions/secure functions for multi-record
financial/booking operations; retry-safe booking creation, payments, cancellation, task generation.

## 23. Tests
Unit: nights, totals, discounts/fees, balances, refunds, occupancy, report date boundaries, phone
normalization, template rendering. Integration: booking creation, double-booking prevention, partial
payments, cancellation/refunds, housekeeping generation, inventory movements, maintenance assignment,
org isolation, role permissions. E2E owner journey: sign in → property → unit → guest → reservation →
deposit → calendar → remaining payment → check in → check out → housekeeping → expense → monthly
report. Also mobile layouts, empty states, validation failures, unauthorized access. Dedicated test
environment; never destructive tests on production.

## 24–25. Structure and phases
src/{app, components/{ui,layout,forms,tables,charts,feedback}, features/*, hooks, lib, schemas,
services, types, test}, supabase/{migrations, seed.sql, functions}, tests/{unit,integration,e2e}.
Phases: A inspect/plan → B foundation → C core operations → D reporting & communication → E QA → F
deployment prep. Report at the end of every phase: implemented, tested, remaining, configuration needed.

## 26. Definition of done
Auth works; roles and org isolation enforced; properties managed; bookings persist and show on the
calendar; double bookings prevented; payments/refunds consistent; dashboard from real data; expenses
linked to properties; housekeeping assignable/completable; maintenance tracked; inventory movements
reliable; reports with documented formulas; usable mobile layouts; migrations and setup docs; automated
tests on critical logic; no secrets in frontend; no core workflow depending on demo data.

## 27. Start
Inspect and summarize; produce plan, relationship overview, risks, first files; then implement module
by module with checks. Choose simple, secure, documented defaults for ambiguities. Don't invent
external API capabilities.
