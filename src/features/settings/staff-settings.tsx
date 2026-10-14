import { zodResolver } from '@hookform/resolvers/zod'
import { Copy, Link2, MailPlus, MessageCircle, MoreVertical, RefreshCw, ShieldCheck, Trash2, UserCog, UserMinus, UserPlus } from 'lucide-react'
import { useState } from 'react'
import { Controller, useForm, useWatch } from 'react-hook-form'
import { toast } from 'sonner'
import { ConfirmDialog } from '@/components/feedback/confirm-dialog'
import { EmptyState, ListSkeleton, QueryState } from '@/components/feedback/states'
import { Field, FormError } from '@/components/forms/field'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input, NativeSelect } from '@/components/ui/input'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/menu'
import { Avatar, Badge, Card, CardContent, CardDescription, CardHeader, CardTitle, Checkbox, Label } from '@/components/ui/primitives'
import { useAuth } from '@/features/auth/auth-provider'
import { useOrg } from '@/features/workspace/workspace-provider'
import { formatDateTime } from '@/lib/date-utils'
import { toUserMessage } from '@/lib/errors'
import { FULL_SCOPE_ROLES, ROLE_DESCRIPTIONS, ROLE_LABELS, type Role } from '@/lib/permissions'
import { appUrl } from '@/lib/supabase'
import { inviteSchema, ROLES, type InviteValues } from '@/schemas/settings'
import {
  type StaffMember,
  useCreateInvitation,
  useInvitations,
  usePropertyOptions,
  useRemoveMember,
  useRevokeInvitation,
  useSetAssignments,
  useStaff,
  useUpdateMember,
} from './api'

const ROLE_TONE: Record<Role, 'ocean' | 'info' | 'warning' | 'success'> = {
  owner: 'ocean',
  manager: 'info',
  housekeeping: 'success',
  finance: 'warning',
}

function PropertyChecklist({
  value,
  onChange,
  idPrefix,
}: {
  value: string[]
  onChange: (ids: string[]) => void
  idPrefix: string
}) {
  const properties = usePropertyOptions()
  return (
    <QueryState
      query={properties}
      loading={<ListSkeleton rows={2} />}
      empty={<p className="text-sm text-muted-foreground">No properties yet — you can assign properties after adding them.</p>}
    >
      {(list) => (
        <fieldset className="max-h-48 space-y-2 overflow-y-auto rounded-md border p-3">
          <legend className="sr-only">Assigned properties</legend>
          {list.map((p) => (
            <div key={p.id} className="flex items-center gap-2.5">
              <Checkbox
                id={`${idPrefix}-${p.id}`}
                checked={value.includes(p.id)}
                onCheckedChange={(c) => onChange(c ? [...value, p.id] : value.filter((x) => x !== p.id))}
              />
              <Label htmlFor={`${idPrefix}-${p.id}`} className="font-normal">
                {p.name}
                {p.status === 'inactive' && <span className="ml-1 text-muted-foreground">(inactive)</span>}
              </Label>
            </div>
          ))}
        </fieldset>
      )}
    </QueryState>
  )
}

function RoleFields({
  role,
  canViewFinances,
  onFinanceChange,
  propertyIds,
  onPropertiesChange,
  idPrefix,
}: {
  role: Role
  canViewFinances: boolean
  onFinanceChange: (v: boolean) => void
  propertyIds: string[]
  onPropertiesChange: (ids: string[]) => void
  idPrefix: string
}) {
  return (
    <>
      <p className="rounded-md bg-sand-50 px-3 py-2 text-sm text-muted-foreground">{ROLE_DESCRIPTIONS[role]}</p>
      {role === 'manager' && (
        <div className="flex items-start gap-2.5">
          <Checkbox id={`${idPrefix}-fin`} checked={canViewFinances} onCheckedChange={(c) => onFinanceChange(c === true)} />
          <Label htmlFor={`${idPrefix}-fin`} className="font-normal">
            Allow access to payments, expenses and financial reports
          </Label>
        </div>
      )}
      {FULL_SCOPE_ROLES.includes(role) ? (
        <p className="text-sm text-muted-foreground">This role can see all properties.</p>
      ) : (
        <div className="space-y-2">
          <Label>Assigned properties</Label>
          <PropertyChecklist value={propertyIds} onChange={onPropertiesChange} idPrefix={idPrefix} />
          <p className="text-xs text-muted-foreground">Staff in this role only see the properties ticked here.</p>
        </div>
      )}
    </>
  )
}

function InvitationLinkPanel({ email, token, onDone }: { email: string; token: string; onDone: () => void }) {
  const link = appUrl(`/accept-invite?token=${token}`)
  const message = `You've been invited to join our team on CoastStay. Create your account with ${email} using this link (valid for 7 days): ${link}`
  return (
    <div className="space-y-4">
      <div className="rounded-md border border-success/20 bg-success-soft p-3 text-sm text-success">
        Invitation created for <strong>{email}</strong>. Share this link with them — it is shown only once.
      </div>
      <div className="flex gap-2">
        <Input readOnly value={link} aria-label="Invitation link" onFocus={(e) => e.currentTarget.select()} />
        <Button
          variant="outline"
          size="icon"
          aria-label="Copy link"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(link)
              toast.success('Link copied.')
            } catch {
              toast.error('Copy failed — select the link and copy it manually.')
            }
          }}
        >
          <Copy />
        </Button>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button asChild variant="outline">
          <a href={`https://wa.me/?text=${encodeURIComponent(message)}`} target="_blank" rel="noreferrer">
            <MessageCircle /> Share on WhatsApp
          </a>
        </Button>
        <Button asChild variant="outline">
          <a href={`mailto:${encodeURIComponent(email)}?subject=${encodeURIComponent('Your CoastStay invitation')}&body=${encodeURIComponent(message)}`}>
            <MailPlus /> Send by email
          </a>
        </Button>
      </div>
      <DialogFooter>
        <Button onClick={onDone}>Done</Button>
      </DialogFooter>
    </div>
  )
}

function InviteDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const create = useCreateInvitation()
  const [result, setResult] = useState<{ email: string; token: string } | null>(null)
  const form = useForm<InviteValues>({
    resolver: zodResolver(inviteSchema),
    defaultValues: { email: '', full_name: '', role: 'housekeeping', can_view_finances: false, property_ids: [] },
  })
  const role = useWatch({ control: form.control, name: 'role' })
  const canViewFinances = useWatch({ control: form.control, name: 'can_view_finances' })

  function close(o: boolean) {
    onOpenChange(o)
    if (!o) {
      setResult(null)
      form.reset()
      create.reset()
    }
  }

  const { errors } = form.formState
  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Invite a staff member</DialogTitle>
          <DialogDescription>They’ll create their own password using the invitation link.</DialogDescription>
        </DialogHeader>
        {result ? (
          <InvitationLinkPanel email={result.email} token={result.token} onDone={() => close(false)} />
        ) : (
          <form
            noValidate
            className="space-y-4"
            onSubmit={form.handleSubmit((v) =>
              create.mutate(v, { onSuccess: (row) => setResult({ email: v.email, token: row.token }) }),
            )}
          >
            <FormError message={create.isError ? toUserMessage(create.error) : null} />
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Email" error={errors.email?.message} required>
                <Input type="email" inputMode="email" autoComplete="off" {...form.register('email')} />
              </Field>
              <Field label="Name" error={errors.full_name?.message}>
                <Input autoComplete="off" {...form.register('full_name')} />
              </Field>
            </div>
            <Field label="Role" error={errors.role?.message} required>
              <NativeSelect {...form.register('role')}>
                {ROLES.map((r) => (
                  <option key={r} value={r}>
                    {ROLE_LABELS[r]}
                  </option>
                ))}
              </NativeSelect>
            </Field>
            <Controller
              control={form.control}
              name="property_ids"
              render={({ field }) => (
                <RoleFields
                  role={role}
                  canViewFinances={canViewFinances}
                  onFinanceChange={(v) => form.setValue('can_view_finances', v)}
                  propertyIds={field.value}
                  onPropertiesChange={field.onChange}
                  idPrefix="invite"
                />
              )}
            />
            <DialogFooter>
              <Button variant="outline" onClick={() => close(false)} disabled={create.isPending}>
                Cancel
              </Button>
              <Button type="submit" loading={create.isPending}>
                <Link2 /> Create invitation link
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  )
}

function EditAccessDialog({ member, onOpenChange }: { member: StaffMember | null; onOpenChange: (o: boolean) => void }) {
  return (
    <Dialog open={member !== null} onOpenChange={onOpenChange}>
      <DialogContent>
        {member && <EditAccessForm key={member.id} member={member} onClose={() => onOpenChange(false)} />}
      </DialogContent>
    </Dialog>
  )
}

function EditAccessForm({ member, onClose }: { member: StaffMember; onClose: () => void }) {
  const updateMember = useUpdateMember()
  const setAssignments = useSetAssignments()
  const [role, setRole] = useState<Role>(member.role)
  const [finance, setFinance] = useState(member.can_view_finances)
  const [propertyIds, setPropertyIds] = useState(member.property_ids)
  const [error, setError] = useState<string | null>(null)
  const saving = updateMember.isPending || setAssignments.isPending

  async function save() {
    setError(null)
    try {
      await updateMember.mutateAsync({ id: member.id, role, can_view_finances: role === 'manager' && finance })
      if (!FULL_SCOPE_ROLES.includes(role)) {
        await setAssignments.mutateAsync({ userId: member.user_id, current: member.property_ids, next: propertyIds })
      }
      toast.success('Access updated.')
      onClose()
    } catch (e) {
      setError(toUserMessage(e))
    }
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>Edit access</DialogTitle>
        <DialogDescription>{member.profile?.full_name || member.profile?.email}</DialogDescription>
      </DialogHeader>
      <div className="space-y-4">
        <FormError message={error} />
        <Field label="Role">
          <NativeSelect value={role} onChange={(e) => setRole(e.target.value as Role)}>
            {ROLES.map((r) => (
              <option key={r} value={r}>
                {ROLE_LABELS[r]}
              </option>
            ))}
          </NativeSelect>
        </Field>
        <RoleFields
          role={role}
          canViewFinances={finance}
          onFinanceChange={setFinance}
          propertyIds={propertyIds}
          onPropertiesChange={setPropertyIds}
          idPrefix={`edit-${member.id}`}
        />
      </div>
      <DialogFooter>
        <Button variant="outline" onClick={onClose} disabled={saving}>
          Cancel
        </Button>
        <Button onClick={save} loading={saving}>
          Save access
        </Button>
      </DialogFooter>
    </>
  )
}

export function StaffSettings() {
  const { user } = useAuth()
  const { org } = useOrg()
  const staff = useStaff()
  const invitations = useInvitations()
  const properties = usePropertyOptions()
  const updateMember = useUpdateMember()
  const removeMember = useRemoveMember()
  const revoke = useRevokeInvitation()
  const createInvite = useCreateInvitation()
  const [inviteOpen, setInviteOpen] = useState(false)
  const [editing, setEditing] = useState<StaffMember | null>(null)
  const [removing, setRemoving] = useState<StaffMember | null>(null)
  const [reissued, setReissued] = useState<{ email: string; token: string } | null>(null)

  const propertyName = (id: string) => properties.data?.find((p) => p.id === id)?.name

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="sm:flex-row sm:items-center sm:justify-between">
          <div>
            <CardTitle>Team</CardTitle>
            <CardDescription>People with access to {org.name}. Access is enforced by the database, not just hidden.</CardDescription>
          </div>
          <Button onClick={() => setInviteOpen(true)}>
            <UserPlus /> Invite staff
          </Button>
        </CardHeader>
        <CardContent>
          <QueryState query={staff} loading={<ListSkeleton rows={3} />}>
            {(members) => (
              <ul className="divide-y rounded-md border">
                {members.map((m) => {
                  const isSelf = m.user_id === user?.id
                  const scoped = !FULL_SCOPE_ROLES.includes(m.role)
                  return (
                    <li key={m.id} className="flex flex-wrap items-center gap-3 p-3">
                      <Avatar name={m.profile?.full_name || m.profile?.email} />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">
                          {m.profile?.full_name || 'Unnamed'} {isSelf && <span className="text-muted-foreground">(you)</span>}
                        </p>
                        <p className="truncate text-xs text-muted-foreground">{m.profile?.email}</p>
                        {scoped && (
                          <p className="mt-0.5 truncate text-xs text-muted-foreground">
                            {m.property_ids.length === 0
                              ? 'No properties assigned'
                              : m.property_ids.map((id) => propertyName(id) ?? 'Property').join(', ')}
                          </p>
                        )}
                      </div>
                      <div className="flex flex-wrap items-center gap-1.5">
                        <Badge tone={ROLE_TONE[m.role]}>{ROLE_LABELS[m.role]}</Badge>
                        {m.role === 'manager' && m.can_view_finances && (
                          <Badge tone="muted">
                            <ShieldCheck className="size-3" /> Finances
                          </Badge>
                        )}
                        {m.status === 'suspended' && <Badge tone="danger">Suspended</Badge>}
                      </div>
                      {!isSelf && (
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon-sm" aria-label={`Actions for ${m.profile?.full_name ?? 'staff member'}`}>
                              <MoreVertical />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent>
                            <DropdownMenuItem onSelect={() => setEditing(m)}>
                              <UserCog /> Edit role & properties
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onSelect={() =>
                                updateMember.mutate(
                                  { id: m.id, status: m.status === 'active' ? 'suspended' : 'active' },
                                  {
                                    onSuccess: () => toast.success(m.status === 'active' ? 'Access suspended.' : 'Access restored.'),
                                    onError: (e) => toast.error(toUserMessage(e)),
                                  },
                                )
                              }
                            >
                              <UserMinus /> {m.status === 'active' ? 'Suspend access' : 'Restore access'}
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem destructive onSelect={() => setRemoving(m)}>
                              <Trash2 /> Remove from business
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      )}
                    </li>
                  )
                })}
              </ul>
            )}
          </QueryState>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Pending invitations</CardTitle>
          <CardDescription>Invitation links expire after 7 days. Issuing a new link cancels the old one.</CardDescription>
        </CardHeader>
        <CardContent>
          <QueryState
            query={invitations}
            loading={<ListSkeleton rows={1} />}
            empty={<EmptyState icon={MailPlus} title="No pending invitations" className="py-8" />}
          >
            {(list) => (
              <ul className="divide-y rounded-md border">
                {list.map((inv) => {
                  const expired = new Date(inv.expires_at) < new Date()
                  return (
                    <li key={inv.id} className="flex flex-wrap items-center gap-3 p-3">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">{inv.full_name || inv.email}</p>
                        <p className="truncate text-xs text-muted-foreground">
                          {inv.email} · {expired ? 'expired' : `expires ${formatDateTime(inv.expires_at)}`}
                        </p>
                      </div>
                      <Badge tone={ROLE_TONE[inv.role]}>{ROLE_LABELS[inv.role]}</Badge>
                      {expired && <Badge tone="danger">Expired</Badge>}
                      <Button
                        variant="outline"
                        size="sm"
                        loading={createInvite.isPending && createInvite.variables?.email === inv.email}
                        onClick={() =>
                          createInvite.mutate(
                            {
                              email: inv.email,
                              full_name: inv.full_name ?? undefined,
                              role: inv.role,
                              can_view_finances: inv.can_view_finances,
                              property_ids: inv.property_ids,
                            },
                            {
                              onSuccess: (row) => setReissued({ email: inv.email, token: row.token }),
                              onError: (e) => toast.error(toUserMessage(e)),
                            },
                          )
                        }
                      >
                        <RefreshCw /> New link
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() =>
                          revoke.mutate(inv.id, {
                            onSuccess: () => toast.success('Invitation revoked.'),
                            onError: (e) => toast.error(toUserMessage(e)),
                          })
                        }
                      >
                        Revoke
                      </Button>
                    </li>
                  )
                })}
              </ul>
            )}
          </QueryState>
        </CardContent>
      </Card>

      <InviteDialog open={inviteOpen} onOpenChange={setInviteOpen} />
      <EditAccessDialog member={editing} onOpenChange={(o) => !o && setEditing(null)} />

      <Dialog open={reissued !== null} onOpenChange={(o) => !o && setReissued(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New invitation link</DialogTitle>
          </DialogHeader>
          {reissued && <InvitationLinkPanel email={reissued.email} token={reissued.token} onDone={() => setReissued(null)} />}
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={removing !== null}
        onOpenChange={(o) => !o && setRemoving(null)}
        title="Remove staff member?"
        description={`${removing?.profile?.full_name || removing?.profile?.email} will lose access to ${org.name} immediately. Their past work stays in the history.`}
        confirmLabel="Remove"
        destructive
        onConfirm={async () => {
          try {
            await removeMember.mutateAsync(removing!.id)
            toast.success('Staff member removed.')
          } catch (e) {
            toast.error(toUserMessage(e))
            throw e
          }
        }}
      />
    </div>
  )
}
