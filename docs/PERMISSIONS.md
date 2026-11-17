# CoastStay — Roles & Permissions

Enforcement lives in the database: `app.role_permissions()`, `app.has_perm()` and
`app.can_access_property()` are used by Row Level Security policies on every table, by storage
policies, and by guard triggers that restrict which **columns** a role may change. The UI mirror in
`src/lib/permissions.ts` only hides screens and buttons; `tests/integration/tenancy.test.ts` asserts the
two matrices are identical.

## Roles

| Role | Property scope |
|---|---|
| Owner / Administrator | all properties |
| Finance staff | all properties |
| Property manager | assigned properties only |
| Caretaker / Housekeeping | assigned properties only |

Assignments live in `staff_property_assignments`. Setting a property's caretaker also assigns them.
Suspended members lose all access immediately.

## Matrix

| Permission | Owner | Manager | Housekeeping | Finance |
|---|:-:|:-:|:-:|:-:|
| `org.settings` — business profile, booking defaults, categories | ✓ | | | |
| `staff.manage` — invitations, roles, assignments | ✓ | | | |
| `audit.view` — full audit log | ✓ | | | |
| `integrations.manage` — calendar feeds (private URLs) | ✓ | | | |
| `billing.manage` — subscription, plan choice, payment confirmations | ✓ | | | |
| `property.view` | ✓ | ✓ | ✓ | ✓ |
| `property.create` | ✓ | | | |
| `property.edit` — details, units, photos, rates | ✓ | ✓ | | |
| `block.manage` — availability blocks | ✓ | ✓ | | |
| `booking.view` | ✓ | ✓ | | ✓ |
| `booking.manage` | ✓ | ✓ | | |
| `guest.view` | ✓ | ✓ | | ✓ |
| `guest.manage` | ✓ | ✓ | | |
| `finance.view` — payments, expenses | ✓ | flag | | ✓ |
| `finance.record` — record payments/expenses | ✓ | flag | | ✓ |
| `finance.reverse` — reversals | ✓ | | | ✓ |
| `housekeeping.view` | ✓ | ✓ | ✓ | |
| `housekeeping.manage` — create, assign, sign off | ✓ | ✓ | | |
| `housekeeping.work` — progress own tasks, checklists, photos | ✓ | ✓ | ✓ | |
| `maintenance.view` | ✓ | ✓ | ✓ | |
| `maintenance.report` | ✓ | ✓ | ✓ | |
| `maintenance.manage` — assign, cost, resolve, close | ✓ | ✓ | | |
| `inventory.view` | ✓ | ✓ | ✓ | |
| `inventory.manage` — items, receipts, transfers | ✓ | ✓ | | |
| `inventory.consume` — consumption, returns | ✓ | ✓ | ✓ | |
| `inventory.adjust` — stock adjustments | ✓ | ✓ | | |
| `reports.operational` | ✓ | ✓ | | ✓ |
| `reports.financial` | ✓ | flag | | ✓ |
| `comms.send` — prepare guest messages | ✓ | ✓ | | ✓ |
| `comms.templates` — edit templates | ✓ | | | |

**flag** = granted to a property manager only when the owner ticks "Allow access to payments,
expenses and financial reports" (`organization_members.can_view_finances`).

## Additional rules

- **Guests**: managers see guests who have a booking on one of their properties, or guests they
  created. Caretakers never see the guest table.
- **Column guards** (triggers): caretakers can only move their own task's status
  (pending → in progress → awaiting inspection / completed when no inspection is required), tick
  checklist items and claim unassigned tasks; managers sign off inspections. Maintenance reporters
  cannot set costs or assign; assignees can progress status only. Nobody can edit stock quantities,
  booking payment totals, or recorded ledger entries directly.
- **Self-protection**: members cannot change their own role/status; an organization always keeps at
  least one active owner.
- **Shared records**: business-wide expenses (no property) are visible only to full-scope roles.
  Shared stock (no property) is visible to everyone with inventory access but created/edited only by
  full-scope roles.
- **Storage** paths are `<organization_id>/<entity_id>/<file>`; policies check the same permissions
  as the owning table. All buckets are private except `branding` (logos).

## Subscriptions (migration 21)

- Every member can see whether the business is on a trial, active or expired (`subscription_status`),
  which drives the banner. Only owners (`billing.manage`) see payment requests and can submit one.
- When the subscription has expired, a trigger on every operational table (bookings, payments, guests,
  properties, tasks, stock, templates, settings…) rejects inserts, updates and deletes made by signed-in
  users with the hint `subscription_inactive`. Reads are unaffected; membership, invitations and staff
  assignments stay editable; system jobs (reminders, calendar sync) and business deletion are not blocked.
- Platform administrators (`public.platform_admins`, managed with SQL) are a separate, cross-business
  role: they can list every business's subscription and approve or reject payment confirmations, and
  nothing else. They gain no access to any business's records.
