import type * as React from 'react'
import { Wordmark } from '@/components/layout/brand'

export function AuthLayout({ title, subtitle, children }: { title: string; subtitle?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="grid min-h-dvh lg:grid-cols-[1fr_1.1fr]">
      <aside className="relative hidden overflow-hidden bg-ocean-800 p-10 text-ocean-50 lg:flex lg:flex-col lg:justify-between">
        <Wordmark className="[&_span]:text-white [&_span_span]:text-ocean-200" />
        <div className="relative z-10 max-w-md space-y-4">
          <p className="text-3xl leading-tight font-semibold text-white">
            Run your coastal stays with calm, clear control.
          </p>
          <p className="text-ocean-100">
            Bookings, guests, payments, housekeeping and maintenance for your holiday rentals — in one place.
          </p>
        </div>
        <svg viewBox="0 0 600 160" className="absolute inset-x-0 bottom-0 w-full text-ocean-700" aria-hidden preserveAspectRatio="none">
          <path d="M0 80 C100 40 200 120 300 80 S500 40 600 80 V160 H0Z" fill="currentColor" />
          <path d="M0 115 C100 85 200 145 300 115 S500 85 600 115 V160 H0Z" fill="#0a3236" opacity="0.7" />
        </svg>
        <p className="relative z-10 text-xs text-ocean-200">Kenyan Coast · KES · Africa/Nairobi</p>
      </aside>
      <main className="flex items-center justify-center bg-sand-50 px-4 py-10 sm:px-8">
        <div className="w-full max-w-sm space-y-6">
          <div className="lg:hidden">
            <Wordmark />
          </div>
          <div className="space-y-1.5">
            <h1 className="text-2xl font-semibold">{title}</h1>
            {subtitle && <p className="text-sm text-muted-foreground">{subtitle}</p>}
          </div>
          {children}
        </div>
      </main>
    </div>
  )
}
