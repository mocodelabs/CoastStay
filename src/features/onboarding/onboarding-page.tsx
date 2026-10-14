import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQuery } from '@tanstack/react-query'
import { Building2, LogOut, MailQuestion } from 'lucide-react'
import { useForm } from 'react-hook-form'
import { Navigate, useNavigate } from 'react-router'
import { toast } from 'sonner'
import { z } from 'zod'
import { FullPageSpinner } from '@/app/guards'
import { ErrorState } from '@/components/feedback/states'
import { Field, FormError } from '@/components/forms/field'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { AuthLayout } from '@/features/auth/auth-layout'
import { useAuth } from '@/features/auth/auth-provider'
import { useWorkspace } from '@/features/workspace/workspace-provider'
import { toUserMessage } from '@/lib/errors'
import { normalizePhone } from '@/lib/phone'
import { supabase } from '@/lib/supabase'

const businessSchema = z.object({
  name: z.string().trim().min(2, 'Enter your business name.').max(120),
  phone: z
    .string()
    .trim()
    .optional()
    .refine((v) => !v || normalizePhone(v).ok, 'Enter a valid phone number, e.g. 0712 345 678.'),
  email: z.union([z.literal(''), z.string().trim().email('Enter a valid email address.')]).optional(),
})
type BusinessValues = z.infer<typeof businessSchema>

export function OnboardingPage() {
  const { user, signOut } = useAuth()
  const { org, loading, refetch, switchOrg } = useWorkspace()
  const navigate = useNavigate()

  const canCreate = useQuery({
    queryKey: ['can-create-organization', user?.id],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('can_create_organization')
      if (error) throw error
      return data
    },
  })

  const form = useForm<BusinessValues>({
    resolver: zodResolver(businessSchema),
    defaultValues: { name: '', phone: '', email: user?.email ?? '' },
  })

  const create = useMutation({
    mutationFn: async (values: BusinessValues) => {
      const phone = values.phone ? normalizePhone(values.phone) : null
      const { data, error } = await supabase.rpc('create_organization', {
        org_name: values.name,
        org_contact_phone: phone && phone.ok ? phone.e164 : undefined,
        org_contact_email: values.email || undefined,
      })
      if (error) throw error
      return data
    },
    onSuccess: async (orgId) => {
      await refetch()
      switchOrg(orgId)
      toast.success('Your business is ready. Add your first property to get started.')
      navigate('/', { replace: true })
    },
  })

  if (loading || canCreate.isPending) return <FullPageSpinner />
  if (org) return <Navigate to="/" replace />

  const signOutButton = (
    <Button
      variant="ghost"
      className="w-full"
      onClick={async () => {
        await signOut()
        navigate('/login', { replace: true })
      }}
    >
      <LogOut /> Sign out
    </Button>
  )

  if (canCreate.isError) {
    return (
      <AuthLayout title="Welcome to CoastStay">
        <ErrorState error={canCreate.error} onRetry={() => void canCreate.refetch()} />
        {signOutButton}
      </AuthLayout>
    )
  }

  if (!canCreate.data) {
    return (
      <AuthLayout title="You’re not part of a business yet">
        <div className="space-y-3 rounded-lg border bg-surface p-5 text-sm">
          <MailQuestion className="size-8 text-primary" />
          <p>
            Ask the business owner to invite <strong>{user?.email}</strong> from <em>Settings → Staff</em>, then open the
            invitation link they send you.
          </p>
        </div>
        {signOutButton}
      </AuthLayout>
    )
  }

  const { errors } = form.formState
  return (
    <AuthLayout title="Set up your business" subtitle="You’ll be the owner. You can change these details later in Settings.">
      <form onSubmit={form.handleSubmit((v) => create.mutate(v))} className="space-y-4" noValidate>
        <FormError message={create.isError ? toUserMessage(create.error) : null} />
        <Field label="Business name" error={errors.name?.message} required>
          <Input placeholder="e.g. Diani Shores Stays" autoComplete="organization" {...form.register('name')} />
        </Field>
        <Field label="Business phone" error={errors.phone?.message} hint="Shown on booking confirmations.">
          <Input type="tel" inputMode="tel" placeholder="0712 345 678" {...form.register('phone')} />
        </Field>
        <Field label="Business email" error={errors.email?.message}>
          <Input type="email" inputMode="email" {...form.register('email')} />
        </Field>
        <p className="text-xs text-muted-foreground">Defaults: Kenyan Shilling (KES), Africa/Nairobi time, DD/MM/YYYY dates.</p>
        <Button type="submit" className="w-full" size="lg" loading={create.isPending}>
          <Building2 /> Create business
        </Button>
      </form>
      {signOutButton}
    </AuthLayout>
  )
}
