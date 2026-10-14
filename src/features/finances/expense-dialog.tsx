import { zodResolver } from '@hookform/resolvers/zod'
import { Paperclip, X } from 'lucide-react'
import { useRef, useState } from 'react'
import { useForm } from 'react-hook-form'
import { toast } from 'sonner'
import { Field, FormError } from '@/components/forms/field'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input, NativeSelect, Textarea } from '@/components/ui/input'
import { usePropertyOptions } from '@/features/properties/api'
import { useOrg } from '@/features/workspace/workspace-provider'
import { useRequestId } from '@/hooks/use-url-state'
import { todayISO } from '@/lib/date-utils'
import { toUserMessage } from '@/lib/errors'
import { PAYMENT_METHOD } from '@/lib/labels'
import { FULL_SCOPE_ROLES } from '@/lib/permissions'
import { validateFile } from '@/lib/storage'
import { PAYMENT_METHODS } from '@/schemas/booking'
import { expenseSchema, expenseToForm, type ExpenseFormValues } from '@/schemas/expense'
import { useExpenseCategories, useSaveExpense, type Expense } from './api'

export function ExpenseDialog({
  open,
  onOpenChange,
  expense,
  defaults,
  maintenanceRequestId,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  expense?: Expense | null
  defaults?: Partial<ExpenseFormValues>
  maintenanceRequestId?: string
}) {
  const { timezone, currency, role } = useOrg()
  const properties = usePropertyOptions()
  const categories = useExpenseCategories()
  const save = useSaveExpense()
  const requestId = useRequestId()
  const [receipt, setReceipt] = useState<File | null>(null)
  const [fileError, setFileError] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const form = useForm<ExpenseFormValues>({
    resolver: zodResolver(expenseSchema),
    values: expense
      ? expenseToForm(expense)
      : {
          property_id: '',
          category: '',
          description: '',
          amount: '',
          expense_date: todayISO(timezone),
          payment_method: 'mpesa',
          supplier: '',
          notes: '',
          ...defaults,
        },
  })
  const { errors } = form.formState
  // Business-wide expenses are visible only to roles that see every property.
  const canShared = FULL_SCOPE_ROLES.includes(role)

  return (
    <Dialog open={open} onOpenChange={(o) => !save.isPending && onOpenChange(o)}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{expense ? 'Edit expense' : 'Record an expense'}</DialogTitle>
          <DialogDescription>Link it to a property to include it in that property’s performance.</DialogDescription>
        </DialogHeader>
        <form
          noValidate
          className="space-y-4"
          onSubmit={form.handleSubmit((values) =>
            save.mutate(
              { id: expense?.id, values, receipt, requestId: requestId.get(), maintenanceRequestId },
              {
                onSuccess: () => {
                  requestId.renew()
                  setReceipt(null)
                  toast.success(expense ? 'Expense saved.' : 'Expense recorded.')
                  onOpenChange(false)
                },
              },
            ),
          )}
        >
          <FormError message={save.isError ? toUserMessage(save.error) : null} />
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Description" error={errors.description?.message} required className="sm:col-span-2">
              <Input placeholder="e.g. KPLC tokens, laundry for 3 turnovers" {...form.register('description')} />
            </Field>
            <Field label="Category" error={errors.category?.message} required>
              <NativeSelect {...form.register('category')}>
                <option value="">Choose…</option>
                {categories.data
                  ?.filter((c) => c.is_active || c.code === expense?.category)
                  .map((c) => (
                    <option key={c.code} value={c.code}>
                      {c.name}
                    </option>
                  ))}
              </NativeSelect>
            </Field>
            <Field label="Property" error={errors.property_id?.message}>
              <NativeSelect {...form.register('property_id')}>
                {canShared && <option value="">Business-wide (no property)</option>}
                {!canShared && <option value="">Choose…</option>}
                {properties.data?.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </NativeSelect>
            </Field>
            <Field label={`Amount (${currency})`} error={errors.amount?.message} required>
              <Input inputMode="decimal" {...form.register('amount')} />
            </Field>
            <Field label="Date" error={errors.expense_date?.message} required>
              <Input type="date" {...form.register('expense_date')} />
            </Field>
            <Field label="Paid by" error={errors.payment_method?.message}>
              <NativeSelect {...form.register('payment_method')}>
                {PAYMENT_METHODS.map((m) => (
                  <option key={m} value={m}>
                    {PAYMENT_METHOD[m]}
                  </option>
                ))}
              </NativeSelect>
            </Field>
            <Field label="Supplier" error={errors.supplier?.message}>
              <Input {...form.register('supplier')} />
            </Field>
            <Field label="Notes" error={errors.notes?.message} className="sm:col-span-2">
              <Textarea rows={2} {...form.register('notes')} />
            </Field>
          </div>
          <div className="space-y-1.5">
            <input
              ref={fileRef}
              type="file"
              accept="image/jpeg,image/png,image/webp,application/pdf"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0] ?? null
                e.target.value = ''
                if (!f) return
                const problem = validateFile('receipts', f)
                setFileError(problem)
                setReceipt(problem ? null : f)
              }}
            />
            <div className="flex flex-wrap items-center gap-2">
              <Button variant="outline" size="sm" onClick={() => fileRef.current?.click()}>
                <Paperclip /> {expense?.receipt_path ? 'Replace receipt' : 'Attach receipt'}
              </Button>
              {receipt && (
                <span className="flex items-center gap-1 text-sm">
                  {receipt.name}
                  <button type="button" aria-label="Remove attachment" onClick={() => setReceipt(null)} className="rounded p-0.5 hover:bg-sand-100">
                    <X className="size-3.5" />
                  </button>
                </span>
              )}
              {!receipt && expense?.receipt_path && <span className="text-xs text-muted-foreground">Receipt attached</span>}
            </div>
            {fileError && <p className="text-xs text-danger">{fileError}</p>}
            <p className="text-xs text-muted-foreground">JPG, PNG, WebP or PDF up to 10 MB.</p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => onOpenChange(false)} disabled={save.isPending}>
              Cancel
            </Button>
            <Button type="submit" loading={save.isPending}>
              {expense ? 'Save expense' : 'Record expense'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
