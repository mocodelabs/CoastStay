import { cn } from '@/lib/utils'

export function BrandMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={cn('size-8 shrink-0', className)} aria-hidden>
      <rect width="64" height="64" rx="14" fill="#155f66" />
      <path d="M32 14 L48 27 V29 H44 V44 H20 V29 H16 V27 Z" fill="#f5eee1" />
      <path
        d="M10 48c5 0 7-4 11-4s6 4 11 4 7-4 11-4 6 4 11 4"
        fill="none"
        stroke="#aed3d5"
        strokeWidth="3.5"
        strokeLinecap="round"
      />
    </svg>
  )
}

export function Wordmark({ className }: { className?: string }) {
  return (
    <span className={cn('flex items-center gap-2.5', className)}>
      <BrandMark />
      <span className="text-lg font-semibold tracking-tight text-charcoal-900">
        Coast<span className="text-primary">Stay</span>
      </span>
    </span>
  )
}
