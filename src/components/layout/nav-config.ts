import {
  BarChart3,
  BedDouble,
  Building2,
  CalendarDays,
  LayoutDashboard,
  Package,
  Settings,
  Sparkles,
  Users,
  Wallet,
  Wrench,
  type LucideIcon,
} from 'lucide-react'
import type { Permission } from '@/lib/permissions'

export interface NavItem {
  to: string
  label: string
  icon: LucideIcon
  /** Shown when the user has any of these permissions; empty = everyone. */
  anyOf: Permission[]
  /** Candidate for the mobile bottom bar, in priority order. */
  mobilePriority?: number
}

export const NAV_ITEMS: NavItem[] = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard, anyOf: [], mobilePriority: 1 },
  { to: '/properties', label: 'Properties', icon: Building2, anyOf: ['property.view'] },
  { to: '/bookings', label: 'Bookings', icon: BedDouble, anyOf: ['booking.view'], mobilePriority: 2 },
  { to: '/calendar', label: 'Calendar', icon: CalendarDays, anyOf: ['booking.view'], mobilePriority: 3 },
  { to: '/guests', label: 'Guests', icon: Users, anyOf: ['guest.view'] },
  { to: '/finances', label: 'Finances', icon: Wallet, anyOf: ['finance.view'], mobilePriority: 5 },
  { to: '/housekeeping', label: 'Housekeeping', icon: Sparkles, anyOf: ['housekeeping.view'], mobilePriority: 4 },
  { to: '/maintenance', label: 'Maintenance', icon: Wrench, anyOf: ['maintenance.view'], mobilePriority: 6 },
  { to: '/inventory', label: 'Inventory', icon: Package, anyOf: ['inventory.view'] },
  { to: '/reports', label: 'Reports', icon: BarChart3, anyOf: ['reports.operational', 'reports.financial'] },
  { to: '/settings', label: 'Settings', icon: Settings, anyOf: [] },
]

export function visibleNav(canAny: (...p: Permission[]) => boolean): NavItem[] {
  return NAV_ITEMS.filter((i) => i.anyOf.length === 0 || canAny(...i.anyOf))
}

/** Up to four primary destinations for the phone bottom bar (plus a "More" button). */
export function mobileNav(items: NavItem[]): NavItem[] {
  return items
    .filter((i) => i.mobilePriority !== undefined)
    .sort((a, b) => (a.mobilePriority ?? 99) - (b.mobilePriority ?? 99))
    .slice(0, 4)
}
