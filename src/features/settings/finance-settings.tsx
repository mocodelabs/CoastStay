import { Plus } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { ListSkeleton, QueryState } from '@/components/feedback/states'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge, Card, CardContent, CardDescription, CardHeader, CardTitle, Switch } from '@/components/ui/primitives'
import { useExpenseCategories, useSaveCategory, type ExpenseCategory } from '@/features/finances/api'
import { toUserMessage } from '@/lib/errors'

function CategoryRow({ c }: { c: ExpenseCategory }) {
  const save = useSaveCategory()
  const [name, setName] = useState(c.name)
  const update = (patch: Partial<{ name: string; include_in_operating_income: boolean; is_active: boolean }>) =>
    save.mutate(
      {
        id: c.id,
        name: patch.name ?? c.name,
        include_in_operating_income: patch.include_in_operating_income ?? c.include_in_operating_income,
        is_active: patch.is_active ?? c.is_active,
      },
      { onSuccess: () => toast.success('Category saved.'), onError: (e) => toast.error(toUserMessage(e)) },
    )
  return (
    <li className="flex flex-wrap items-center gap-3 p-3">
      <Input
        value={name}
        aria-label="Category name"
        onChange={(e) => setName(e.target.value)}
        onBlur={() => name.trim().length >= 2 && name.trim() !== c.name && update({ name: name.trim() })}
        className="h-9 max-w-56"
      />
      {c.is_system && <Badge tone="muted">Built-in</Badge>}
      <label className="ml-auto flex items-center gap-2 text-sm">
        <Switch checked={c.include_in_operating_income} onCheckedChange={(v) => update({ include_in_operating_income: v })} aria-label="Counts towards operating income" />
        Operating income
      </label>
      <label className="flex items-center gap-2 text-sm">
        <Switch checked={c.is_active} onCheckedChange={(v) => update({ is_active: v })} aria-label="Available for new expenses" />
        Active
      </label>
    </li>
  )
}

export function FinanceSettings() {
  const categories = useExpenseCategories()
  const save = useSaveCategory()
  const [name, setName] = useState('')
  return (
    <Card>
      <CardHeader>
        <CardTitle>Expense categories</CardTitle>
        <CardDescription>
          Switch off “Operating income” for categories that shouldn’t reduce estimated operating income (e.g. owner drawings, capital purchases).
          Inactive categories are hidden from new expenses but kept on existing ones.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <QueryState query={categories} loading={<ListSkeleton rows={4} />}>
          {(rows) => (
            <ul className="divide-y rounded-md border">
              {rows.map((c) => (
                <CategoryRow key={c.id} c={c} />
              ))}
            </ul>
          )}
        </QueryState>
        <form
          className="flex max-w-md gap-2"
          onSubmit={(e) => {
            e.preventDefault()
            if (name.trim().length < 2) return
            save.mutate(
              { name: name.trim(), include_in_operating_income: true },
              {
                onSuccess: () => {
                  toast.success('Category added.')
                  setName('')
                },
                onError: (err) => toast.error(toUserMessage(err)),
              },
            )
          }}
        >
          <Input placeholder="New category, e.g. Security" aria-label="New category name" value={name} onChange={(e) => setName(e.target.value)} maxLength={60} />
          <Button type="submit" variant="outline" loading={save.isPending}>
            <Plus /> Add
          </Button>
        </form>
      </CardContent>
    </Card>
  )
}
