import { FileText, Lock, Paperclip, Pencil, Phone, Receipt } from 'lucide-react'
import { useRef, useState } from 'react'
import { Link, useParams } from 'react-router'
import { toast } from 'sonner'
import { ErrorState } from '@/components/feedback/states'
import { Field } from '@/components/forms/field'
import { PageSkeleton } from '@/components/layout/page-skeleton'
import { Money } from '@/components/money'
import { MaintenanceStatusBadge, PriorityBadge } from '@/components/status-badges'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input, NativeSelect, Textarea } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle, Skeleton } from '@/components/ui/primitives'
import { useAuth } from '@/features/auth/auth-provider'
import { BlockDialog } from '@/features/calendar/block-dialog'
import { ExpenseDialog } from '@/features/finances/expense-dialog'
import { useOrg } from '@/features/workspace/workspace-provider'
import { centsToDecimal, toCents } from '@/lib/currency'
import { formatDate, formatDateTime, todayISO } from '@/lib/date-utils'
import { toUserMessage } from '@/lib/errors'
import { MAINTENANCE_CATEGORY, MAINTENANCE_STATUS, MAINTENANCE_STATUSES, type MaintenanceStatus } from '@/lib/labels'
import { formatPhone } from '@/lib/phone'
import { openSignedFile, useSignedUrls, validateFile } from '@/lib/storage'
import { useAddAttachments, useMaintenance, useUpdateMaintenance, type MaintenanceDetail } from './api'
import { MaintenanceDialog } from './maintenance-form'
import { isMaintenanceOverdue } from './maintenance-table'

const WORKER_STATUSES: MaintenanceStatus[] = ['in_progress', 'waiting_for_parts', 'resolved']

function ResolveDialog({ r, open, onOpenChange }: { r: MaintenanceDetail; open: boolean; onOpenChange: (o: boolean) => void }) {
  const { can, currency } = useOrg()
  const update = useUpdateMaintenance(r.id)
  const manager = can('maintenance.manage')
  const [notes, setNotes] = useState(r.resolution_notes ?? '')
  const [cost, setCost] = useState(r.actual_cost === null ? '' : centsToDecimal(toCents(r.actual_cost)))
  const [err, setErr] = useState<string | null>(null)
  return (
    <Dialog open={open} onOpenChange={(o) => !update.isPending && onOpenChange(o)}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Mark as resolved</DialogTitle>
          <DialogDescription>{r.title}</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <Field label="What was done?" required error={err ?? undefined}>
            <Textarea rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </Field>
          {manager && (
            <Field label={`Actual cost (${currency})`} hint="Record the payment as an expense to include it in finances.">
              <Input inputMode="decimal" value={cost} onChange={(e) => setCost(e.target.value)} />
            </Field>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={update.isPending}>
            Cancel
          </Button>
          <Button
            loading={update.isPending}
            onClick={() => {
              if (notes.trim().length < 3) return setErr('Describe the fix.')
              if (cost && !/^\d{1,10}(\.\d{1,2})?$/.test(cost.replace(/,/g, ''))) return setErr('Enter a valid cost.')
              update.mutate(
                {
                  status: 'resolved',
                  resolution_notes: notes.trim(),
                  ...(manager && { actual_cost: cost ? Number(cost.replace(/,/g, '')) : null }),
                },
                {
                  onSuccess: () => {
                    toast.success('Marked as resolved.')
                    onOpenChange(false)
                  },
                  onError: (e) => setErr(toUserMessage(e)),
                },
              )
            }}
          >
            Resolve
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export function MaintenanceDetailPage() {
  const { id = '' } = useParams()
  const { user } = useAuth()
  const { can, timezone, currency } = useOrg()
  const request = useMaintenance(id)
  const update = useUpdateMaintenance(id)
  const addFiles = useAddAttachments(id)
  const fileRef = useRef<HTMLInputElement>(null)
  const [editing, setEditing] = useState(false)
  const [resolving, setResolving] = useState(false)
  const [blocking, setBlocking] = useState(false)
  const [expense, setExpense] = useState(false)
  const paths = request.data?.attachments.map((a) => a.storage_path).filter((p) => !p.endsWith('.pdf')) ?? []
  const urls = useSignedUrls('maintenance-attachments', paths)

  if (request.isPending) return <PageSkeleton />
  if (request.isError) return <ErrorState error={request.error} onRetry={() => void request.refetch()} />
  const r = request.data
  const manager = can('maintenance.manage')
  const assignee = r.assigned_to === user?.id
  const statuses = manager ? MAINTENANCE_STATUSES : assignee ? (['in_progress', 'waiting_for_parts'] as MaintenanceStatus[]) : []
  const open = !['resolved', 'closed'].includes(r.status)
  const today = todayISO(timezone)
  const where = r.unit && !r.unit.is_default ? `${r.property?.name} · ${r.unit.name}` : r.property?.name

  return (
    <>
      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 space-y-1">
          <p className="text-sm text-muted-foreground">
            <Link to="/maintenance" className="hover:underline">
              Maintenance
            </Link>{' '}
            / {MAINTENANCE_CATEGORY[r.category] ?? r.category}
          </p>
          <h1 className="flex flex-wrap items-center gap-2 text-2xl font-semibold">
            {r.title}
            <MaintenanceStatusBadge status={r.status} />
            <PriorityBadge priority={r.priority} hideNormal />
          </h1>
          <p className="text-sm text-muted-foreground">
            <Link to={`/properties/${r.property_id}`} className="hover:underline">
              {where}
            </Link>
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {open && (manager || assignee) && (
            <Button onClick={() => setResolving(true)}>Mark resolved</Button>
          )}
          {manager && r.status === 'resolved' && (
            <Button
              loading={update.isPending}
              onClick={() => update.mutate({ status: 'closed' }, { onSuccess: () => toast.success('Request closed.'), onError: (e) => toast.error(toUserMessage(e)) })}
            >
              Close request
            </Button>
          )}
          {manager && (
            <Button variant="outline" onClick={() => setEditing(true)}>
              <Pencil /> Edit
            </Button>
          )}
          {can('block.manage') && open && (
            <Button variant="outline" onClick={() => setBlocking(true)}>
              <Lock /> Block dates
            </Button>
          )}
          {can('finance.record') && (
            <Button variant="outline" onClick={() => setExpense(true)}>
              <Receipt /> Record cost
            </Button>
          )}
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-3">
        <div className="space-y-5 lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle>Details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 text-sm">
              <p className="whitespace-pre-line">{r.description || 'No further details.'}</p>
              <p className="text-xs text-muted-foreground">
                Reported by {r.reporter?.full_name ?? 'staff'} · {formatDateTime(r.reported_at, timezone)}
              </p>
              {r.resolution_notes && (
                <div className="rounded-md bg-success-soft p-3 text-success">
                  <p className="font-medium">Resolution{r.resolved_at && ` · ${formatDateTime(r.resolved_at, timezone)}`}</p>
                  <p className="whitespace-pre-line">{r.resolution_notes}</p>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex-row items-center justify-between">
              <CardTitle>Photos & documents</CardTitle>
              {can('maintenance.report') && (
                <Button size="sm" variant="outline" loading={addFiles.isPending} onClick={() => fileRef.current?.click()}>
                  <Paperclip /> Add
                </Button>
              )}
            </CardHeader>
            <CardContent>
              <input
                ref={fileRef}
                type="file"
                multiple
                accept="image/jpeg,image/png,image/webp,application/pdf"
                className="hidden"
                onChange={(e) => {
                  const files = Array.from(e.target.files ?? []).filter((f) => {
                    const err = validateFile('maintenance-attachments', f)
                    if (err) toast.error(`${f.name}: ${err}`)
                    return !err
                  })
                  e.target.value = ''
                  if (files.length) addFiles.mutate(files, { onSuccess: (fails) => fails.forEach((f) => toast.error(f)) })
                }}
              />
              {r.attachments.length === 0 ? (
                <p className="text-sm text-muted-foreground">Nothing attached.</p>
              ) : (
                <ul className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                  {r.attachments.map((a) =>
                    a.storage_path.endsWith('.pdf') ? (
                      <li key={a.id}>
                        <button
                          type="button"
                          onClick={() => openSignedFile('maintenance-attachments', a.storage_path).catch((e) => toast.error(toUserMessage(e)))}
                          className="flex aspect-square w-full flex-col items-center justify-center gap-1 rounded-md border bg-sand-50 text-xs"
                        >
                          <FileText className="size-6 text-muted-foreground" /> PDF
                        </button>
                      </li>
                    ) : (
                      <li key={a.id} className="aspect-square overflow-hidden rounded-md bg-sand-100">
                        {urls.data?.[a.storage_path] ? (
                          <a href={urls.data[a.storage_path]} target="_blank" rel="noreferrer">
                            <img src={urls.data[a.storage_path]} alt={a.caption ?? 'Maintenance photo'} className="size-full object-cover" loading="lazy" />
                          </a>
                        ) : (
                          <Skeleton className="size-full rounded-none" />
                        )}
                      </li>
                    ),
                  )}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-5">
          <Card>
            <CardHeader>
              <CardTitle>Progress</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              {statuses.length > 0 && open && (
                <div className="space-y-1">
                  <label htmlFor="mx-status" className="font-medium">
                    Status
                  </label>
                  <NativeSelect
                    id="mx-status"
                    value={r.status}
                    disabled={update.isPending}
                    onChange={(e) => {
                      const s = e.target.value as MaintenanceStatus
                      if (s === 'resolved') return setResolving(true)
                      update.mutate({ status: s }, { onSuccess: () => toast.success('Status updated.'), onError: (err) => toast.error(toUserMessage(err)) })
                    }}
                  >
                    {[...new Set([r.status, ...statuses, ...(manager ? [] : WORKER_STATUSES)])]
                      .filter((s) => manager || s === r.status || WORKER_STATUSES.includes(s))
                      .map((s) => (
                        <option key={s} value={s}>
                          {MAINTENANCE_STATUS[s].label}
                        </option>
                      ))}
                  </NativeSelect>
                </div>
              )}
              <div>
                <p className="text-muted-foreground">Assigned to</p>
                <p className="font-medium">{r.assignee?.full_name ?? 'No staff member'}</p>
              </div>
              {(r.technician_name || r.technician_phone) && (
                <div>
                  <p className="text-muted-foreground">Technician</p>
                  <p className="font-medium">{r.technician_name}</p>
                  {r.technician_phone && (
                    <a href={`tel:${r.technician_phone}`} className="flex items-center gap-1 text-primary hover:underline">
                      <Phone className="size-3.5" /> {formatPhone(r.technician_phone)}
                    </a>
                  )}
                </div>
              )}
              <div>
                <p className="text-muted-foreground">Target date</p>
                <p className={isMaintenanceOverdue(r, today) ? 'font-medium text-danger' : 'font-medium'}>
                  {r.target_date ? formatDate(r.target_date) : '—'}
                  {isMaintenanceOverdue(r, today) && ' · overdue'}
                </p>
              </div>
              {can('finance.view') || manager ? (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <p className="text-muted-foreground">Estimate</p>
                    <p className="font-medium">{r.estimated_cost === null ? '—' : <Money value={r.estimated_cost} currency={currency} />}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Actual</p>
                    <p className="font-medium">{r.actual_cost === null ? '—' : <Money value={r.actual_cost} currency={currency} />}</p>
                  </div>
                </div>
              ) : null}
              {r.expenses.length > 0 && (
                <p className="text-xs text-muted-foreground">
                  Recorded as expense:{' '}
                  {r.expenses.map((e) => (
                    <span key={e.id}>
                      <Money value={e.amount} currency={currency} /> on {formatDate(e.expense_date)}
                      {e.status === 'void' && ' (void)'}{' '}
                    </span>
                  ))}
                </p>
              )}
              {r.blocks.length > 0 && (
                <p className="text-xs text-muted-foreground">
                  Unit blocked:{' '}
                  {r.blocks.map((b) => `${formatDate(b.start_date)} → ${formatDate(b.end_date)}`).join(', ')}
                </p>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {editing && <MaintenanceDialog open request={r} onOpenChange={setEditing} />}
      {resolving && <ResolveDialog r={r} open onOpenChange={setResolving} />}
      {blocking && (
        <BlockDialog
          open
          onOpenChange={setBlocking}
          title="Block dates for this repair"
          maintenanceRequestId={r.id}
          initial={{
            property_id: r.property_id,
            unit_id: r.unit_id ?? '',
            reason: 'maintenance',
            start_date: today,
            end_date: '',
            notes: r.title,
          }}
        />
      )}
      {expense && (
        <ExpenseDialog
          open
          onOpenChange={setExpense}
          maintenanceRequestId={r.id}
          defaults={{
            property_id: r.property_id,
            category: 'maintenance',
            description: `Repair: ${r.title}`.slice(0, 300),
            amount: r.actual_cost !== null ? centsToDecimal(toCents(r.actual_cost)) : '',
            supplier: r.technician_name ?? '',
          }}
        />
      )}
    </>
  )
}
