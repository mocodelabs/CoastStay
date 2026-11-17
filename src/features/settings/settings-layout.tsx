import { BellRing, Building, CalendarCog, ClipboardList, MessageSquareText, Plug, Receipt, UserRound, Users, CreditCard } from 'lucide-react'
import { NavLink, Outlet } from 'react-router'
import { PageHeader } from '@/components/layout/page-header'
import { useOrg } from '@/features/workspace/workspace-provider'
import type { Permission } from '@/lib/permissions'
import { cn } from '@/lib/utils'

const SECTIONS: Array<{ to: string; label: string; icon: typeof Building; perm?: Permission }> = [
  { to: '/settings/profile', label: 'My profile', icon: UserRound },
  { to: '/settings/business', label: 'Business', icon: Building, perm: 'org.settings' },
  { to: '/settings/bookings', label: 'Bookings & payments', icon: CalendarCog, perm: 'org.settings' },
  { to: '/settings/staff', label: 'Staff & access', icon: Users, perm: 'staff.manage' },
  { to: '/settings/templates', label: 'Message templates', icon: MessageSquareText, perm: 'comms.templates' },
  { to: '/settings/checklists', label: 'Checklists', icon: ClipboardList, perm: 'housekeeping.manage' },
  { to: '/settings/expenses', label: 'Expense categories', icon: Receipt, perm: 'org.settings' },
  { to: '/settings/notifications', label: 'Notifications', icon: BellRing, perm: 'org.settings' },
  { to: '/settings/integrations', label: 'Integrations', icon: Plug, perm: 'integrations.manage' },
  { to: '/settings/billing', label: 'Billing', icon: CreditCard, perm: 'billing.manage' },
]

export function SettingsLayout() {
  const { can } = useOrg()
  const sections = SECTIONS.filter((s) => !s.perm || can(s.perm))
  return (
    <>
      <PageHeader title="Settings" description="Manage your business, team and preferences." />
      <div className="grid gap-6 lg:grid-cols-[13rem_1fr]">
        <nav aria-label="Settings sections" className="-mx-4 flex gap-1 overflow-x-auto px-4 lg:mx-0 lg:flex-col lg:px-0">
          {sections.map((s) => (
            <NavLink
              key={s.to}
              to={s.to}
              className={({ isActive }) =>
                cn(
                  'flex shrink-0 items-center gap-2 rounded-md px-3 py-2 text-sm font-medium',
                  isActive ? 'bg-ocean-50 text-ocean-700' : 'text-charcoal-700 hover:bg-sand-100',
                )
              }
            >
              <s.icon className="size-4" aria-hidden />
              {s.label}
            </NavLink>
          ))}
        </nav>
        <div className="min-w-0">
          <Outlet />
        </div>
      </div>
    </>
  )
}
