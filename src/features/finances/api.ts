import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { pageRange } from '@/components/tables/pagination'
import type { BookingOverview } from '@/features/bookings/api'
import { useOrg } from '@/features/workspace/workspace-provider'
import type { PaymentMethod, PaymentType } from '@/lib/labels'
import { removeFile, uploadFile } from '@/lib/storage'
import { supabase } from '@/lib/supabase'
import { orNull } from '@/schemas/common'
import type { ExpenseFormValues } from '@/schemas/expense'
import type { Database } from '@/types/database'

export type Expense = Database['public']['Tables']['expenses']['Row']
export type ExpenseCategory = Database['public']['Tables']['expense_categories']['Row']

export const financeKeys = {
  all: (orgId: string) => ['finances', orgId] as const,
  summary: (orgId: string, from: string, to: string, prop: string) => ['finances', orgId, 'summary', from, to, prop] as const,
  payments: (orgId: string, f: object) => ['finances', orgId, 'payments', f] as const,
  expenses: (orgId: string, f: object) => ['finances', orgId, 'expenses', f] as const,
  outstanding: (orgId: string, f: object) => ['finances', orgId, 'outstanding', f] as const,
  categories: (orgId: string) => ['finances', orgId, 'categories'] as const,
}

export interface FinanceSummary {
  payments_received: number
  refunds: number
  net_collected: number
  expenses_operating: number
  expenses_total: number
  estimated_operating_income: number
  outstanding_balance: number
  credits_owed: number
}

export function useFinanceSummary(from: string, to: string, propertyId = '') {
  const { orgId } = useOrg()
  return useQuery({
    queryKey: financeKeys.summary(orgId, from, to, propertyId),
    queryFn: async (): Promise<FinanceSummary> => {
      const { data, error } = await supabase.rpc('finance_summary', {
        org: orgId,
        from_date: from,
        to_date: to,
        prop: propertyId || undefined,
      })
      if (error) throw error
      const row = data[0]
      if (!row) throw new Error('No summary returned')
      return row
    },
  })
}

export interface PaymentFilters {
  from?: string
  to?: string
  property?: string
  method?: string
  type?: string
  page: number
}

const PAYMENT_SELECT =
  '*, booking:bookings(id, booking_reference, guest:guests(full_name)), property:properties(name), recorder:profiles(full_name)'

function paymentQuery(orgId: string, f: PaymentFilters) {
  let q = supabase.from('booking_payments').select(PAYMENT_SELECT, { count: 'exact' }).eq('organization_id', orgId)
  if (f.from) q = q.gte('payment_date', f.from)
  if (f.to) q = q.lte('payment_date', f.to)
  if (f.property) q = q.eq('property_id', f.property)
  if (f.method) q = q.eq('payment_method', f.method as PaymentMethod)
  if (f.type === 'refunds_adjustments') q = q.in('payment_type', ['refund', 'adjustment_credit', 'adjustment_debit', 'reversal'])
  else if (f.type) q = q.eq('payment_type', f.type as PaymentType)
  return q.order('payment_date', { ascending: false }).order('created_at', { ascending: false })
}

export function useLedger(f: PaymentFilters) {
  const { orgId } = useOrg()
  return useQuery({
    queryKey: financeKeys.payments(orgId, f),
    placeholderData: (prev) => prev,
    queryFn: async () => {
      const [from, to] = pageRange(f.page)
      const { data, error, count } = await paymentQuery(orgId, f).range(from, to)
      if (error) throw error
      return { rows: data, total: count ?? 0 }
    },
  })
}

export async function fetchLedgerForExport(orgId: string, f: PaymentFilters) {
  const { data, error } = await paymentQuery(orgId, f).range(0, 4999)
  if (error) throw error
  return data
}

export function useExpenseCategories() {
  const { orgId } = useOrg()
  return useQuery({
    queryKey: financeKeys.categories(orgId),
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('expense_categories')
        .select('*')
        .eq('organization_id', orgId)
        .order('sort_order')
        .order('name')
      if (error) throw error
      return data
    },
  })
}

export interface ExpenseFilters {
  from?: string
  to?: string
  property?: string
  category?: string
  status?: string
  page: number
}

function expenseQuery(orgId: string, f: ExpenseFilters) {
  let q = supabase
    .from('expenses')
    .select('*, property:properties(name), creator:profiles!expenses_created_by_fkey(full_name)', { count: 'exact' })
    .eq('organization_id', orgId)
  if (f.from) q = q.gte('expense_date', f.from)
  if (f.to) q = q.lte('expense_date', f.to)
  if (f.property === 'shared') q = q.is('property_id', null)
  else if (f.property) q = q.eq('property_id', f.property)
  if (f.category) q = q.eq('category', f.category)
  if (f.status === 'all') {
    /* include void */
  } else q = q.eq('status', (f.status || 'recorded') as Expense['status'])
  return q.order('expense_date', { ascending: false }).order('created_at', { ascending: false })
}

export function useExpenses(f: ExpenseFilters) {
  const { orgId } = useOrg()
  return useQuery({
    queryKey: financeKeys.expenses(orgId, f),
    placeholderData: (prev) => prev,
    queryFn: async () => {
      const [from, to] = pageRange(f.page)
      const { data, error, count } = await expenseQuery(orgId, f).range(from, to)
      if (error) throw error
      return { rows: data, total: count ?? 0 }
    },
  })
}

export async function fetchExpensesForExport(orgId: string, f: ExpenseFilters) {
  const { data, error } = await expenseQuery(orgId, f).range(0, 4999)
  if (error) throw error
  return data
}

export function useOutstanding(f: { property?: string; kind: 'owed' | 'credit'; page: number }) {
  const { orgId } = useOrg()
  return useQuery({
    queryKey: financeKeys.outstanding(orgId, f),
    placeholderData: (prev) => prev,
    queryFn: async () => {
      let q = supabase.from('bookings_overview').select('*', { count: 'exact' }).eq('organization_id', orgId).neq('status', 'inquiry')
      q = f.kind === 'owed' ? q.gt('balance_due', 0) : q.lt('balance_due', 0)
      if (f.property) q = q.eq('property_id', f.property)
      const [from, to] = pageRange(f.page)
      const { data, error, count } = await q.order('check_in_date').range(from, to)
      if (error) throw error
      return { rows: data as BookingOverview[], total: count ?? 0 }
    },
  })
}

function useInvalidateFinance() {
  const { orgId } = useOrg()
  const qc = useQueryClient()
  return () => void qc.invalidateQueries({ queryKey: financeKeys.all(orgId) })
}

export function useSaveExpense() {
  const { orgId } = useOrg()
  const invalidate = useInvalidateFinance()
  return useMutation({
    mutationFn: async ({
      id,
      values,
      receipt,
      requestId,
      maintenanceRequestId,
    }: {
      id?: string
      values: ExpenseFormValues
      receipt?: File | null
      requestId?: string
      maintenanceRequestId?: string
    }) => {
      const expenseId = id ?? crypto.randomUUID()
      let receiptPath: string | undefined
      if (receipt) receiptPath = await uploadFile('receipts', orgId, expenseId, receipt)
      const row = {
        property_id: orNull(values.property_id),
        category: values.category,
        description: values.description.trim(),
        amount: Number(values.amount),
        expense_date: values.expense_date,
        payment_method: values.payment_method,
        supplier: orNull(values.supplier),
        notes: orNull(values.notes),
        ...(receiptPath && { receipt_path: receiptPath }),
      }
      try {
        if (id) {
          const { error } = await supabase.from('expenses').update(row).eq('id', id)
          if (error) throw error
        } else {
          const { error } = await supabase.from('expenses').upsert(
            {
              ...row,
              id: expenseId,
              organization_id: orgId,
              client_request_id: requestId ?? null,
              maintenance_request_id: maintenanceRequestId ?? null,
            },
            { onConflict: 'organization_id,client_request_id', ignoreDuplicates: true },
          )
          if (error) throw error
        }
      } catch (e) {
        if (receiptPath) await removeFile('receipts', receiptPath).catch(() => undefined)
        throw e
      }
      return expenseId
    },
    onSuccess: invalidate,
  })
}

export function useVoidExpense() {
  const invalidate = useInvalidateFinance()
  return useMutation({
    mutationFn: async ({ id, reason }: { id: string; reason: string }) => {
      const { error } = await supabase.from('expenses').update({ status: 'void', void_reason: reason }).eq('id', id)
      if (error) throw error
    },
    onSuccess: invalidate,
  })
}

export function useSaveCategory() {
  const { orgId } = useOrg()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (v: { id?: string; name: string; include_in_operating_income: boolean; is_active?: boolean }) => {
      if (v.id) {
        const { error } = await supabase
          .from('expense_categories')
          .update({ name: v.name, include_in_operating_income: v.include_in_operating_income, is_active: v.is_active ?? true })
          .eq('id', v.id)
        if (error) throw error
      } else {
        const code = v.name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 40) || 'category'
        const { error } = await supabase.from('expense_categories').insert({
          organization_id: orgId,
          code: `${code}_${Date.now().toString(36).slice(-4)}`,
          name: v.name,
          include_in_operating_income: v.include_in_operating_income,
          sort_order: 100,
        })
        if (error) throw error
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: financeKeys.categories(orgId) }),
  })
}
