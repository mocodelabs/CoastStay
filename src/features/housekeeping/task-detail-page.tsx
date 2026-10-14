import { Camera, Check, ClipboardCheck, Hand, MessageSquare, Play, RotateCcw, Send, ShieldCheck, Trash2, XCircle } from 'lucide-react'
import { useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { toast } from 'sonner'
import { ConfirmDialog } from '@/components/feedback/confirm-dialog'
import { ErrorState } from '@/components/feedback/states'
import { PageSkeleton } from '@/components/layout/page-skeleton'
import { PriorityBadge, TaskStatusBadge } from '@/components/status-badges'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { NativeSelect, Textarea } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle, Checkbox, Label, Skeleton } from '@/components/ui/primitives'
import { useAuth } from '@/features/auth/auth-provider'
import { useMemberOptions } from '@/features/workspace/members'
import { useOrg } from '@/features/workspace/workspace-provider'
import { formatDateTime } from '@/lib/date-utils'
import { toUserMessage } from '@/lib/errors'
import { PRIORITIES, PRIORITY, TASK_TYPE, type TaskStatus } from '@/lib/labels'
import { useSignedUrls, validateFile } from '@/lib/storage'
import { cn } from '@/lib/utils'
import {
  useAddComment,
  useDeleteTask,
  useDeleteTaskPhoto,
  useTask,
  useToggleItem,
  useUpdateTask,
  useUploadTaskPhotos,
  type TaskDetail,
} from './api'
import { isOverdue } from './task-list'

function CompleteDialog({
  task,
  target,
  onClose,
}: {
  task: TaskDetail
  target: TaskStatus | null
  onClose: () => void
}) {
  const update = useUpdateTask(task.id)
  const [notes, setNotes] = useState(task.completion_notes ?? '')
  const open = target !== null
  const unchecked = task.items.filter((i) => !i.is_completed)
  const needsPhoto = task.items.some((i) => i.requires_photo) && task.photos.length === 0
  const title = target === 'awaiting_inspection' ? 'Submit for inspection?' : target === 'completed' && task.status === 'awaiting_inspection' ? 'Sign off this task?' : 'Mark as complete?'
  return (
    <Dialog open={open} onOpenChange={(o) => !o && !update.isPending && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{task.title}</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          {unchecked.length > 0 && (
            <p className="rounded-md bg-warning-soft p-3 text-sm text-warning">
              {unchecked.length} checklist item{unchecked.length === 1 ? ' is' : 's are'} not ticked.
            </p>
          )}
          {needsPhoto && <p className="rounded-md bg-warning-soft p-3 text-sm text-warning">No inspection photos have been uploaded.</p>}
          <div className="space-y-1.5">
            <Label htmlFor="completion-notes">Notes</Label>
            <Textarea id="completion-notes" rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Damages found, items replenished…" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={update.isPending}>
            Cancel
          </Button>
          <Button
            loading={update.isPending}
            onClick={() =>
              update.mutate(
                { status: target!, completion_notes: notes.trim() || null },
                {
                  onSuccess: () => {
                    toast.success(target === 'awaiting_inspection' ? 'Sent for inspection.' : 'Task completed.')
                    onClose()
                  },
                  onError: (e) => toast.error(toUserMessage(e)),
                },
              )
            }
          >
            <Check /> Confirm
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function Photos({ task, canAdd }: { task: TaskDetail; canAdd: boolean }) {
  const { user } = useAuth()
  const { can } = useOrg()
  const urls = useSignedUrls('task-photos', task.photos.map((p) => p.storage_path))
  const upload = useUploadTaskPhotos(task.id)
  const del = useDeleteTaskPhoto(task.id)
  const ref = useRef<HTMLInputElement>(null)
  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between">
        <CardTitle>Inspection photos</CardTitle>
        {canAdd && (
          <Button size="sm" variant="outline" loading={upload.isPending} onClick={() => ref.current?.click()}>
            <Camera /> Add photos
          </Button>
        )}
      </CardHeader>
      <CardContent>
        <input
          ref={ref}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          capture="environment"
          multiple
          className="hidden"
          onChange={(e) => {
            const files = Array.from(e.target.files ?? [])
            e.target.value = ''
            const valid = files.filter((f) => {
              const err = validateFile('task-photos', f)
              if (err) toast.error(`${f.name}: ${err}`)
              return !err
            })
            if (valid.length)
              upload.mutate(valid, {
                onSuccess: (failures) => {
                  failures.forEach((f) => toast.error(f))
                  if (failures.length < valid.length) toast.success('Photos uploaded.')
                },
              })
          }}
        />
        {task.photos.length === 0 ? (
          <p className="text-sm text-muted-foreground">No photos yet.</p>
        ) : (
          <ul className="grid grid-cols-3 gap-2 sm:grid-cols-4">
            {task.photos.map((p) => (
              <li key={p.id} className="group relative aspect-square overflow-hidden rounded-md bg-sand-100">
                {urls.data?.[p.storage_path] ? (
                  <a href={urls.data[p.storage_path]} target="_blank" rel="noreferrer">
                    <img src={urls.data[p.storage_path]} alt={p.caption ?? 'Inspection photo'} className="size-full object-cover" loading="lazy" />
                  </a>
                ) : (
                  <Skeleton className="size-full rounded-none" />
                )}
                {(p.uploaded_by === user?.id || can('housekeeping.manage')) && (
                  <button
                    type="button"
                    aria-label="Delete photo"
                    className="absolute top-1 right-1 rounded bg-white/90 p-1 text-danger shadow"
                    onClick={() => del.mutate(p, { onError: (e) => toast.error(toUserMessage(e)) })}
                  >
                    <Trash2 className="size-3.5" />
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}

function Comments({ task }: { task: TaskDetail }) {
  const add = useAddComment(task.id)
  const [body, setBody] = useState('')
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <MessageSquare className="size-4" aria-hidden /> Comments
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {task.comments.length === 0 && <p className="text-sm text-muted-foreground">No comments yet.</p>}
        <ul className="space-y-3">
          {task.comments.map((c) => (
            <li key={c.id} className="text-sm">
              <p className="whitespace-pre-line">{c.body}</p>
              <p className="text-xs text-muted-foreground">
                {c.author?.full_name ?? 'Staff'} · {formatDateTime(c.created_at)}
              </p>
            </li>
          ))}
        </ul>
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault()
            if (!body.trim()) return
            add.mutate(body.trim(), { onSuccess: () => setBody(''), onError: (err) => toast.error(toUserMessage(err)) })
          }}
        >
          <Textarea rows={1} value={body} onChange={(e) => setBody(e.target.value)} aria-label="Add a comment" placeholder="Add a comment…" className="min-h-10" />
          <Button type="submit" size="icon" aria-label="Post comment" loading={add.isPending} disabled={!body.trim()}>
            {!add.isPending && <Send />}
          </Button>
        </form>
      </CardContent>
    </Card>
  )
}

export function TaskDetailPage() {
  const { id = '' } = useParams()
  const navigate = useNavigate()
  const { user } = useAuth()
  const { can, timezone } = useOrg()
  const task = useTask(id)
  const update = useUpdateTask(id)
  const toggle = useToggleItem(id)
  const remove = useDeleteTask()
  const staff = useMemberOptions()
  const [target, setTarget] = useState<TaskStatus | null>(null)
  const [confirmCancel, setConfirmCancel] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)

  if (task.isPending) return <PageSkeleton />
  if (task.isError) return <ErrorState error={task.error} onRetry={() => void task.refetch()} />
  const t = task.data
  const manager = can('housekeeping.manage')
  const mine = t.assigned_to === user?.id
  const canWork = manager || (can('housekeeping.work') && (mine || t.assigned_to === null))
  const open = ['pending', 'in_progress', 'awaiting_inspection'].includes(t.status)
  const where = t.unit && !t.unit.is_default ? `${t.property?.name} · ${t.unit.name}` : t.property?.name
  const done = t.items.filter((i) => i.is_completed).length

  function run(patch: Parameters<typeof update.mutate>[0], msg: string) {
    update.mutate(patch, { onSuccess: () => toast.success(msg), onError: (e) => toast.error(toUserMessage(e)) })
  }

  return (
    <>
      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 space-y-1">
          <p className="text-sm text-muted-foreground">
            <Link to="/housekeeping" className="hover:underline">
              Housekeeping
            </Link>{' '}
            / {TASK_TYPE[t.task_type]}
          </p>
          <h1 className="flex flex-wrap items-center gap-2 text-2xl font-semibold">
            {t.title}
            <TaskStatusBadge status={t.status} />
            <PriorityBadge priority={t.priority} hideNormal />
          </h1>
          <p className="text-sm text-muted-foreground">{where}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {canWork && !mine && t.assigned_to === null && open && !manager && (
            <Button variant="outline" loading={update.isPending} onClick={() => run({ assigned_to: user!.id }, 'Task assigned to you.')}>
              <Hand /> Take this task
            </Button>
          )}
          {canWork && t.status === 'pending' && (mine || manager) && (
            <Button loading={update.isPending} onClick={() => run({ status: 'in_progress', ...(t.assigned_to ? {} : { assigned_to: user!.id }) }, 'Task started.')}>
              <Play /> Start
            </Button>
          )}
          {canWork && t.status === 'in_progress' && (mine || manager) && (
            <Button onClick={() => setTarget(t.inspection_required && !manager ? 'awaiting_inspection' : 'completed')}>
              <ClipboardCheck /> {t.inspection_required && !manager ? 'Submit for inspection' : 'Mark complete'}
            </Button>
          )}
          {manager && t.status === 'awaiting_inspection' && (
            <Button onClick={() => setTarget('completed')}>
              <ShieldCheck /> Sign off
            </Button>
          )}
          {manager && t.status === 'awaiting_inspection' && (
            <Button variant="outline" loading={update.isPending} onClick={() => run({ status: 'in_progress' }, 'Sent back for more work.')}>
              <RotateCcw /> Send back
            </Button>
          )}
          {manager && ['completed', 'cancelled'].includes(t.status) && (
            <Button variant="outline" loading={update.isPending} onClick={() => run({ status: 'pending' }, 'Task reopened.')}>
              <RotateCcw /> Reopen
            </Button>
          )}
          {manager && open && (
            <Button variant="ghost" onClick={() => setConfirmCancel(true)}>
              <XCircle /> Cancel task
            </Button>
          )}
          {manager && !t.generation_key && ['pending', 'cancelled'].includes(t.status) && (
            <Button variant="ghost" aria-label="Delete task" onClick={() => setConfirmDelete(true)}>
              <Trash2 className="text-danger" />
            </Button>
          )}
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-3">
        <div className="space-y-5 lg:col-span-2">
          <Card>
            <CardHeader className="flex-row items-center justify-between">
              <CardTitle>Checklist</CardTitle>
              {t.items.length > 0 && (
                <span className="text-sm text-muted-foreground">
                  {done}/{t.items.length} done
                </span>
              )}
            </CardHeader>
            <CardContent>
              {t.items.length === 0 ? (
                <p className="text-sm text-muted-foreground">No checklist for this task.</p>
              ) : (
                <ul className="divide-y">
                  {t.items.map((item) => (
                    <li key={item.id} className="flex items-center gap-3 py-2.5">
                      <Checkbox
                        id={`item-${item.id}`}
                        checked={item.is_completed}
                        disabled={!canWork || !open || (!mine && !manager)}
                        onCheckedChange={(c) => toggle.mutate({ id: item.id, done: c === true }, { onError: (e) => toast.error(toUserMessage(e)) })}
                      />
                      <Label htmlFor={`item-${item.id}`} className={cn('flex-1 font-normal', item.is_completed && 'text-muted-foreground line-through')}>
                        {item.label}
                        {item.requires_photo && <Camera className="ml-1.5 inline size-3.5 text-muted-foreground" aria-label="Photo required" />}
                      </Label>
                    </li>
                  ))}
                </ul>
              )}
              {!mine && !manager && t.assigned_to !== null && <p className="mt-3 text-xs text-muted-foreground">Only the assigned person can tick items.</p>}
            </CardContent>
          </Card>
          <Photos task={t} canAdd={canWork && (mine || manager)} />
          <Comments task={t} />
        </div>
        <div className="space-y-5">
          <Card>
            <CardHeader>
              <CardTitle>Details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div>
                <p className="text-muted-foreground">Scheduled</p>
                <p className="font-medium">{formatDateTime(t.scheduled_at, timezone)}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Due by</p>
                <p className={cn('font-medium', isOverdue(t) && 'text-danger')}>
                  {t.due_at ? formatDateTime(t.due_at, timezone) : '—'}
                  {isOverdue(t) && ' · overdue'}
                </p>
              </div>
              {t.description && (
                <div>
                  <p className="text-muted-foreground">Instructions</p>
                  <p className="whitespace-pre-line">{t.description}</p>
                </div>
              )}
              <div className="space-y-1">
                <Label htmlFor="assignee">Assigned to</Label>
                {manager ? (
                  <NativeSelect
                    id="assignee"
                    value={t.assigned_to ?? ''}
                    disabled={update.isPending || !open}
                    onChange={(e) => run({ assigned_to: e.target.value || null }, 'Task reassigned.')}
                  >
                    <option value="">Unassigned</option>
                    {staff.data?.map((m) => (
                      <option key={m.user_id} value={m.user_id}>
                        {m.name}
                      </option>
                    ))}
                  </NativeSelect>
                ) : (
                  <p className="font-medium">{t.assignee?.full_name ?? 'Unassigned'}</p>
                )}
              </div>
              {manager && open && (
                <div className="space-y-1">
                  <Label htmlFor="priority">Priority</Label>
                  <NativeSelect id="priority" value={t.priority} disabled={update.isPending} onChange={(e) => run({ priority: e.target.value as typeof t.priority }, 'Priority updated.')}>
                    {PRIORITIES.map((p) => (
                      <option key={p} value={p}>
                        {PRIORITY[p].label}
                      </option>
                    ))}
                  </NativeSelect>
                </div>
              )}
              {manager && open && (
                <div className="flex items-center gap-2.5 pt-1">
                  <Checkbox
                    id="needs-inspection"
                    checked={t.inspection_required}
                    disabled={update.isPending}
                    onCheckedChange={(c) => run({ inspection_required: c === true }, 'Updated.')}
                  />
                  <Label htmlFor="needs-inspection" className="font-normal">
                    Requires manager inspection
                  </Label>
                </div>
              )}
              {t.started_at && <p className="text-xs text-muted-foreground">Started {formatDateTime(t.started_at, timezone)}</p>}
              {t.completed_at && <p className="text-xs text-muted-foreground">Completed {formatDateTime(t.completed_at, timezone)}</p>}
              {t.inspected_at && (
                <p className="text-xs text-muted-foreground">
                  Signed off by {t.inspector?.full_name ?? 'manager'} · {formatDateTime(t.inspected_at, timezone)}
                </p>
              )}
              {t.completion_notes && (
                <div>
                  <p className="text-muted-foreground">Completion notes</p>
                  <p className="whitespace-pre-line">{t.completion_notes}</p>
                </div>
              )}
              {t.booking_id && can('booking.view') && (
                <Link to={`/bookings/${t.booking_id}`} className="block text-primary hover:underline">
                  View booking
                </Link>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      <CompleteDialog task={t} target={target} onClose={() => setTarget(null)} />
      <ConfirmDialog
        open={confirmCancel}
        onOpenChange={setConfirmCancel}
        title="Cancel this task?"
        description="It stays in the history as cancelled. You can reopen it later."
        confirmLabel="Cancel task"
        destructive
        onConfirm={async () => {
          try {
            await update.mutateAsync({ status: 'cancelled' })
            toast.success('Task cancelled.')
          } catch (e) {
            toast.error(toUserMessage(e))
            throw e
          }
        }}
      />
      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title="Delete this task?"
        description="The task, its checklist, comments and photos are removed permanently."
        confirmLabel="Delete task"
        destructive
        onConfirm={async () => {
          try {
            await remove.mutateAsync(t.id)
            toast.success('Task deleted.')
            navigate('/housekeeping', { replace: true })
          } catch (e) {
            toast.error(toUserMessage(e))
            throw e
          }
        }}
      />
    </>
  )
}
