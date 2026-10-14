import { ArrowDown, ArrowUp, Camera, Pencil, Plus, Trash2, X } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { ConfirmDialog } from '@/components/feedback/confirm-dialog'
import { ListSkeleton, QueryState } from '@/components/feedback/states'
import { Field, FormError } from '@/components/forms/field'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input, NativeSelect } from '@/components/ui/input'
import { Badge, Card, CardContent, CardDescription, CardHeader, CardTitle, Checkbox, Label } from '@/components/ui/primitives'
import { useChecklistTemplates, useDeleteChecklistTemplate, useSaveChecklistTemplate, type ChecklistTemplate } from '@/features/housekeeping/api'
import { toUserMessage } from '@/lib/errors'
import { TASK_TYPE, type TaskType } from '@/lib/labels'

type Item = { label: string; requires_photo: boolean }

function ChecklistDialog({ template, onClose }: { template: ChecklistTemplate | null; onClose: () => void }) {
  const save = useSaveChecklistTemplate()
  const [name, setName] = useState(template?.name ?? '')
  const [type, setType] = useState<TaskType>(template?.task_type ?? 'turnover_clean')
  const [isDefault, setIsDefault] = useState(template?.is_default ?? false)
  const [items, setItems] = useState<Item[]>(
    ((template?.items as Item[] | undefined) ?? []).map((i) => ({ label: i.label, requires_photo: Boolean(i.requires_photo) })),
  )
  const [newItem, setNewItem] = useState('')
  const [err, setErr] = useState<string | null>(null)

  const move = (i: number, d: number) =>
    setItems((list) => {
      const next = [...list]
      const j = i + d
      if (j < 0 || j >= next.length) return list
      ;[next[i], next[j]] = [next[j]!, next[i]!]
      return next
    })

  function add() {
    const label = newItem.trim()
    if (!label) return
    setItems((l) => [...l, { label: label.slice(0, 160), requires_photo: false }])
    setNewItem('')
  }

  return (
    <Dialog open onOpenChange={(o) => !o && !save.isPending && onClose()}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{template ? 'Edit checklist' : 'New checklist'}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <FormError message={err ?? (save.isError ? toUserMessage(save.error) : null)} />
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Name" required>
              <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={80} />
            </Field>
            <Field label="Task type">
              <NativeSelect value={type} onChange={(e) => setType(e.target.value as TaskType)}>
                {(Object.keys(TASK_TYPE) as TaskType[]).map((t) => (
                  <option key={t} value={t}>
                    {TASK_TYPE[t]}
                  </option>
                ))}
              </NativeSelect>
            </Field>
          </div>
          <div className="flex items-center gap-2.5">
            <Checkbox id="cl-default" checked={isDefault} onCheckedChange={(c) => setIsDefault(c === true)} />
            <Label htmlFor="cl-default" className="font-normal">
              Use automatically for new {TASK_TYPE[type].toLowerCase()} tasks
            </Label>
          </div>
          <ol className="divide-y rounded-md border">
            {items.map((item, i) => (
              <li key={i} className="flex items-center gap-2 p-2">
                <span className="w-6 text-right text-xs text-muted-foreground">{i + 1}.</span>
                <Input
                  value={item.label}
                  aria-label={`Item ${i + 1}`}
                  onChange={(e) => setItems((l) => l.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))}
                  className="h-8"
                />
                <Button
                  variant={item.requires_photo ? 'secondary' : 'ghost'}
                  size="icon-sm"
                  aria-pressed={item.requires_photo}
                  aria-label="Requires a photo"
                  title="Requires a photo"
                  onClick={() => setItems((l) => l.map((x, j) => (j === i ? { ...x, requires_photo: !x.requires_photo } : x)))}
                >
                  <Camera className={item.requires_photo ? 'text-primary' : ''} />
                </Button>
                <Button variant="ghost" size="icon-sm" aria-label="Move up" disabled={i === 0} onClick={() => move(i, -1)}>
                  <ArrowUp />
                </Button>
                <Button variant="ghost" size="icon-sm" aria-label="Move down" disabled={i === items.length - 1} onClick={() => move(i, 1)}>
                  <ArrowDown />
                </Button>
                <Button variant="ghost" size="icon-sm" aria-label="Remove item" onClick={() => setItems((l) => l.filter((_, j) => j !== i))}>
                  <X />
                </Button>
              </li>
            ))}
            {items.length === 0 && <li className="p-3 text-sm text-muted-foreground">No items yet.</li>}
          </ol>
          <div className="flex gap-2">
            <Input
              placeholder="Add an item, e.g. Sweep the veranda"
              aria-label="New checklist item"
              value={newItem}
              onChange={(e) => setNewItem(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  add()
                }
              }}
            />
            <Button variant="outline" onClick={add}>
              <Plus /> Add
            </Button>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={save.isPending}>
            Cancel
          </Button>
          <Button
            loading={save.isPending}
            onClick={() => {
              const clean = items.map((i) => ({ ...i, label: i.label.trim() })).filter((i) => i.label)
              if (name.trim().length < 2) return setErr('Give the checklist a name.')
              if (!clean.length) return setErr('Add at least one item.')
              setErr(null)
              save.mutate(
                { id: template?.id, name: name.trim(), task_type: type, is_default: isDefault, items: clean },
                {
                  onSuccess: () => {
                    toast.success('Checklist saved. New tasks will use it; existing tasks keep their checklist.')
                    onClose()
                  },
                },
              )
            }}
          >
            Save checklist
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export function ChecklistSettings() {
  const templates = useChecklistTemplates()
  const del = useDeleteChecklistTemplate()
  const [editing, setEditing] = useState<ChecklistTemplate | 'new' | null>(null)
  const [deleting, setDeleting] = useState<ChecklistTemplate | null>(null)
  return (
    <Card>
      <CardHeader className="sm:flex-row sm:items-center sm:justify-between">
        <div>
          <CardTitle>Housekeeping checklists</CardTitle>
          <CardDescription>The default turnover checklist is copied onto every automatic cleaning task.</CardDescription>
        </div>
        <Button onClick={() => setEditing('new')}>
          <Plus /> New checklist
        </Button>
      </CardHeader>
      <CardContent>
        <QueryState query={templates} loading={<ListSkeleton rows={2} />} empty={<p className="text-sm text-muted-foreground">No checklists yet.</p>}>
          {(rows) => (
            <ul className="divide-y rounded-md border">
              {rows.map((t) => (
                <li key={t.id} className="flex items-center gap-3 p-3">
                  <div className="min-w-0 flex-1">
                    <p className="flex flex-wrap items-center gap-2 text-sm font-medium">
                      {t.name}
                      {t.is_default && <Badge tone="ocean">Default for {TASK_TYPE[t.task_type].toLowerCase()}</Badge>}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {(t.items as Item[]).length} items · {TASK_TYPE[t.task_type]}
                    </p>
                  </div>
                  <Button variant="ghost" size="icon-sm" aria-label={`Edit ${t.name}`} onClick={() => setEditing(t)}>
                    <Pencil />
                  </Button>
                  <Button variant="ghost" size="icon-sm" aria-label={`Delete ${t.name}`} onClick={() => setDeleting(t)}>
                    <Trash2 className="text-danger" />
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </QueryState>
      </CardContent>
      {editing && <ChecklistDialog key={editing === 'new' ? 'new' : editing.id} template={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />}
      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(o) => !o && setDeleting(null)}
        title="Delete this checklist?"
        description="Existing tasks keep their checklist items."
        confirmLabel="Delete"
        destructive
        onConfirm={async () => {
          try {
            await del.mutateAsync(deleting!.id)
            toast.success('Checklist deleted.')
          } catch (e) {
            toast.error(toUserMessage(e))
            throw e
          }
        }}
      />
    </Card>
  )
}
