import { AlertTriangle, Copy, Mail, MessageCircle, Send } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { NativeSelect, Textarea } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle, Label } from '@/components/ui/primitives'
import type { BookingDetail } from '@/features/bookings/api'
import { useBookingPayments } from '@/features/bookings/api'
import { useOrg } from '@/features/workspace/workspace-provider'
import { formatDateTime } from '@/lib/date-utils'
import { normalizePhone, whatsappLink } from '@/lib/phone'
import { renderTemplate } from '@/lib/templates'
import { useLogMessage, useMessageLogs, useTemplates } from './api'
import { buildTemplateVars } from './vars'

const SUGGESTED: Record<string, string> = {
  inquiry: 'booking_confirmation',
  pending: 'balance_due',
  confirmed: 'check_in_instructions',
  checked_in: 'wifi_instructions',
  checked_out: 'review_request',
  cancelled: 'booking_cancellation',
}

/**
 * Prepares a guest message from a template and hands it to WhatsApp (wa.me) or email.
 * Nothing is sent automatically; each hand-off is logged.
 */
export function MessageComposer({ booking }: { booking: BookingDetail }) {
  const { org, settings, can } = useOrg()
  const templates = useTemplates()
  const payments = useBookingPayments(booking.id, can('finance.view'))
  const logs = useMessageLogs(booking.id)
  const log = useLogMessage()
  const active = (templates.data ?? []).filter((t) => t.is_active)
  const [key, setKey] = useState('')
  const [text, setText] = useState('')

  const lastPayment = (payments.data ?? [])
    .filter((p) => ['deposit', 'balance', 'payment'].includes(p.payment_type) && ['recorded', 'verified'].includes(p.status))
    .at(-1)
  const vars = useMemo(
    () =>
      buildTemplateVars({
        booking,
        org,
        defaults: { check_in: settings?.default_check_in_time, check_out: settings?.default_check_out_time },
        lastPaymentAmount: lastPayment?.amount,
      }),
    [booking, org, settings, lastPayment?.amount],
  )

  const selected = active.find((t) => t.template_key === key) ?? active.find((t) => t.template_key === SUGGESTED[booking.status]) ?? active[0]
  const rendered = selected ? renderTemplate(selected.body, vars) : null

  useEffect(() => {
    if (rendered) setText(rendered.text)
    // re-render only when the template or booking data changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected?.id, rendered?.text])

  const phone = normalizePhone(booking.guest.phone)
  const email = booking.guest.email

  function record(channel: 'whatsapp' | 'email', recipient: string) {
    log.mutate({
      bookingId: booking.id,
      guestId: booking.guest_id,
      templateKey: selected?.template_key,
      channel,
      recipient,
      body: text,
      status: 'opened',
    })
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Send className="size-4" aria-hidden /> Message guest
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {templates.isPending ? (
          <p className="text-sm text-muted-foreground">Loading templates…</p>
        ) : active.length === 0 ? (
          <p className="text-sm text-muted-foreground">No active message templates.</p>
        ) : (
          <>
            <div className="space-y-1.5">
              <Label htmlFor="template">Template</Label>
              <NativeSelect id="template" value={selected?.template_key ?? ''} onChange={(e) => setKey(e.target.value)}>
                {active.map((t) => (
                  <option key={t.id} value={t.template_key}>
                    {t.name}
                  </option>
                ))}
              </NativeSelect>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="message">Message</Label>
              <Textarea id="message" rows={7} value={text} onChange={(e) => setText(e.target.value)} />
            </div>
            {rendered && rendered.missing.length > 0 && (
              <p className="flex gap-2 text-xs text-warning" role="note">
                <AlertTriangle className="size-3.5 shrink-0" aria-hidden />
                Missing details: {rendered.missing.map((m) => m.replace(/_/g, ' ')).join(', ')}. Edit the message or add them to the property.
              </p>
            )}
            <div className="flex flex-wrap gap-2">
              {phone.ok ? (
                <Button asChild size="sm">
                  <a
                    href={whatsappLink(phone.e164, text)}
                    target="_blank"
                    rel="noreferrer"
                    onClick={() => record('whatsapp', phone.e164)}
                  >
                    <MessageCircle /> Open WhatsApp
                  </a>
                </Button>
              ) : (
                <p className="w-full text-xs text-danger">
                  {booking.guest.phone ? 'The guest’s phone number is not valid for WhatsApp.' : 'No phone number on file.'}{' '}
                  <Link to={`/guests/${booking.guest_id}`} className="underline">
                    Update guest
                  </Link>
                </p>
              )}
              {email && (
                <Button asChild size="sm" variant="outline">
                  <a
                    href={`mailto:${encodeURIComponent(email)}?subject=${encodeURIComponent(selected?.subject || `${selected?.name ?? 'Your stay'} — ${booking.booking_reference}`)}&body=${encodeURIComponent(text)}`}
                    onClick={() => record('email', email)}
                  >
                    <Mail /> Email
                  </a>
                </Button>
              )}
              <Button
                size="sm"
                variant="ghost"
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(text)
                    toast.success('Message copied.')
                  } catch {
                    toast.error('Copy failed — select the text and copy it manually.')
                  }
                }}
              >
                <Copy /> Copy
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">Messages open in WhatsApp or your email app for you to send — nothing is sent automatically.</p>
          </>
        )}
        {(logs.data?.length ?? 0) > 0 && (
          <div className="border-t pt-3">
            <p className="mb-1 text-xs font-medium text-muted-foreground uppercase">Recent</p>
            <ul className="space-y-1 text-xs text-muted-foreground">
              {logs.data!.slice(0, 5).map((l) => (
                <li key={l.id}>
                  {active.find((t) => t.template_key === l.template_key)?.name ?? 'Message'} · {l.channel} · {formatDateTime(l.created_at)}
                  {l.sender?.full_name && ` · ${l.sender.full_name}`}
                </li>
              ))}
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
