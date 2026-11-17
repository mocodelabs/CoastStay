/**
 * UI mirror of app.role_permissions() in the database. The database enforces access through RLS;
 * this module only decides what to show. tests/integration/permissions-matrix.test.ts asserts the
 * two stay identical.
 */

export type Role = 'owner' | 'manager' | 'housekeeping' | 'finance'

export const PERMISSIONS = [
  'org.settings',
  'staff.manage',
  'audit.view',
  'integrations.manage',
  'billing.manage',
  'property.view',
  'property.create',
  'property.edit',
  'block.manage',
  'booking.view',
  'booking.manage',
  'guest.view',
  'guest.manage',
  'finance.view',
  'finance.record',
  'finance.reverse',
  'housekeeping.view',
  'housekeeping.manage',
  'housekeeping.work',
  'maintenance.view',
  'maintenance.report',
  'maintenance.manage',
  'inventory.view',
  'inventory.manage',
  'inventory.consume',
  'inventory.adjust',
  'reports.operational',
  'reports.financial',
  'comms.send',
  'comms.templates',
] as const

export type Permission = (typeof PERMISSIONS)[number]

const MANAGER_FINANCE: Permission[] = ['finance.view', 'finance.record', 'reports.financial']

export const ROLE_PERMISSIONS: Record<Role, Permission[]> = {
  owner: [...PERMISSIONS],
  manager: [
    'property.view',
    'property.edit',
    'block.manage',
    'booking.view',
    'booking.manage',
    'guest.view',
    'guest.manage',
    'housekeeping.view',
    'housekeeping.manage',
    'housekeeping.work',
    'maintenance.view',
    'maintenance.report',
    'maintenance.manage',
    'inventory.view',
    'inventory.manage',
    'inventory.consume',
    'inventory.adjust',
    'reports.operational',
    'comms.send',
  ],
  housekeeping: [
    'property.view',
    'housekeeping.view',
    'housekeeping.work',
    'maintenance.view',
    'maintenance.report',
    'inventory.view',
    'inventory.consume',
  ],
  finance: [
    'property.view',
    'booking.view',
    'guest.view',
    'finance.view',
    'finance.record',
    'finance.reverse',
    'reports.operational',
    'reports.financial',
    'comms.send',
  ],
}

export function permissionsFor(role: Role, canViewFinances = false): Set<Permission> {
  const perms = new Set<Permission>(ROLE_PERMISSIONS[role])
  if (role === 'manager' && canViewFinances) MANAGER_FINANCE.forEach((p) => perms.add(p))
  return perms
}

export const ROLE_LABELS: Record<Role, string> = {
  owner: 'Owner / Administrator',
  manager: 'Property manager',
  housekeeping: 'Caretaker / Housekeeping',
  finance: 'Finance staff',
}

export const ROLE_DESCRIPTIONS: Record<Role, string> = {
  owner: 'Full access to the business, properties, bookings, finances, reports, staff and settings.',
  manager:
    'Manages assigned properties, bookings, guests, housekeeping and maintenance. Financial access can be granted separately.',
  housekeeping:
    'Sees assigned properties and operational tasks, updates task status, completes checklists and uploads inspection photos.',
  finance: 'Views bookings and financial records, records payments and expenses, and runs reports.',
}

/** Roles that see every property; the others only see properties they are assigned to. */
export const FULL_SCOPE_ROLES: readonly Role[] = ['owner', 'finance']
