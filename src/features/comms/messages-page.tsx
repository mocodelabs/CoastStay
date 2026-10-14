import { History } from 'lucide-react'
import { ListSkeleton, QueryState } from '@/components/feedback/states'
import { PageHeader } from '@/components/layout/page-header'
import { Badge, Card, CardContent, CardHeader, CardTitle } from '@/components/ui/primitives'
import { useOrg } from '@/features/workspace/workspace-provider'
import { formatDateTime } from '@/lib/date-utils'
import { useTemplates } from './api'
import { MessagesPanel, useOutbox } from './messages-panel'

const STATUS: Record<string, { label: string; tone: 'success' | 'muted' | 'danger' | 'info' }> = {
  opened: { label: 'Opened in WhatsApp', tone: 'success' },
  sent: { label: 'Sent', tone: 'success' },
  skipped: { label: 'Skipped', tone: 'muted' },
  failed: { label: 'Failed', tone: 'danger' },
}

export function MessagesPage() {
  const { timezone } = useOrg()
  const history = useOutbox('history', 50)
  const templates = useTemplates()
  const nameOf = (key: string | null) => templates.data?.find((t) => t.template_key === key)?.name ?? 'Message'
  return (
    <>
      <PageHeader
        title="Guest messages"
        description="Reminders are prepared automatically every 30 minutes. Review and send each one through WhatsApp."
      />
      <div className="space-y-6">
        <MessagesPanel />
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <History className="size-4" aria-hidden /> Recent activity
            </CardTitle>
          </CardHeader>
          <CardContent>
            <QueryState query={history} loading={<ListSkeleton rows={3} />} empty={<p className="text-sm text-muted-foreground">No messages yet.</p>}>
              {(rows) => (
                <ul className="divide-y text-sm">
                  {rows.map((m) => (
                    <li key={m.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
                      <span className="min-w-0">
                        <span className="block font-medium">
                          {nameOf(m.template_key)} · {m.booking?.guest?.full_name ?? 'Guest'}
                        </span>
                        <span className="block text-xs text-muted-foreground">
                          {m.channel} · {formatDateTime(m.created_at, timezone)}
                          {m.error && ` · ${m.error}`}
                        </span>
                      </span>
                      <Badge tone={STATUS[m.status]?.tone ?? 'muted'}>{STATUS[m.status]?.label ?? m.status}</Badge>
                    </li>
                  ))}
                </ul>
              )}
            </QueryState>
          </CardContent>
        </Card>
      </div>
    </>
  )
}
