import { AlertTriangle, Bell, BedDouble, CheckCheck, Package, Sparkles, Wallet, Wrench } from 'lucide-react'
import { Popover } from 'radix-ui'
import { useState } from 'react'
import { useNavigate } from 'react-router'
import { Button } from '@/components/ui/button'
import { useOrg } from '@/features/workspace/workspace-provider'
import { formatDateTime } from '@/lib/date-utils'
import { cn } from '@/lib/utils'
import { notificationLink, useMarkRead, useNotifications, type Notification } from './api'

const ICONS: Record<string, typeof Bell> = {
  upcoming_check_in: BedDouble,
  upcoming_departure: BedDouble,
  overdue_balance: Wallet,
  housekeeping_deadline: Sparkles,
  task_assigned: Sparkles,
  maintenance: Wrench,
  low_stock: Package,
  system: AlertTriangle,
}

export function NotificationBell({ tone = 'light' }: { tone?: 'light' | 'dark' }) {
  const { timezone } = useOrg()
  const navigate = useNavigate()
  const list = useNotifications()
  const markRead = useMarkRead()
  const [open, setOpen] = useState(false)
  const unread = (list.data ?? []).filter((n) => !n.read_at).length

  function openItem(n: Notification) {
    if (!n.read_at) markRead.mutate([n.id])
    const to = notificationLink(n)
    setOpen(false)
    if (to) navigate(to)
  }

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger asChild>
        <Button
          variant="ghost"
          size="icon"
          aria-label={unread ? `Notifications, ${unread} unread` : 'Notifications'}
          className={cn('relative', tone === 'dark' && 'text-ocean-100 hover:bg-white/8 hover:text-white')}
        >
          <Bell className="size-5" />
          {unread > 0 && (
            <span className="absolute top-1 right-1 flex min-w-4 items-center justify-center rounded-full bg-danger px-1 text-[0.625rem] leading-4 font-semibold text-white">
              {unread > 9 ? '9+' : unread}
            </span>
          )}
        </Button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          align="end"
          sideOffset={8}
          className="z-50 w-[min(24rem,calc(100vw-1.5rem))] overflow-hidden rounded-lg border bg-surface shadow-lg"
        >
          <div className="flex items-center justify-between border-b px-4 py-3">
            <h2 className="text-sm font-semibold">Notifications</h2>
            {unread > 0 && (
              <Button variant="link" size="sm" onClick={() => markRead.mutate('all')}>
                <CheckCheck /> Mark all read
              </Button>
            )}
          </div>
          <div className="max-h-[70vh] overflow-y-auto">
            {list.isPending ? (
              <p className="p-4 text-sm text-muted-foreground">Loading…</p>
            ) : list.isError ? (
              <p className="p-4 text-sm text-danger">Couldn’t load notifications.</p>
            ) : (list.data?.length ?? 0) === 0 ? (
              <p className="p-6 text-center text-sm text-muted-foreground">You’re all caught up.</p>
            ) : (
              <ul className="divide-y">
                {list.data!.map((n) => {
                  const Icon = ICONS[n.notification_type] ?? Bell
                  return (
                    <li key={n.id}>
                      <button
                        type="button"
                        onClick={() => openItem(n)}
                        className={cn('flex w-full gap-3 px-4 py-3 text-left hover:bg-sand-50', !n.read_at && 'bg-ocean-50/50')}
                      >
                        <Icon className="mt-0.5 size-4 shrink-0 text-ocean-600" aria-hidden />
                        <span className="min-w-0 flex-1">
                          <span className={cn('block text-sm', !n.read_at && 'font-semibold')}>{n.title}</span>
                          {n.message && <span className="block text-xs text-muted-foreground">{n.message}</span>}
                          <span className="block text-xs text-muted-foreground">{formatDateTime(n.created_at, timezone)}</span>
                        </span>
                        {!n.read_at && <span className="mt-1.5 size-2 shrink-0 rounded-full bg-primary" aria-label="Unread" />}
                      </button>
                    </li>
                  )
                })}
              </ul>
            )}
          </div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  )
}
