import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { MessageCircle, Send, X } from 'lucide-react'
import { Link } from 'react-router'
import { toast } from 'sonner'
import { EmptyState, ListSkeleton } from '@/components/feedback/states'
import { Button } from '@/components/ui/button'
import { Badge, Card, CardContent, CardHeader, CardTitle } from '@/components/ui/primitives'
import { useOrg } from '@/features/workspace/workspace-provider'
import { formatDateTime } from '@/lib/date-utils'
import { toUserMessage } from '@/lib/errors'
import { normalizePhone, whatsappLink } from '@/lib/phone'
import { supabase } from '@/lib/supabase'
import { useTemplates } from './api'

const outboxKey = (orgId: string, status: string) => ['comms', orgId, 'outbox', status] as const

export function useOutbox(status: 'prepared' | 'history', limit = 50) {
  const { orgId } = useOrg()
  return useQuery({
    queryKey: outboxKey(orgId, status),
    refetchInterval: 120_000,
    queryFn: async () => {
      let q = supabase
        .from('communication_logs')
        .select('id, template_key, channel, recipient, body, status, error, created_at, booking:bookings(id, booking_reference, check_in_date, guest:guests(full_name))')
        .eq('organization_id', orgId)
      q = status === 'prepared' ? q.eq('status', 'prepared') : q.neq('status', 'prepared')
      const { data, error } = await q.order('created_at', { ascending: false }).limit(limit)
      if (error) throw error
      return data
    },
  })
}

function useMarkMessage() {
  const { orgId } = useOrg()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, status }: { id: string; status: 'opened' | 'skipped' }) => {
      const { error } = await supabase.from('communication_logs').update({ status }).eq('id', id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['comms', orgId, 'outbox'] }),
  })
}

/**
 * Guest messages prepared by the reminder schedule (check-in instructions, balance due, check-out,
 * review requests). Staff send each through WhatsApp; nothing is sent automatically.
 */
export function MessagesPanel({ compact = false }: { compact?: boolean }) {
  const { timezone } = useOrg()
  const outbox = useOutbox('prepared', compact ? 5 : 50)
  const templates = useTemplates()
  const mark = useMarkMessage()
  const nameOf = (key: string | null) => templates.data?.find((t) => t.template_key === key)?.name ?? 'Message'

  if (compact && (outbox.isPending || (outbox.data?.length ?? 0) === 0)) return null

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between">
        <CardTitle className="flex items-center gap-2">
          <Send className="size-4" aria-hidden /> Messages ready to send
          {(outbox.data?.length ?? 0) > 0 && <Badge tone="warning">{outbox.data!.length}</Badge>}
        </CardTitle>
        {compact && (
          <Button asChild variant="link" size="sm">
            <Link to="/messages">Open outbox</Link>
          </Button>
        )}
      </CardHeader>
      <CardContent>
        {outbox.isPending ? (
          <ListSkeleton rows={2} />
        ) : (outbox.data?.length ?? 0) === 0 ? (
          <EmptyState
            icon={MessageCircle}
            title="Nothing to send"
            description="Reminders such as check-in instructions and balance-due notes appear here when they’re due."
            className="py-8"
          />
        ) : (
          <ul className="divide-y">
            {outbox.data!.map((m) => {
              const phone = normalizePhone(m.recipient)
              return (
                <li key={m.id} className="space-y-2 py-3">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-sm font-medium">
                        {nameOf(m.template_key)} · {m.booking?.guest?.full_name ?? 'Guest'}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {m.booking && (
                          <Link to={`/bookings/${m.booking.id}`} className="hover:underline">
                            {m.booking.booking_reference}
                          </Link>
                        )}{' '}
                        · prepared {formatDateTime(m.created_at, timezone)}
                      </p>
                    </div>
                    <div className="flex gap-2">
                      {phone.ok ? (
                        <Button asChild size="sm">
                          <a
                            href={whatsappLink(phone.e164, m.body)}
                            target="_blank"
                            rel="noreferrer"
                            onClick={() => mark.mutate({ id: m.id, status: 'opened' })}
                          >
                            <MessageCircle /> Send on WhatsApp
                          </a>
                        </Button>
                      ) : (
                        <span className="text-xs text-danger">No valid phone</span>
                      )}
                      <Button
                        size="sm"
                        variant="ghost"
                        aria-label="Skip this message"
                        onClick={() =>
                          mark.mutate(
                            { id: m.id, status: 'skipped' },
                            { onSuccess: () => toast.success('Message skipped.'), onError: (e) => toast.error(toUserMessage(e)) },
                          )
                        }
                      >
                        <X /> Skip
                      </Button>
                    </div>
                  </div>
                  {!compact && <p className="rounded-md bg-sand-50 p-3 text-sm whitespace-pre-line text-charcoal-700">{m.body}</p>}
                </li>
              )
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}
