import { zodResolver } from '@hookform/resolvers/zod'
import { KeyRound, MailCheck } from 'lucide-react'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { Link, useNavigate } from 'react-router'
import { toast } from 'sonner'
import { FullPageSpinner } from '@/app/guards'
import { Field, FormError } from '@/components/forms/field'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { toUserMessage } from '@/lib/errors'
import { appUrl, supabase } from '@/lib/supabase'
import { forgotSchema, newPasswordSchema, type ForgotValues, type NewPasswordValues } from '@/schemas/auth'
import { AuthLayout } from './auth-layout'
import { useAuth } from './auth-provider'

export function ForgotPasswordPage() {
  const [sent, setSent] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const form = useForm<ForgotValues>({ resolver: zodResolver(forgotSchema), defaultValues: { email: '' } })

  async function onSubmit({ email }: ForgotValues) {
    setFormError(null)
    const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: appUrl('/reset-password') })
    // Do not reveal whether an account exists; only surface rate-limit / network problems.
    if (error && (error.status === 429 || /fetch/i.test(error.message))) {
      setFormError(toUserMessage(error))
      return
    }
    setSent(true)
  }

  return (
    <AuthLayout title="Reset your password" subtitle="We’ll email you a link to choose a new password.">
      {sent ? (
        <div className="space-y-4 rounded-lg border bg-surface p-5 text-sm">
          <MailCheck className="size-8 text-primary" />
          <p>If an account exists for that email, a reset link is on its way. The link expires after one hour.</p>
          <Button asChild variant="outline" className="w-full">
            <Link to="/login">Back to sign in</Link>
          </Button>
        </div>
      ) : (
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4" noValidate>
          <FormError message={formError} />
          <Field label="Email" error={form.formState.errors.email?.message} required>
            <Input type="email" autoComplete="email" inputMode="email" {...form.register('email')} />
          </Field>
          <Button type="submit" className="w-full" size="lg" loading={form.formState.isSubmitting}>
            Send reset link
          </Button>
          <p className="text-center text-sm">
            <Link to="/login" className="font-medium text-primary hover:underline">
              Back to sign in
            </Link>
          </p>
        </form>
      )}
    </AuthLayout>
  )
}

export function ResetPasswordPage() {
  const { user, loading } = useAuth()
  const navigate = useNavigate()
  const [formError, setFormError] = useState<string | null>(null)
  const form = useForm<NewPasswordValues>({
    resolver: zodResolver(newPasswordSchema),
    defaultValues: { password: '', confirmPassword: '' },
  })

  if (loading) return <FullPageSpinner />

  if (!user) {
    return (
      <AuthLayout title="Link expired" subtitle="This password-reset link is invalid or has expired.">
        <Button asChild className="w-full">
          <Link to="/forgot-password">Request a new link</Link>
        </Button>
      </AuthLayout>
    )
  }

  async function onSubmit({ password }: NewPasswordValues) {
    setFormError(null)
    const { error } = await supabase.auth.updateUser({ password })
    if (error) {
      setFormError(toUserMessage(error))
      return
    }
    toast.success('Password updated.')
    navigate('/', { replace: true })
  }

  const { errors, isSubmitting } = form.formState
  return (
    <AuthLayout title="Choose a new password" subtitle={`For ${user.email}`}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4" noValidate>
        <FormError message={formError} />
        <Field label="New password" error={errors.password?.message} hint="At least 8 characters, with letters and numbers." required>
          <Input type="password" autoComplete="new-password" {...form.register('password')} />
        </Field>
        <Field label="Confirm new password" error={errors.confirmPassword?.message} required>
          <Input type="password" autoComplete="new-password" {...form.register('confirmPassword')} />
        </Field>
        <Button type="submit" className="w-full" size="lg" loading={isSubmitting}>
          <KeyRound /> Update password
        </Button>
      </form>
    </AuthLayout>
  )
}
