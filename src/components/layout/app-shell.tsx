import { Dialog as DialogPrimitive } from 'radix-ui'
import { Check, ChevronsLeft, ChevronsRight, ChevronsUpDown, LogOut, Menu, MoreHorizontal, UserRound } from 'lucide-react'
import { Suspense, useState } from 'react'
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router'
import { Button } from '@/components/ui/button'
import { SheetContent } from '@/components/ui/dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/menu'
import { Avatar } from '@/components/ui/primitives'
import { useAuth } from '@/features/auth/auth-provider'
import { useOrg } from '@/features/workspace/workspace-provider'
import { ROLE_LABELS } from '@/lib/permissions'
import { cn } from '@/lib/utils'
import { BrandMark } from './brand'
import { mobileNav, visibleNav, type NavItem } from './nav-config'
import { NotificationBell } from '@/features/notifications/notification-bell'
import { PageSkeleton } from './page-skeleton'

const COLLAPSE_KEY = 'coaststay.sidebarCollapsed'

function NavLinks({ items, collapsed = false, onNavigate }: { items: NavItem[]; collapsed?: boolean; onNavigate?: () => void }) {
  return (
    <nav aria-label="Main" className="flex flex-col gap-0.5">
      {items.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          end={item.to === '/'}
          onClick={onNavigate}
          title={collapsed ? item.label : undefined}
          className={({ isActive }) =>
            cn(
              'group flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors',
              collapsed && 'justify-center px-0',
              isActive ? 'bg-white/12 text-white' : 'text-ocean-100 hover:bg-white/8 hover:text-white',
            )
          }
        >
          <item.icon className="size-[1.15rem] shrink-0" aria-hidden />
          <span className={cn(collapsed && 'sr-only')}>{item.label}</span>
        </NavLink>
      ))}
    </nav>
  )
}

function OrgSwitcher({ collapsed }: { collapsed?: boolean }) {
  const { org, memberships, switchOrg, role } = useOrg()
  const label = (
    <span className="flex min-w-0 items-center gap-2.5">
      {org.logo_url ? (
        <img src={org.logo_url} alt="" className="size-8 shrink-0 rounded-md bg-white object-contain" />
      ) : (
        <BrandMark />
      )}
      {!collapsed && (
        <span className="min-w-0 text-left">
          <span className="block truncate text-sm font-semibold text-white">{org.name}</span>
          <span className="block truncate text-xs text-ocean-200">{ROLE_LABELS[role]}</span>
        </span>
      )}
    </span>
  )
  if (memberships.length < 2) return <div className={cn('px-1', collapsed && 'flex justify-center')}>{label}</div>
  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="flex w-full items-center justify-between gap-2 rounded-md px-1 py-1 hover:bg-white/8">
        {label}
        {!collapsed && <ChevronsUpDown className="size-4 text-ocean-200" />}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-64">
        <DropdownMenuLabel>Switch business</DropdownMenuLabel>
        {memberships.map((m) => (
          <DropdownMenuItem key={m.organization.id} onSelect={() => switchOrg(m.organization.id)}>
            <span className="flex-1 truncate">{m.organization.name}</span>
            {m.organization.id === org.id && <Check />}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function UserMenu({ compact }: { compact?: boolean }) {
  const { user, signOut } = useAuth()
  const navigate = useNavigate()
  const name = (user?.user_metadata?.full_name as string | undefined) || user?.email || 'Account'
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className={cn('flex items-center gap-2.5 rounded-md p-1.5 text-left', compact ? 'hover:bg-sand-100' : 'w-full hover:bg-white/8')}
        aria-label="Account menu"
      >
        <Avatar name={name} />
        {!compact && (
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-medium text-white">{name}</span>
            <span className="block truncate text-xs text-ocean-200">{user?.email}</span>
          </span>
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent align={compact ? 'end' : 'start'} side={compact ? 'bottom' : 'top'}>
        <DropdownMenuLabel className="truncate">{user?.email}</DropdownMenuLabel>
        <DropdownMenuItem onSelect={() => navigate('/settings/profile')}>
          <UserRound /> My profile
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onSelect={async () => {
            await signOut()
            navigate('/login', { replace: true })
          }}
        >
          <LogOut /> Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

export function AppShell() {
  const { canAny } = useOrg()
  const items = visibleNav(canAny)
  const bottomItems = mobileNav(items)
  const location = useLocation()
  const [mobileOpen, setMobileOpen] = useState(false)
  const [collapsed, setCollapsed] = useState(() => {
    try {
      return localStorage.getItem(COLLAPSE_KEY) === '1'
    } catch {
      return false
    }
  })

  function toggleCollapsed() {
    setCollapsed((c) => {
      try {
        localStorage.setItem(COLLAPSE_KEY, c ? '0' : '1')
      } catch {
        /* ignore */
      }
      return !c
    })
  }

  const current = items.find((i) => (i.to === '/' ? location.pathname === '/' : location.pathname.startsWith(i.to)))

  return (
    <div className="min-h-dvh bg-background">
      <a href="#main" className="sr-only z-[60] rounded-md bg-white px-3 py-2 focus:not-sr-only focus:fixed focus:top-2 focus:left-2">
        Skip to content
      </a>

      {/* Desktop sidebar */}
      <aside
        className={cn(
          'no-print fixed inset-y-0 left-0 z-30 hidden flex-col bg-ocean-800 transition-[width] lg:flex',
          collapsed ? 'w-[4.5rem]' : 'w-64',
        )}
      >
        <div className={cn('flex h-16 items-center gap-1 px-4', collapsed && 'flex-col justify-center gap-0 px-2')}>
          <div className="min-w-0 flex-1">
            <OrgSwitcher collapsed={collapsed} />
          </div>
          {!collapsed && <NotificationBell tone="dark" />}
        </div>
        {collapsed && (
          <div className="flex justify-center pb-1">
            <NotificationBell tone="dark" />
          </div>
        )}
        <div className="flex-1 overflow-y-auto px-3 py-2">
          <NavLinks items={items} collapsed={collapsed} />
        </div>
        <div className="space-y-1 border-t border-white/10 p-3">
          {!collapsed && <UserMenu />}
          <button
            type="button"
            onClick={toggleCollapsed}
            className={cn(
              'flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm text-ocean-200 hover:bg-white/8 hover:text-white',
              collapsed && 'justify-center px-0',
            )}
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            {collapsed ? <ChevronsRight className="size-4" /> : <ChevronsLeft className="size-4" />}
            {!collapsed && 'Collapse'}
          </button>
        </div>
      </aside>

      {/* Mobile / tablet top bar */}
      <header className="no-print sticky top-0 z-20 flex h-14 items-center gap-2 border-b bg-surface/95 px-3 backdrop-blur lg:hidden">
        <DialogPrimitive.Root open={mobileOpen} onOpenChange={setMobileOpen}>
          <DialogPrimitive.Trigger asChild>
            <Button variant="ghost" size="icon" aria-label="Open menu">
              <Menu className="size-5" />
            </Button>
          </DialogPrimitive.Trigger>
          <SheetContent title="Navigation" className="bg-ocean-800">
            <div className="flex h-16 items-center px-4">
              <OrgSwitcher />
            </div>
            <div className="flex-1 overflow-y-auto px-3 py-2">
              <NavLinks items={items} onNavigate={() => setMobileOpen(false)} />
            </div>
            <div className="border-t border-white/10 p-3">
              <UserMenu />
            </div>
          </SheetContent>
        </DialogPrimitive.Root>
        <Link to="/" className="flex min-w-0 items-center gap-2">
          <BrandMark className="size-7" />
          <span className="truncate font-semibold">{current?.label ?? 'CoastStay'}</span>
        </Link>
        <div className="ml-auto flex items-center gap-1">
          <NotificationBell />
          <UserMenu compact />
        </div>
      </header>

      <div className={cn('transition-[padding]', collapsed ? 'lg:pl-[4.5rem]' : 'lg:pl-64')}>
        <main id="main" className="mx-auto w-full max-w-7xl px-4 pt-5 pb-28 sm:px-6 lg:px-8 lg:pt-8 lg:pb-12">
          <Suspense fallback={<PageSkeleton />}>
            <Outlet />
          </Suspense>
        </main>
      </div>

      {/* Phone bottom navigation */}
      <nav
        aria-label="Quick navigation"
        className="no-print safe-bottom fixed inset-x-0 bottom-0 z-20 grid border-t bg-surface md:hidden"
        style={{ gridTemplateColumns: `repeat(${bottomItems.length + 1}, minmax(0, 1fr))` }}
      >
        {bottomItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.to === '/'}
            className={({ isActive }) =>
              cn(
                'flex flex-col items-center gap-0.5 py-2 text-[0.7rem] font-medium',
                isActive ? 'text-primary' : 'text-muted-foreground',
              )
            }
          >
            <item.icon className="size-5" aria-hidden />
            {item.label}
          </NavLink>
        ))}
        <button
          type="button"
          onClick={() => setMobileOpen(true)}
          className="flex flex-col items-center gap-0.5 py-2 text-[0.7rem] font-medium text-muted-foreground"
        >
          <MoreHorizontal className="size-5" aria-hidden />
          More
        </button>
      </nav>
    </div>
  )
}
