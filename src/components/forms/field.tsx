import * as React from 'react'
import { Label } from '@/components/ui/primitives'
import { cn } from '@/lib/utils'

/**
 * Accessible form field: wires label, hint and error to the control via ids and aria attributes.
 * The single child control receives `id`, `aria-invalid` and `aria-describedby`.
 */
export function Field({
  label,
  hint,
  error,
  required,
  className,
  children,
  id: idProp,
}: {
  label: React.ReactNode
  hint?: React.ReactNode
  error?: string
  required?: boolean
  className?: string
  children: React.ReactElement<Record<string, unknown>>
  id?: string
}) {
  const autoId = React.useId()
  const id = idProp ?? autoId
  const hintId = hint ? `${id}-hint` : undefined
  const errorId = error ? `${id}-error` : undefined
  const describedBy = [hintId, errorId].filter(Boolean).join(' ') || undefined

  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <Label htmlFor={id}>
        {label}
        {required && (
          <span className="ml-0.5 text-danger" aria-hidden>
            *
          </span>
        )}
      </Label>
      {React.cloneElement(children, {
        id,
        'aria-invalid': error ? true : undefined,
        'aria-describedby': describedBy,
        'aria-required': required || undefined,
      })}
      {hint && !error && (
        <p id={hintId} className="text-xs text-muted-foreground">
          {hint}
        </p>
      )}
      {error && (
        <p id={errorId} className="text-xs font-medium text-danger" role="alert">
          {error}
        </p>
      )}
    </div>
  )
}

export function FormError({ message }: { message?: string | null }) {
  if (!message) return null
  return (
    <div role="alert" className="rounded-md border border-danger/20 bg-danger-soft px-3 py-2.5 text-sm text-danger">
      {message}
    </div>
  )
}
