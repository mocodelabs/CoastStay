import { zodResolver } from '@hookform/resolvers/zod'
import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { toast } from 'sonner'
import { ListSkeleton, QueryState } from '@/components/feedback/states'
import { Field, FormError } from '@/components/forms/field'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/primitives'
import { useAuth } from '@/features/auth/auth-provider'
import { useOrg } from '@/features/workspace/workspace-provider'
import { toUserMessage } from '@/lib/errors'
import { ROLE_LABELS } from '@/lib/permissions'
import { formatPhone } from '@/lib/phone'
import { supabase } from '@/lib/supabase'
import { newPasswordSchema, type NewPasswordValues } from '@/schemas/auth'
import { profileSchema, type ProfileValues } from '@/schemas/settings'
import { useProfile, useUpdateProfile } from './api'

function ProfileForm({ initial }: { initial: ProfileValues }) {
  const update = useUpdateProfile()
  const form = useForm<ProfileValues>({ resolver: zodResolver(profileSchema), defaultValues: initial })
  useEffect(() => form.reset(initial), [initial, form])

  const { errors, isDirty } = form.formState
  return (
    <form
      noValidate
      className="space-y-4"
      onSubmit={form.handleSubmit((v) =>
        update.mutate(v, {
          onSuccess: () => toast.success('Profile saved.'),
          onError: (e) => toast.error(toUserMessage(e)),
        }),
      )}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Full name" error={errors.full_name?.message} required>
          <Input autoComplete="name" {...form.register('full_name')} />
        </Field>
        <Field label="Phone" error={errors.phone?.message} hint="Used by colleagues to reach you.">
          <Input type="tel" inputMode="tel" autoComplete="tel" {...form.register('phone')} />
        </Field>
      </div>
      <Button type="submit" loading={update.isPending} disabled={!isDirty}>
        Save profile
      </Button>
    </form>
  )
}

function PasswordForm() {
  const [error, setError] = useState<string | null>(null)
  const form = useForm<NewPasswordValues>({
    resolver: zodResolver(newPasswordSchema),
    defaultValues: { password: '', confirmPassword: '' },
  })
  async function onSubmit({ password }: NewPasswordValues) {
    setError(null)
    const { error: e } = await supabase.auth.updateUser({ password })
    if (e) {
      setError(toUserMessage(e))
      return
    }
    form.reset()
    toast.success('Password changed.')
  }
  const { errors, isSubmitting } = form.formState
  return (
    <form noValidate onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
      <FormError message={error} />
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="New password" error={errors.password?.message} hint="At least 8 characters, letters and numbers." required>
          <Input type="password" autoComplete="new-password" {...form.register('password')} />
        </Field>
        <Field label="Confirm new password" error={errors.confirmPassword?.message} required>
          <Input type="password" autoComplete="new-password" {...form.register('confirmPassword')} />
        </Field>
      </div>
      <Button type="submit" variant="outline" loading={isSubmitting}>
        Change password
      </Button>
    </form>
  )
}

export function ProfileSettings() {
  const { user } = useAuth()
  const { role, org } = useOrg()
  const profile = useProfile()
  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>My profile</CardTitle>
          <CardDescription>
            {user?.email} · {ROLE_LABELS[role]} at {org.name}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <QueryState query={profile} loading={<ListSkeleton rows={1} />}>
            {(p) => (
              <ProfileForm
                initial={{ full_name: p.full_name, phone: p.phone ? formatPhone(p.phone).replace(/\s/g, ' ') : '' }}
              />
            )}
          </QueryState>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Password</CardTitle>
          <CardDescription>Choose a strong password you don’t use elsewhere.</CardDescription>
        </CardHeader>
        <CardContent>
          <PasswordForm />
        </CardContent>
      </Card>
    </div>
  )
}
