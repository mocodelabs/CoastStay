import { MessageCircle, Plus, Users } from 'lucide-react'
import { useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { EmptyState, ListSkeleton, QueryState } from '@/components/feedback/states'
import { SearchInput } from '@/components/forms/search-input'
import { PageHeader } from '@/components/layout/page-header'
import { Pagination } from '@/components/tables/pagination'
import { Button } from '@/components/ui/button'
import { Avatar, Badge, Card } from '@/components/ui/primitives'
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/table'
import { useOrg } from '@/features/workspace/workspace-provider'
import { useUrlFilters } from '@/hooks/use-url-state'
import { formatDate, todayISO } from '@/lib/date-utils'
import { formatPhone, whatsappLink } from '@/lib/phone'
import { useGuests } from './api'
import { GuestDialog } from './guest-form'

const FILTERS = ['q'] as const

export function GuestsPage() {
  const { can, timezone } = useOrg()
  const navigate = useNavigate()
  const { values, page, set, clear, active } = useUrlFilters(FILTERS)
  const guests = useGuests({ search: values.q, page })
  const [open, setOpen] = useState(false)
  const today = todayISO(timezone)

  return (
    <>
      <PageHeader
        title="Guests"
        description="Guest profiles, preferences and stay history."
        actions={
          <>
            {can('comms.send') && (
              <Button asChild variant="outline">
                <Link to="/messages">
                  <MessageCircle /> Messages
                </Link>
              </Button>
            )}
            {can('guest.manage') && (
              <Button onClick={() => setOpen(true)}>
                <Plus /> New guest
              </Button>
            )}
          </>
        }
      />
      <SearchInput value={values.q} onChange={(q) => set({ q })} placeholder="Search name, phone or email" className="mb-4 sm:max-w-sm" />
      <QueryState
        query={guests}
        loading={<ListSkeleton />}
        isEmpty={(d) => d.rows.length === 0}
        empty={
          <EmptyState
            icon={Users}
            title={active ? 'No guests match your search' : 'No guests yet'}
            description={active ? undefined : 'Guests are added when you create a booking, or here.'}
            action={active ? <Button variant="outline" onClick={clear}>Clear search</Button> : undefined}
          />
        }
      >
        {(d) => (
          <>
            <Card>
              <Table>
                <THead>
                  <tr>
                    <TH>Guest</TH>
                    <TH className="hidden md:table-cell">Contact</TH>
                    <TH className="hidden sm:table-cell">Stays</TH>
                    <TH>Next arrival</TH>
                    <TH className="w-12">
                      <span className="sr-only">WhatsApp</span>
                    </TH>
                  </tr>
                </THead>
                <TBody>
                  {d.rows.map((g) => {
                    const stays = g.bookings.filter((b) => !['cancelled', 'inquiry', 'no_show'].includes(b.status))
                    const next = stays
                      .filter((b) => b.check_in_date >= today && ['pending', 'confirmed'].includes(b.status))
                      .sort((a, b) => a.check_in_date.localeCompare(b.check_in_date))[0]
                    return (
                      <TR key={g.id} className="cursor-pointer" onClick={() => navigate(`/guests/${g.id}`)}>
                        <TD>
                          <div className="flex items-center gap-3">
                            <Avatar name={g.full_name} />
                            <div className="min-w-0">
                              <Link to={`/guests/${g.id}`} className="font-medium hover:underline" onClick={(e) => e.stopPropagation()}>
                                {g.full_name}
                              </Link>
                              {g.anonymized_at && (
                                <Badge tone="muted" className="ml-2">
                                  Anonymized
                                </Badge>
                              )}
                              <p className="truncate text-xs text-muted-foreground md:hidden">{formatPhone(g.phone)}</p>
                            </div>
                          </div>
                        </TD>
                        <TD className="hidden text-sm md:table-cell">
                          <div>{formatPhone(g.phone)}</div>
                          <div className="text-muted-foreground">{g.email ?? ''}</div>
                        </TD>
                        <TD className="hidden sm:table-cell">{stays.length}</TD>
                        <TD className="text-sm">{next ? formatDate(next.check_in_date) : '—'}</TD>
                        <TD>
                          {g.phone && (
                            <a
                              href={whatsappLink(g.phone)}
                              target="_blank"
                              rel="noreferrer"
                              onClick={(e) => e.stopPropagation()}
                              className="inline-flex rounded-md p-2 text-success hover:bg-success-soft"
                              aria-label={`WhatsApp ${g.full_name}`}
                            >
                              <MessageCircle className="size-4" />
                            </a>
                          )}
                        </TD>
                      </TR>
                    )
                  })}
                </TBody>
              </Table>
            </Card>
            <Pagination page={page} total={d.total} onPage={(p) => set({ page: p })} />
          </>
        )}
      </QueryState>
      <GuestDialog open={open} onOpenChange={setOpen} onSaved={(id) => navigate(`/guests/${id}`)} />
    </>
  )
}
