import { useMutation, useQuery } from '@tanstack/react-query'
import { MailWarning, UserPlus } from 'lucide-react'
import { Link, useNavigate, useSearchParams } from 'react-router'
import { toast } from 'sonner'
import { FullPageSpinner } from '@/app/guards'
import { ErrorState } from '@/components/feedback/states'
import { FormError } from '@/components/forms/field'
import { Button } from '@/components/ui/button'
import { useWorkspace } from '@/features/workspace/workspace-provider'
import { toUserMessage } from '@/lib/errors'
import { ROLE_LABELS } from '@/lib/permissions'
import { supabase } from '@/lib/supabase'
import { AuthLayout } from './auth-layout'
import { useAuth } from './auth-provider'

export function AcceptInvitePage() {
  const [params] = useSearchParams()
  const token = params.get('token') ?? ''
  const { user, loading, signOut } = useAuth()
  const { refetch, switchOrg } = useWorkspace()
  const navigate = useNavigate()

  const invite = useQuery({
    queryKey: ['invitation', token],
    enabled: token.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_invitation', { invite_token: token })
      if (error) throw error
      return data?.[0] ?? null
    },
  })

  const accept = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.rpc('accept_invitation', { invite_token: token })
      if (error) throw error
      return data
    },
    onSuccess: async (orgId) => {
      await refetch()
      if (orgId) switchOrg(orgId)
      toast.success('Welcome aboard! You now have access.')
      navigate('/', { replace: true })
    },
  })

  if (loading || (token && invite.isPending)) return <FullPageSpinner />

  if (!token) {
    return (
      <AuthLayout title="Invitation link incomplete" subtitle="Open the full link from your invitation message.">
        <Button asChild variant="outline" className="w-full">
          <Link to="/login">Go to sign in</Link>
        </Button>
      </AuthLayout>
    )
  }
  if (invite.isError) {
    return (
      <AuthLayout title="Staff invitation">
        <ErrorState error={invite.error} onRetry={() => void invite.refetch()} />
      </AuthLayout>
    )
  }

  const inv = invite.data
  if (!inv || inv.state !== 'open') {
    const reason =
      inv?.state === 'accepted'
        ? 'This invitation has already been used.'
        : inv?.state === 'expired'
          ? 'This invitation has expired.'
          : 'This invitation is not valid.'
    return (
      <AuthLayout title="Invitation unavailable" subtitle={`${reason} Ask the business owner to send a new invitation.`}>
        <Button asChild variant="outline" className="w-full">
          <Link to="/login">Go to sign in</Link>
        </Button>
      </AuthLayout>
    )
  }

  const next = `/accept-invite?token=${encodeURIComponent(token)}`
  const emailMatches = user?.email?.toLowerCase() === inv.email.toLowerCase()

  return (
    <AuthLayout
      title={`Join ${inv.organization_name}`}
      subtitle={
        <>
          You’ve been invited as <strong>{ROLE_LABELS[inv.role]}</strong> using <strong>{inv.email}</strong>.
        </>
      }
    >
      {!user ? (
        <div className="space-y-3">
          <Button asChild size="lg" className="w-full">
            <Link to={`/signup?next=${encodeURIComponent(next)}&email=${encodeURIComponent(inv.email)}`}>
              <UserPlus /> Create my account
            </Link>
          </Button>
          <Button asChild variant="outline" className="w-full">
            <Link to={`/login?next=${encodeURIComponent(next)}&email=${encodeURIComponent(inv.email)}`}>
              I already have an account
            </Link>
          </Button>
        </div>
      ) : emailMatches ? (
        <div className="space-y-3">
          <FormError message={accept.isError ? toUserMessage(accept.error) : null} />
          <Button size="lg" className="w-full" loading={accept.isPending} onClick={() => accept.mutate()}>
            Accept invitation
          </Button>
        </div>
      ) : (
        <div className="space-y-4 rounded-lg border border-warning/20 bg-warning-soft p-4 text-sm">
          <MailWarning className="size-6 text-warning" />
          <p>
            You’re signed in as <strong>{user.email}</strong>, but this invitation is for <strong>{inv.email}</strong>.
          </p>
          <Button
            variant="outline"
            className="w-full"
            onClick={async () => {
              await signOut()
              navigate(`/login?next=${encodeURIComponent(next)}&email=${encodeURIComponent(inv.email)}`)
            }}
          >
            Sign out and switch account
          </Button>
        </div>
      )}
    </AuthLayout>
  )
}
