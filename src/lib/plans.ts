/**
 * Subscription plans as shown on the landing page and the billing screen. The database
 * (public.subscription_plans) is the source of truth for what a payment request is worth;
 * tests/integration/subscriptions.test.ts asserts these stay identical.
 */
export type PlanCode = 'monthly' | 'annual'

export interface Plan {
  code: PlanCode
  name: string
  /** KES, whole shillings */
  price: number
  per: 'month' | 'year'
}

export const PLANS: Plan[] = [
  { code: 'monthly', name: 'Monthly', price: 2999, per: 'month' },
  { code: 'annual', name: 'Annual', price: 32900, per: 'year' },
]

export const TRIAL_DAYS = 14

/** What the annual plan saves compared with twelve monthly payments. */
export function annualSaving(): number {
  const monthly = PLANS.find((p) => p.code === 'monthly')!.price
  const annual = PLANS.find((p) => p.code === 'annual')!.price
  return monthly * 12 - annual
}

export function planByCode(code: string | null | undefined): Plan | undefined {
  return PLANS.find((p) => p.code === code)
}
