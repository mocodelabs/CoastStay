import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { CalendarSync, CheckCircle2, CircleDashed, MessageCircle, Play, Smartphone } from 'lucide-react'
import { toast } from 'sonner'
import { ListSkeleton, QueryState } from '@/components/feedback/states'
import { Button } from '@/components/ui/button'
import { Badge, Card, CardContent, CardDescription, CardHeader, CardTitle, Switch } from '@/components/ui/primitives'
import { useOrg, workspaceKeys } from '@/features/workspace/workspace-provider'
import { formatDateTime } from '@/lib/date-utils'
import { toUserMessage } from '@/lib/errors'
import { supabase } from '@/lib/supabase'
import { CalendarFeeds } from './calendar-feeds'

const PREFS: Array<{ key: string; label: string; help: string }> = [
  { key: 'upcoming_check_in', label: 'Arrivals tomorrow', help: 'Owners, managers and caretakers of the property. Also prepares check-in instructions for the guest.' },
  { key: 'upcoming_departure', label: 'Departures today', help: 'Heads-up for the turnover clean. Also prepares the check-out reminder.' },
  { key: 'overdue_balance', label: 'Overdue balances', help: 'Finance staff and owners, daily until paid. Prepares one balance reminder for the guest.' },
  { key: 'housekeeping_deadline', label: 'Housekeeping deadlines & assignments', help: 'Assignee when a task is due within 12 hours or assigned; managers when overdue.' },
  { key: 'maintenance', label: 'Maintenance', help: 'New urgent/high requests immediately; open urgent or overdue repairs daily.' },
  { key: 'low_stock', label: 'Low stock', help: 'At most weekly per item while it stays at or below its alert level.' },
]

function useReminderRuns() {
  const { orgId } = useOrg()
  return useQuery({
    queryKey: ['reminder-runs', orgId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('reminder_runs')
        .select('*')
        .eq('organization_id', orgId)
        .order('started_at', { ascending: false })
        .limit(5)
      if (error) throw error
      return data
    },
  })
}

export function AutomationSettings() {
  const { orgId, settings, timezone } = useOrg()
  const qc = useQueryClient()
  const runs = useReminderRuns()
  const prefs = (settings?.notification_preferences ?? {}) as Record<string, boolean>

  const savePref = useMutation({
    mutationFn: async (patch: Record<string, boolean>) => {
      const { error } = await supabase
        .from('organization_settings')
        .update({ notification_preferences: { ...prefs, ...patch } })
        .eq('organization_id', orgId)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: workspaceKeys.settings(orgId) }),
    onError: (e) => toast.error(toUserMessage(e)),
  })

  const runNow = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.rpc('run_reminders', { target_org: orgId })
      if (error) throw error
      return data[0]
    },
    onSuccess: (r) => {
      toast.success(`Reminders checked: ${r?.notifications ?? 0} notifications, ${r?.messages ?? 0} guest messages prepared.`)
      void qc.invalidateQueries({ queryKey: ['reminder-runs', orgId] })
      void qc.invalidateQueries({ queryKey: ['notifications'] })
      void qc.invalidateQueries({ queryKey: ['comms', orgId] })
    },
    onError: (e) => toast.error(toUserMessage(e)),
  })

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Notifications & reminders</CardTitle>
          <CardDescription>
            The server checks every 30 minutes — no browser needs to be open. Each reminder is sent at most once (or once a day for repeating
            ones). Guest messages are prepared for staff to send from the dashboard or the messages outbox.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ul className="divide-y rounded-md border">
            {PREFS.map((p) => (
              <li key={p.key} className="flex items-start justify-between gap-4 p-3">
                <div>
                  <p className="text-sm font-medium">{p.label}</p>
                  <p className="text-xs text-muted-foreground">{p.help}</p>
                </div>
                <Switch
                  checked={prefs[p.key] !== false}
                  disabled={savePref.isPending}
                  onCheckedChange={(v) => savePref.mutate({ [p.key]: v })}
                  aria-label={p.label}
                />
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="sm:flex-row sm:items-center sm:justify-between">
          <div>
            <CardTitle>Reminder runs</CardTitle>
            <CardDescription>Recent checks for this business.</CardDescription>
          </div>
          <Button variant="outline" loading={runNow.isPending} onClick={() => runNow.mutate()}>
            <Play /> Check now
          </Button>
        </CardHeader>
        <CardContent>
          <QueryState query={runs} loading={<ListSkeleton rows={2} />} empty={<p className="text-sm text-muted-foreground">No runs yet — the first one happens within 30 minutes.</p>}>
            {(rows) => (
              <ul className="divide-y text-sm">
                {rows.map((r) => (
                  <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                    <span>{formatDateTime(r.started_at, timezone)}</span>
                    <span className="text-muted-foreground">
                      {r.notifications_created} notifications · {r.messages_prepared} messages
                    </span>
                    <Badge tone={r.status === 'ok' ? 'success' : r.status === 'error' ? 'danger' : 'warning'}>{r.status}</Badge>
                  </li>
                ))}
              </ul>
            )}
          </QueryState>
        </CardContent>
      </Card>
    </div>
  )
}

function IntegrationRow({
  icon: Icon,
  name,
  status,
  children,
}: {
  icon: typeof MessageCircle
  name: string
  status: 'active' | 'manual' | 'not_configured'
  children: React.ReactNode
}) {
  const badge =
    status === 'active' ? (
      <Badge tone="success">
        <CheckCircle2 className="size-3" /> Active
      </Badge>
    ) : status === 'manual' ? (
      <Badge tone="info">Manual mode</Badge>
    ) : (
      <Badge tone="muted">
        <CircleDashed className="size-3" /> Not configured
      </Badge>
    )
  return (
    <li className="space-y-2 p-4">
      <div className="flex flex-wrap items-center gap-2">
        <Icon className="size-4 text-primary" aria-hidden />
        <p className="font-medium">{name}</p>
        {badge}
      </div>
      <div className="space-y-1.5 text-sm text-muted-foreground">{children}</div>
    </li>
  )
}

export function IntegrationSettings() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Integrations</CardTitle>
        <CardDescription>CoastStay works fully without these. Each optional integration runs on the server and needs credentials from you.</CardDescription>
      </CardHeader>
      <CardContent>
        <ul className="divide-y rounded-md border">
          <IntegrationRow icon={MessageCircle} name="WhatsApp messaging" status="manual">
            <p>
              Messages open in WhatsApp on your phone or computer for you to send (wa.me links). Automatic sending requires a WhatsApp Business API
              provider (e.g. Meta Cloud API or an approved Kenyan provider) with approved message templates.
            </p>
            <p>Setup: provide the provider account and API credentials to your developer; they are stored as server secrets, never in the app.</p>
          </IntegrationRow>
          <IntegrationRow icon={Smartphone} name="M-Pesa payment confirmation" status="not_configured">
            <p>
              Payments are recorded manually with the M-Pesa confirmation code and marked “Recorded”, not “Verified”. Automatic verification needs a
              Safaricom Daraja (C2B/STK) account, a callback URL on the server and reconciliation of codes.
            </p>
          </IntegrationRow>
          <IntegrationRow icon={CalendarSync} name="Airbnb / Booking.com calendar sync (iCal)" status="manual">
            <p>
              Import each platform’s calendar so its reservations block the same dates here and prevent double bookings. Imported stays become
              blocked dates (not bookings or payments); conflicts are flagged, never resolved automatically. Platform bookings can still be entered
              manually with their guest and payment details.
            </p>
            <p>Feeds sync when you press “Sync now”, and hourly once the scheduler is enabled on the server (see the deployment guide).</p>
            <CalendarFeeds />
          </IntegrationRow>
        </ul>
      </CardContent>
    </Card>
  )
}
