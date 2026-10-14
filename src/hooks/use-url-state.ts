import { useCallback, useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'react-router'

/**
 * Filter state kept in the URL query string so lists are bookmarkable and survive reloads.
 * Empty values are removed from the URL. Changing any filter resets `page`.
 */
export function useUrlFilters<K extends string>(keys: readonly K[]) {
  const [params, setParams] = useSearchParams()
  const values = Object.fromEntries(keys.map((k) => [k, params.get(k) ?? ''])) as Record<K, string>
  const page = Math.max(1, Number(params.get('page')) || 1)

  const set = useCallback(
    (patch: Partial<Record<K | 'page', string | number | null>>) => {
      setParams(
        (prev) => {
          const next = new URLSearchParams(prev)
          for (const [k, v] of Object.entries(patch)) {
            if (v === null || v === undefined || v === '') next.delete(k)
            else next.set(k, String(v))
          }
          if (!('page' in patch)) next.delete('page')
          return next
        },
        { replace: true },
      )
    },
    [setParams],
  )

  const clear = useCallback(() => {
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev)
        keys.forEach((k) => next.delete(k))
        next.delete('page')
        return next
      },
      { replace: true },
    )
  }, [keys, setParams])

  const active = keys.some((k) => values[k] !== '')
  return { values, page, set, clear, active }
}

export function useDebouncedValue<T>(value: T, delay = 300): T {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay)
    return () => clearTimeout(t)
  }, [value, delay])
  return debounced
}

/** A stable idempotency key per form submission; call `renew()` after a successful save. */
export function useRequestId() {
  const ref = useRef<string>(crypto.randomUUID())
  const renew = useCallback(() => {
    ref.current = crypto.randomUUID()
  }, [])
  return { get: () => ref.current, renew }
}
