import { Pencil, Plus, Trash2 } from 'lucide-react'
import { useMemo, useState } from 'react'
import { toast } from 'sonner'
import { ConfirmDialog } from '@/components/feedback/confirm-dialog'
import { ListSkeleton, QueryState } from '@/components/feedback/states'
import { Field, FormError } from '@/components/forms/field'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input, Textarea } from '@/components/ui/input'
import { Badge, Card, CardContent, CardDescription, CardHeader, CardTitle, Checkbox, Label } from '@/components/ui/primitives'
import { useDeleteTemplate, useSaveTemplate, useTemplates, type Template } from '@/features/comms/api'
import { toUserMessage } from '@/lib/errors'
import { renderTemplate, TEMPLATE_PLACEHOLDERS, type TemplateVars } from '@/lib/templates'

const SAMPLE: TemplateVars = {
  guest_name: 'Amina',
  property_name: 'Diani Palm Villa',
  property_address: 'Diani Beach Road, Kwale',
  check_in_date: '20/10/2026',
  check_out_date: '24/10/2026',
  check_in_time: '14:00',
  check_out_time: '10:00',
  booking_reference: 'CS-2610-K7XQP',
  total_amount: 'KES 63,500.00',
  balance_due: 'KES 44,450.00',
  last_payment_amount: 'KES 19,050.00',
  check_in_instructions: 'Collect keys from the caretaker at the gate.',
  check_out_instructions: 'Leave the keys on the kitchen counter.',
  directions: 'Turn left after the Diani Beach Road junction.',
  wifi_name: 'PalmVilla-Guest',
  wifi_password: 'karibu2026',
  business_name: 'Pwani Holiday Homes',
  business_phone: '+254 712 345 678',
}

function TemplateDialog({ template, open, onOpenChange }: { template: Template | null; open: boolean; onOpenChange: (o: boolean) => void }) {
  const save = useSaveTemplate()
  const [name, setName] = useState(template?.name ?? '')
  const [subject, setSubject] = useState(template?.subject ?? '')
  const [body, setBody] = useState(template?.body ?? '')
  const [active, setActive] = useState(template?.is_active ?? true)
  const [err, setErr] = useState<string | null>(null)
  const preview = useMemo(() => renderTemplate(body, SAMPLE), [body])

  function insert(token: string) {
    setBody((b) => `${b}{{${token}}}`)
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !save.isPending && onOpenChange(o)}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{template ? `Edit “${template.name}”` : 'New message template'}</DialogTitle>
          <DialogDescription>Placeholders are filled in from the booking when the message is prepared.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <FormError message={err ?? (save.isError ? toUserMessage(save.error) : null)} />
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Name" required>
              <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={80} />
            </Field>
            <Field label="Email subject" hint="Used when sending by email.">
              <Input value={subject} onChange={(e) => setSubject(e.target.value)} maxLength={160} />
            </Field>
          </div>
          <Field label="Message" required>
            <Textarea rows={7} value={body} onChange={(e) => setBody(e.target.value)} maxLength={4000} />
          </Field>
          <div>
            <p className="mb-1.5 text-xs font-medium text-muted-foreground">Insert placeholder</p>
            <div className="flex flex-wrap gap-1.5">
              {TEMPLATE_PLACEHOLDERS.map((p) => (
                <button key={p} type="button" onClick={() => insert(p)} className="rounded border bg-sand-50 px-2 py-0.5 font-mono text-xs hover:bg-sand-100">
                  {`{{${p}}}`}
                </button>
              ))}
            </div>
          </div>
          <div>
            <p className="mb-1.5 text-xs font-medium text-muted-foreground">Preview with sample booking</p>
            <p className="rounded-md bg-success-soft/50 p-3 text-sm whitespace-pre-line">{preview.text || '—'}</p>
            {preview.unknown.length > 0 && (
              <p className="mt-1 text-xs text-danger">Unknown placeholders: {preview.unknown.map((u) => `{{${u}}}`).join(', ')}</p>
            )}
          </div>
          <div className="flex items-center gap-2.5">
            <Checkbox id="tpl-active" checked={active} onCheckedChange={(c) => setActive(c === true)} />
            <Label htmlFor="tpl-active" className="font-normal">
              Active (available in the message composer and automatic reminders)
            </Label>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={save.isPending}>
            Cancel
          </Button>
          <Button
            loading={save.isPending}
            onClick={() => {
              if (name.trim().length < 2) return setErr('Give the template a name.')
              if (!body.trim()) return setErr('Write the message.')
              if (preview.unknown.length) return setErr('Remove or fix the unknown placeholders.')
              setErr(null)
              save.mutate(
                { id: template?.id, name: name.trim(), body, subject: subject.trim() || null, is_active: active },
                {
                  onSuccess: () => {
                    toast.success('Template saved.')
                    onOpenChange(false)
                  },
                },
              )
            }}
          >
            Save template
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export function TemplateSettings() {
  const templates = useTemplates()
  const del = useDeleteTemplate()
  const [editing, setEditing] = useState<Template | null | 'new'>(null)
  const [deleting, setDeleting] = useState<Template | null>(null)
  return (
    <Card>
      <CardHeader className="sm:flex-row sm:items-center sm:justify-between">
        <div>
          <CardTitle>Guest message templates</CardTitle>
          <CardDescription>Used by the message composer and by automatic reminders (check-in, balance due, check-out, review).</CardDescription>
        </div>
        <Button onClick={() => setEditing('new')}>
          <Plus /> New template
        </Button>
      </CardHeader>
      <CardContent>
        <QueryState query={templates} loading={<ListSkeleton rows={4} />}>
          {(rows) => (
            <ul className="divide-y rounded-md border">
              {rows.map((t) => (
                <li key={t.id} className="flex items-start gap-3 p-3">
                  <div className="min-w-0 flex-1">
                    <p className="flex flex-wrap items-center gap-2 text-sm font-medium">
                      {t.name}
                      {t.is_system && <Badge tone="muted">Built-in</Badge>}
                      {!t.is_active && <Badge tone="warning">Inactive</Badge>}
                    </p>
                    <p className="line-clamp-2 text-xs text-muted-foreground">{t.body}</p>
                  </div>
                  <Button variant="ghost" size="icon-sm" aria-label={`Edit ${t.name}`} onClick={() => setEditing(t)}>
                    <Pencil />
                  </Button>
                  {!t.is_system && (
                    <Button variant="ghost" size="icon-sm" aria-label={`Delete ${t.name}`} onClick={() => setDeleting(t)}>
                      <Trash2 className="text-danger" />
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </QueryState>
      </CardContent>
      {editing && (
        <TemplateDialog
          key={editing === 'new' ? 'new' : editing.id}
          template={editing === 'new' ? null : editing}
          open
          onOpenChange={(o) => !o && setEditing(null)}
        />
      )}
      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(o) => !o && setDeleting(null)}
        title="Delete this template?"
        description="Messages already prepared are kept."
        confirmLabel="Delete"
        destructive
        onConfirm={async () => {
          try {
            await del.mutateAsync(deleting!.id)
            toast.success('Template deleted.')
          } catch (e) {
            toast.error(toUserMessage(e))
            throw e
          }
        }}
      />
    </Card>
  )
}
