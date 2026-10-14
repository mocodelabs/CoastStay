import { z } from 'zod'
import { centsToDecimal, toCents } from '@/lib/currency'
import type { Database } from '@/types/database'
import { isoDate, optionalText, positiveMoney } from './common'
import { PAYMENT_METHODS } from './booking'

type ExpenseRow = Database['public']['Tables']['expenses']['Row']

export const expenseSchema = z.object({
  property_id: z.string(),
  category: z.string().min(1, 'Choose a category.'),
  description: z.string().trim().min(2, 'Describe the expense.').max(300),
  amount: positiveMoney('Amount'),
  expense_date: isoDate('Choose the expense date.'),
  payment_method: z.enum(PAYMENT_METHODS),
  supplier: optionalText(120),
  notes: optionalText(2000),
})
export type ExpenseFormValues = z.infer<typeof expenseSchema>

export function expenseToForm(e: ExpenseRow): ExpenseFormValues {
  return {
    property_id: e.property_id ?? '',
    category: e.category,
    description: e.description,
    amount: centsToDecimal(toCents(e.amount)),
    expense_date: e.expense_date,
    payment_method: e.payment_method,
    supplier: e.supplier ?? '',
    notes: e.notes ?? '',
  }
}
