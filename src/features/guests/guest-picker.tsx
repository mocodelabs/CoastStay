import { Check, UserPlus, X } from 'lucide-react'
import { useState } from 'react'
import { SearchInput } from '@/components/forms/search-input'
import { Button } from '@/components/ui/button'
import { Avatar, Skeleton } from '@/components/ui/primitives'
import { formatPhone } from '@/lib/phone'
import { useGuest, useGuestSearch } from './api'

/**
 * Pick an existing guest by searching name/phone/email, or switch to entering a new guest.
 */
export function GuestPicker({
  guestId,
  onSelect,
  onNewGuest,
  error,
  allowNew = true,
}: {
  guestId: string
  onSelect: (id: string) => void
  onNewGuest: (prefillName: string) => void
  error?: string
  allowNew?: boolean
}) {
  const [term, setTerm] = useState('')
  const results = useGuestSearch(term)
  const selected = useGuest(guestId || undefined)

  if (guestId) {
    return (
      <div className="flex items-center gap-3 rounded-md border bg-ocean-50/50 p-3">
        <Avatar name={selected.data?.full_name} />
        <div className="min-w-0 flex-1">
          {selected.data ? (
            <>
              <p className="truncate font-medium">{selected.data.full_name}</p>
              <p className="truncate text-xs text-muted-foreground">
                {[formatPhone(selected.data.phone), selected.data.email].filter((x) => x && x !== '—').join(' · ') || 'No contact details'}
              </p>
            </>
          ) : (
            <Skeleton className="h-4 w-32" />
          )}
        </div>
        <Button variant="ghost" size="sm" onClick={() => onSelect('')}>
          <X /> Change
        </Button>
      </div>
    )
  }

  return (
    <div className="space-y-2">
      <SearchInput value={term} onChange={setTerm} placeholder="Search guests by name, phone or email" label="Search guests" />
      {error && (
        <p className="text-xs font-medium text-danger" role="alert">
          {error}
        </p>
      )}
      {term.trim().length >= 2 && (
        <ul className="divide-y rounded-md border bg-surface" aria-label="Matching guests">
          {results.isPending && (
            <li className="p-3">
              <Skeleton className="h-4 w-40" />
            </li>
          )}
          {results.data?.map((g) => (
            <li key={g.id}>
              <button
                type="button"
                className="flex w-full items-center gap-3 p-3 text-left hover:bg-sand-50 focus-visible:bg-sand-50"
                onClick={() => onSelect(g.id)}
              >
                <Avatar name={g.full_name} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">{g.full_name}</span>
                  <span className="block truncate text-xs text-muted-foreground">
                    {[g.phone && formatPhone(g.phone), g.email].filter(Boolean).join(' · ')}
                  </span>
                </span>
                <Check className="size-4 text-muted-foreground" aria-hidden />
              </button>
            </li>
          ))}
          {results.data?.length === 0 && <li className="p-3 text-sm text-muted-foreground">No guests found.</li>}
        </ul>
      )}
      {allowNew && (
        <Button variant="outline" size="sm" onClick={() => onNewGuest(term)}>
          <UserPlus /> New guest{term.trim() ? ` “${term.trim()}”` : ''}
        </Button>
      )}
    </div>
  )
}
