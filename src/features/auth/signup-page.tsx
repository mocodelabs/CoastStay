import { zodResolver } from '@hookform/resolvers/zod'
import { MailCheck } from 'lucide-react'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router'
import { Field, FormError } from '@/components/forms/field'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { toUserMessage } from '@/lib/errors'
import { appUrl, supabase } from '@/lib/supabase'
import { signupSchema, type SignupValues } from '@/schemas/auth'
import { AuthLayout } from './auth-layout'
import { useAuth } from './auth-provider'
import { safeNext } from './login-page'

export function SignupPage() {
  const { user, loading } = useAuth()
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const next = safeNext(params.get('next'))
  const [formError, setFormError] = useState<string | null>(null)
  const [sentTo, setSentTo] = useState<string | null>(null)
  const form = useForm<SignupValues>({
    resolver: zodResolver(signupSchema),
    defaultValues: { fullName: '', email: params.get('email') ?? '', password: '', confirmPassword: '' },
  })

  if (!loading && user && !sentTo) return <Navigate to={next === '/' ? '/onboarding' : next} replace />

  async function onSubmit(values: SignupValues) {
    setFormError(null)
    const { data, error } = await supabase.auth.signUp({
      email: values.email,
      password: values.password,
      options: {
        data: { full_name: values.fullName },
        emailRedirectTo: appUrl(`/login?next=${encodeURIComponent(next)}`),
      },
    })
    if (error) {
      setFormError(toUserMessage(error))
      return
    }
    if (data.session) {
      navigate(next === '/' ? '/onboarding' : next, { replace: true })
    } else {
      // Email confirmation is enabled: the account becomes usable after the link is clicked.
      setSentTo(values.email)
    }
  }

  if (sentTo) {
    return (
      <AuthLayout title="Check your email">
        <div className="space-y-4 rounded-lg border bg-surface p-5 text-sm">
          <MailCheck className="size-8 text-primary" />
          <p>
            We sent a confirmation link to <strong>{sentTo}</strong>. Open it to activate your account, then sign in.
          </p>
          <Button asChild variant="outline" className="w-full">
            <Link to={`/login?next=${encodeURIComponent(next)}`}>Back to sign in</Link>
          </Button>
        </div>
      </AuthLayout>
    )
  }

  const { errors, isSubmitting } = form.formState
  return (
    <AuthLayout
      title="Create your account"
      subtitle="Start your 14-day free trial — no card needed. Joining a team? Use the email your invitation was sent to."
    >
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4" noValidate>
        <FormError message={formError} />
        <Field label="Full name" error={errors.fullName?.message} required>
          <Input autoComplete="name" {...form.register('fullName')} />
        </Field>
        <Field label="Email" error={errors.email?.message} required>
          <Input type="email" autoComplete="email" inputMode="email" {...form.register('email')} />
        </Field>
        <Field label="Password" error={errors.password?.message} hint="At least 8 characters, with letters and numbers." required>
          <Input type="password" autoComplete="new-password" {...form.register('password')} />
        </Field>
        <Field label="Confirm password" error={errors.confirmPassword?.message} required>
          <Input type="password" autoComplete="new-password" {...form.register('confirmPassword')} />
        </Field>
        <Button type="submit" className="w-full" size="lg" loading={isSubmitting}>
          Create account
        </Button>
      </form>
      <p className="text-center text-sm text-muted-foreground">
        Already have an account?{' '}
        <Link to={`/login${params.toString() ? `?${params.toString()}` : ''}`} className="font-medium text-primary hover:underline">
          Sign in
        </Link>
      </p>
    </AuthLayout>
  )
}
