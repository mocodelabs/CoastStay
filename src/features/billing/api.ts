import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { PlanCode } from '@/lib/plans'

export type SubscriptionState = 'trialing' | 'active' | 'expired'

export interface SubscriptionStatus {
  state: SubscriptionState
  plan: PlanCode | null
  trial_ends_at: string
  current_period_end: string | null
  days_left: number
  can_manage: boolean
  pending_request: boolean
}

export const billingKeys = {
  status: (orgId: string) => ['subscription-status', orgId] as const,
  requests: (orgId: string) => ['subscription-requests', orgId] as const,
  instructions: ['billing-instructions'] as const,
  platform: ['platform-billing'] as const,
}

export function useSubscriptionStatus(orgId: string) {
  return useQuery({
    queryKey: billingKeys.status(orgId),
    queryFn: async (): Promise<SubscriptionStatus | null> => {
      const { data, error } = await supabase.rpc('subscription_status', { org: orgId })
      if (error) throw error
      return (data[0] as SubscriptionStatus | undefined) ?? null
    },
    staleTime: 5 * 60_000,
  })
}

export function useBillingInstructions() {
  return useQuery({
    queryKey: billingKeys.instructions,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('billing_instructions')
      if (error) throw error
      return data
    },
    staleTime: 30 * 60_000,
  })
}

export function usePaymentRequests(orgId: string) {
  return useQuery({
    queryKey: billingKeys.requests(orgId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('subscription_payment_requests')
        .select('id, plan, amount, method, reference, status, submitted_at, reviewed_at, review_note, period_end')
        .eq('organization_id', orgId)
        .order('submitted_at', { ascending: false })
        .limit(20)
      if (error) throw error
      return data
    },
  })
}

export function useRequestPayment(orgId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (v: { plan: PlanCode; method: 'mpesa' | 'bank'; reference: string }) => {
      const { data, error } = await supabase.rpc('request_subscription_payment', {
        org: orgId,
        plan_code: v.plan,
        pay_method: v.method,
        pay_reference: v.reference,
      })
      if (error) throw error
      return data
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: billingKeys.requests(orgId) })
      void qc.invalidateQueries({ queryKey: billingKeys.status(orgId) })
    },
  })
}

// ---------------------------------------------------------------------------
// Platform administration
// ---------------------------------------------------------------------------

export function useIsPlatformAdmin(enabled = true) {
  return useQuery({
    queryKey: ['is-platform-admin'],
    enabled,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('is_platform_admin')
      if (error) throw error
      return data
    },
    staleTime: 30 * 60_000,
  })
}

export function usePlatformBilling() {
  return useQuery({
    queryKey: billingKeys.platform,
    queryFn: async () => {
      const [subs, requests] = await Promise.all([supabase.rpc('platform_subscriptions'), supabase.rpc('platform_payment_requests')])
      if (subs.error) throw subs.error
      if (requests.error) throw requests.error
      return { subscriptions: subs.data, requests: requests.data }
    },
  })
}

export function useReviewPayment() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (v: { id: string; approve: boolean; note?: string }) => {
      const { data, error } = await supabase.rpc('review_subscription_payment', {
        request_id: v.id,
        approve: v.approve,
        note: v.note || undefined,
      })
      if (error) throw error
      return data
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: billingKeys.platform }),
  })
}
