import { zodResolver } from '@hookform/resolvers/zod'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router'
import { Field, FormError } from '@/components/forms/field'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { toUserMessage } from '@/lib/errors'
import { supabase } from '@/lib/supabase'
import { loginSchema, type LoginValues } from '@/schemas/auth'
import { AuthLayout } from './auth-layout'
import { useAuth } from './auth-provider'

/** Only allow same-app relative redirects. */
export function safeNext(next: string | null): string {
  return next && next.startsWith('/') && !next.startsWith('//') ? next : '/'
}

export function LoginPage() {
  const { user, loading } = useAuth()
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const next = safeNext(params.get('next'))
  const [formError, setFormError] = useState<string | null>(null)
  const form = useForm<LoginValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: params.get('email') ?? '', password: '' },
  })

  if (!loading && user) return <Navigate to={next} replace />

  async function onSubmit(values: LoginValues) {
    setFormError(null)
    const { error } = await supabase.auth.signInWithPassword(values)
    if (error) {
      setFormError(toUserMessage(error))
      return
    }
    navigate(next, { replace: true })
  }

  const { errors, isSubmitting } = form.formState
  return (
    <AuthLayout title="Sign in" subtitle="Welcome back to CoastStay.">
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4" noValidate>
        <FormError message={formError} />
        <Field label="Email" error={errors.email?.message} required>
          <Input type="email" autoComplete="email" inputMode="email" {...form.register('email')} />
        </Field>
        <Field label="Password" error={errors.password?.message} required>
          <Input type="password" autoComplete="current-password" {...form.register('password')} />
        </Field>
        <div className="flex justify-end">
          <Link to="/forgot-password" className="text-sm font-medium text-primary hover:underline">
            Forgot password?
          </Link>
        </div>
        <Button type="submit" className="w-full" size="lg" loading={isSubmitting}>
          Sign in
        </Button>
      </form>
      <p className="text-center text-sm text-muted-foreground">
        New here?{' '}
        <Link to={`/signup${params.toString() ? `?${params.toString()}` : ''}`} className="font-medium text-primary hover:underline">
          Create an account
        </Link>
      </p>
    </AuthLayout>
  )
}
