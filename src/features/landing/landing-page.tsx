import {
  BarChart3,
  BedDouble,
  BellRing,
  CalendarDays,
  Check,
  ClipboardCheck,
  Lock,
  MessageCircle,
  Package,
  RefreshCw,
  Smartphone,
  Users,
  Wallet,
  Wrench,
} from 'lucide-react'
import type * as React from 'react'
import { Link, Navigate } from 'react-router'
import { Wordmark } from '@/components/layout/brand'
import { Button } from '@/components/ui/button'
import { useAuth } from '@/features/auth/auth-provider'
import { formatMoney } from '@/lib/currency'
import { annualSaving, PLANS, TRIAL_DAYS } from '@/lib/plans'

const CONTACT = {
  phone: '0721 609 317',
  whatsapp: 'https://wa.me/254721609317?text=Hello%20mocode%20labs%2C%20I%27d%20like%20to%20know%20more%20about%20CoastStay.',
  email: 'mocodelabs@gmail.com',
  web: 'https://www.mocodelabs.com',
}

interface Feature {
  icon: React.ComponentType<{ className?: string }>
  title: string
  does: string
  benefit: string
}

const FEATURES: Feature[] = [
  {
    icon: CalendarDays,
    title: 'Bookings & calendar',
    does: 'Day, week and month views for every unit. Book straight from the dates, block nights for repairs or the owner.',
    benefit: 'Double bookings are impossible: overlapping stays are refused, even when two people book at once.',
  },
  {
    icon: RefreshCw,
    title: 'Airbnb & Booking.com sync',
    does: 'Paste each listing’s calendar link once; platform stays are imported every hour as blocked dates.',
    benefit: 'Direct guests can’t take a night a platform already sold. Clashes are flagged for you to decide.',
  },
  {
    icon: Wallet,
    title: 'Payments & balances',
    does: 'Record deposits and balances by M-Pesa, bank, cash or payout with the reference. Expenses with receipts.',
    benefit: 'Know who owes what to the shilling. Refunds stay separate and nothing is ever silently deleted.',
  },
  {
    icon: MessageCircle,
    title: 'Guests & WhatsApp',
    does: 'Guest history and preferences, plus ready-made messages: confirmations, directions, Wi-Fi, reminders.',
    benefit: 'Warm, consistent messages in one tap, with the details filled in. You press send.',
  },
  {
    icon: ClipboardCheck,
    title: 'Housekeeping',
    does: 'A turnover clean is created at every check-out with your checklist, photos and manager sign-off.',
    benefit: 'Every room ready before the next guest, without a single phone call to the cleaner.',
  },
  {
    icon: Wrench,
    title: 'Maintenance',
    does: 'Report issues with photos, assign a technician, track progress and costs, block the unit meanwhile.',
    benefit: 'Nothing gets forgotten in a chat thread, and you see what repairs really cost.',
  },
  {
    icon: Package,
    title: 'Supplies & stock',
    does: 'Toiletries, linen, gas and cleaning stock per property, with a history of what was used.',
    benefit: 'Low-stock alerts arrive before a guest notices something is missing.',
  },
  {
    icon: BarChart3,
    title: 'Dashboard & reports',
    does: 'Today’s arrivals, departures and money at a glance; occupancy, ADR, RevPAR and income per property.',
    benefit: 'See which unit earns and which doesn’t. CSV and print-ready for your accountant.',
  },
  {
    icon: BellRing,
    title: 'Automatic reminders',
    does: 'Balances due, arrivals, departures, overdue cleans and urgent repairs, checked every 30 minutes.',
    benefit: 'The system remembers for you, even when nobody has the app open.',
  },
  {
    icon: Users,
    title: 'Team & permissions',
    does: 'Owner, manager, finance and housekeeping roles, each limited to their own properties.',
    benefit: 'Cleaners never see your money. Remove someone and their access ends immediately.',
  },
]

const FAQ: Array<[string, string]> = [
  [
    'Who is CoastStay for?',
    'Anyone renting out short stays: a single Airbnb apartment, a handful of BNB rooms, serviced apartments or a portfolio of holiday homes — in Nairobi, Mombasa, Naivasha, Nanyuki, Kisumu or anywhere else.',
  ],
  [
    'What happens after the free trial?',
    `Your ${TRIAL_DAYS}-day trial includes everything. To continue, choose the monthly or annual plan and pay by M-Pesa or bank transfer. If you don’t, your data stays safe and readable; you just can’t add new records until you subscribe.`,
  ],
  ['Is there a limit on properties or staff?', 'No. One subscription covers your whole business: every property, unit and team member.'],
  [
    'Does it take M-Pesa payments from guests?',
    'Your team records M-Pesa, bank, cash and platform payments with their references, and balances update automatically. CoastStay doesn’t collect money itself or claim to verify payments with the bank.',
  ],
  ['Do I need to install anything?', 'No. CoastStay runs in the browser on any phone, tablet or computer.'],
]

export function LandingPage() {
  const { user, loading } = useAuth()
  if (!loading && user) return <Navigate to="/" replace />
  return (
    <div className="min-h-dvh bg-background text-foreground">
      <header className="sticky top-0 z-20 border-b border-border/70 bg-background/90 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-3 px-4 sm:px-6">
          <Wordmark />
          <nav aria-label="Landing" className="flex items-center gap-1 sm:gap-2">
            <a href="#features" className="hidden rounded-md px-3 py-2 text-sm font-medium text-charcoal-700 hover:bg-sand-100 md:inline">
              Features
            </a>
            <a href="#pricing" className="hidden rounded-md px-3 py-2 text-sm font-medium text-charcoal-700 hover:bg-sand-100 md:inline">
              Pricing
            </a>
            <Button asChild variant="ghost" size="sm">
              <Link to="/login">Sign in</Link>
            </Button>
            <Button asChild size="sm">
              <Link to="/signup">Start free trial</Link>
            </Button>
          </nav>
        </div>
      </header>

      <main>
        {/* Hero */}
        <section className="relative overflow-hidden bg-ocean-800 text-ocean-50">
          <div className="mx-auto grid max-w-6xl items-center gap-10 px-4 py-14 sm:px-6 lg:grid-cols-[1.1fr_0.9fr] lg:py-20">
            <div className="space-y-6">
              <p className="text-sm font-semibold tracking-wide text-ocean-200 uppercase">BNB &amp; short-stay management</p>
              <h1 className="text-4xl leading-[1.08] font-semibold text-balance text-white sm:text-5xl">
                Run your BNB with calm, clear control.
              </h1>
              <p className="max-w-xl text-lg text-ocean-100">
                Bookings, guests, payments, cleaning, repairs and supplies for Airbnbs, BNBs, serviced apartments and
                holiday homes — in one place your whole team can use from their phones.
              </p>
              <div className="flex flex-wrap gap-3">
                <Button asChild size="lg" className="bg-white text-ocean-800 hover:bg-sand-100">
                  <Link to="/signup">Start your {TRIAL_DAYS}-day free trial</Link>
                </Button>
                <Button asChild size="lg" variant="outline" className="border-ocean-300 bg-transparent text-white hover:bg-white/10">
                  <a href="#features">See what it does</a>
                </Button>
              </div>
              <p className="text-sm text-ocean-200">No card needed · Every feature included · Cancel any time</p>
            </div>
            <HeroCard />
          </div>
          <svg viewBox="0 0 1440 60" preserveAspectRatio="none" className="block h-10 w-full text-background" aria-hidden>
            <path d="M0 34c160-24 320-24 480 0s320 24 480 0 320-24 480 0V60H0z" fill="currentColor" />
          </svg>
        </section>

        {/* Problem → answer */}
        <section className="mx-auto grid max-w-6xl gap-10 px-4 py-16 sm:px-6 lg:grid-cols-2">
          <div className="space-y-4">
            <h2 className="text-3xl font-semibold text-balance">Your rental business shouldn’t live in ten different places.</h2>
            <p className="text-lg text-muted-foreground">
              CoastStay brings bookings, money and operations into one shared view, so you always know who is arriving,
              who has paid, which room is ready and what needs fixing — wherever you are.
            </p>
          </div>
          <ul className="grid gap-3 text-sm">
            {[
              ['Platform calendars', 'say one thing, the notebook at reception says another.'],
              ['M-Pesa messages', 'scroll away before anyone records which guest paid what.'],
              ['“Is the room ready?”', 'means three phone calls to the caretaker.'],
              ['Month end', 'is an evening with a calculator, guessing what you earned.'],
            ].map(([b, t]) => (
              <li key={b} className="rounded-lg border border-dashed bg-sand-50 px-4 py-3 text-charcoal-700">
                <strong className="text-charcoal-900">{b}</strong> {t}
              </li>
            ))}
          </ul>
        </section>

        {/* Features */}
        <section id="features" className="scroll-mt-20 bg-sand-50 py-16">
          <div className="mx-auto max-w-6xl px-4 sm:px-6">
            <div className="max-w-2xl space-y-3">
              <h2 className="text-3xl font-semibold text-balance">Everything a short-stay business runs on.</h2>
              <p className="text-lg text-muted-foreground">
                Each part saves time on its own. Together, a booking’s payments, cleaning and numbers update themselves.
              </p>
            </div>
            <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {FEATURES.map((f) => (
                <article key={f.title} className="flex flex-col gap-3 rounded-xl border bg-surface p-5">
                  <span className="flex size-10 items-center justify-center rounded-lg bg-ocean-50 text-ocean-600">
                    <f.icon className="size-5" />
                  </span>
                  <h3 className="text-lg font-semibold">{f.title}</h3>
                  <p className="text-sm text-muted-foreground">{f.does}</p>
                  <p className="mt-auto flex gap-2 border-t pt-3 text-sm font-medium text-charcoal-900">
                    <Check className="mt-0.5 size-4 shrink-0 text-success" aria-hidden />
                    {f.benefit}
                  </p>
                </article>
              ))}
              <article className="flex flex-col justify-center gap-2 rounded-xl bg-ocean-700 p-5 text-ocean-50 sm:col-span-2 lg:col-span-2">
                <p className="flex items-center gap-2 font-semibold text-white">
                  <Smartphone className="size-5" /> Works on any phone · <Lock className="size-5" /> Private by design
                </p>
                <p className="text-sm text-ocean-100">
                  Each business’s data is separated at the database level, staff see only what their role allows, money
                  records keep a full audit trail, and photos and receipts are stored privately.
                </p>
              </article>
            </div>
          </div>
        </section>

        {/* How it works */}
        <section className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
          <h2 className="text-3xl font-semibold">Up and running in an afternoon.</h2>
          <ol className="mt-8 grid gap-6 md:grid-cols-3">
            {[
              ['Create your account', `Sign up and set up your business. Your ${TRIAL_DAYS}-day trial starts straight away.`],
              ['Add your properties', 'Units, rates, cleaning fees, photos and check-in instructions. Link your platform calendars.'],
              ['Invite your team', 'Send managers, cleaners and your accountant a link. Each sees just what they need.'],
            ].map(([t, d], i) => (
              <li key={t} className="flex gap-4">
                <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-ocean-50 font-semibold text-ocean-700">
                  {i + 1}
                </span>
                <span>
                  <span className="block font-semibold">{t}</span>
                  <span className="text-sm text-muted-foreground">{d}</span>
                </span>
              </li>
            ))}
          </ol>
        </section>

        {/* Pricing */}
        <section id="pricing" className="scroll-mt-20 bg-sand-50 py-16">
          <div className="mx-auto max-w-4xl px-4 sm:px-6">
            <div className="space-y-3 text-center">
              <h2 className="text-3xl font-semibold">Simple pricing. Every feature included.</h2>
              <p className="text-muted-foreground">
                One subscription per business — unlimited properties, units and staff. Start with {TRIAL_DAYS} days free.
              </p>
            </div>
            <div className="mt-10 grid gap-5 md:grid-cols-2">
              {PLANS.map((p) => {
                const annual = p.code === 'annual'
                return (
                  <div
                    key={p.code}
                    className={
                      annual
                        ? 'relative flex flex-col gap-4 rounded-2xl border-2 border-primary bg-surface p-6 shadow-sm'
                        : 'flex flex-col gap-4 rounded-2xl border bg-surface p-6'
                    }
                  >
                    {annual && (
                      <span className="absolute -top-3 left-6 rounded-full bg-primary px-3 py-0.5 text-xs font-semibold text-white">
                        Save {formatMoney(annualSaving(), 'KES', { compact: true })} a year
                      </span>
                    )}
                    <div>
                      <h3 className="text-lg font-semibold">{p.name}</h3>
                      <p className="mt-1 text-3xl font-semibold tabular-nums">
                        {formatMoney(p.price, 'KES', { compact: true })}
                        <span className="text-base font-normal text-muted-foreground"> / {p.per}</span>
                      </p>
                      <p className="mt-1 text-sm text-muted-foreground">
                        {annual ? `About ${formatMoney(Math.round(p.price / 12), 'KES', { compact: true })} a month, paid once a year.` : 'Pay month by month.'}
                      </p>
                    </div>
                    <ul className="space-y-2 text-sm">
                      {['All features', 'Unlimited properties & staff', 'Airbnb & Booking.com calendar sync', 'Setup help from our team'].map((x) => (
                        <li key={x} className="flex gap-2">
                          <Check className="mt-0.5 size-4 shrink-0 text-success" aria-hidden /> {x}
                        </li>
                      ))}
                    </ul>
                    <Button asChild variant={annual ? 'primary' : 'outline'} className="mt-auto">
                      <Link to="/signup">Start free trial</Link>
                    </Button>
                  </div>
                )
              })}
            </div>
            <p className="mt-6 text-center text-sm text-muted-foreground">
              Pay by M-Pesa or bank transfer. Prices in Kenyan shillings.
            </p>
          </div>
        </section>

        {/* FAQ */}
        <section className="mx-auto max-w-3xl px-4 py-16 sm:px-6">
          <h2 className="text-3xl font-semibold">Questions</h2>
          <div className="mt-6 divide-y rounded-xl border bg-surface">
            {FAQ.map(([q, a]) => (
              <details key={q} className="group px-5 py-4">
                <summary className="cursor-pointer list-none font-medium marker:hidden">
                  <span className="flex items-center justify-between gap-3">
                    {q}
                    <span className="text-primary transition-transform group-open:rotate-45" aria-hidden>
                      +
                    </span>
                  </span>
                </summary>
                <p className="mt-2 text-sm text-muted-foreground">{a}</p>
              </details>
            ))}
          </div>
        </section>

        {/* Contact */}
        <section className="px-4 pb-16 sm:px-6">
          <div className="mx-auto grid max-w-6xl gap-8 rounded-3xl bg-ocean-800 p-8 text-ocean-50 sm:p-12 lg:grid-cols-[1.2fr_0.8fr] lg:items-center">
            <div className="space-y-3">
              <h2 className="text-3xl font-semibold text-balance text-white">Spend less time chasing, more time hosting.</h2>
              <p className="text-ocean-100">
                Start your free trial today, or talk to the mocode labs team for a walkthrough with your own properties.
              </p>
              <Button asChild size="lg" className="mt-2 bg-white text-ocean-800 hover:bg-sand-100">
                <Link to="/signup">Start free trial</Link>
              </Button>
            </div>
            <dl className="grid gap-3 text-sm">
              <ContactRow label="Call or WhatsApp" value={CONTACT.phone} href={CONTACT.whatsapp} />
              <ContactRow label="Email" value={CONTACT.email} href={`mailto:${CONTACT.email}`} />
              <ContactRow label="Website" value="www.mocodelabs.com" href={CONTACT.web} />
            </dl>
          </div>
        </section>
      </main>

      <footer className="border-t">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-6 text-sm text-muted-foreground sm:px-6">
          <span>CoastStay is designed and built by mocode labs, Kenya.</span>
          <span className="flex gap-4">
            <Link to="/login" className="hover:text-foreground">
              Sign in
            </Link>
            <Link to="/signup" className="hover:text-foreground">
              Create account
            </Link>
          </span>
        </div>
      </footer>
    </div>
  )
}

function ContactRow({ label, value, href }: { label: string; value: string; href: string }) {
  return (
    <div className="rounded-xl bg-white/8 px-4 py-3">
      <dt className="text-xs tracking-wide text-ocean-200 uppercase">{label}</dt>
      <dd className="text-base font-semibold text-white">
        <a href={href} target={href.startsWith('http') ? '_blank' : undefined} rel="noopener noreferrer" className="hover:underline">
          {value}
        </a>
      </dd>
    </div>
  )
}

function HeroCard() {
  return (
    <div className="rounded-2xl bg-surface p-5 text-charcoal-900 shadow-2xl" role="img" aria-label="Example of the CoastStay dashboard">
      <div className="flex items-baseline justify-between gap-2">
        <p className="font-semibold">Good morning, Wanjiru</p>
        <p className="text-xs text-muted-foreground">Example</p>
      </div>
      <div className="mt-4 grid grid-cols-2 gap-2.5">
        {[
          ['Occupied tonight', '9 of 12'],
          ['Arrivals today', '3'],
          ['Collected this month', formatMoney(486500, 'KES', { compact: true })],
          ['Balances due', formatMoney(27000, 'KES', { compact: true })],
        ].map(([l, v]) => (
          <div key={l} className="rounded-lg bg-sand-50 px-3 py-2.5">
            <p className="text-xs text-muted-foreground">{l}</p>
            <p className="text-lg font-semibold tabular-nums">{v}</p>
          </div>
        ))}
      </div>
      <ul className="mt-3 divide-y text-sm">
        {[
          ['Brian Otieno · Kilimani Studio 3', 'Paid', 'text-success'],
          ['Achieng Wafula · Garden Room 2', 'Balance due', 'text-warning'],
          ['Turnover clean · Ocean Suite', 'Assigned', 'text-info'],
        ].map(([t, s, c]) => (
          <li key={t} className="flex items-center justify-between gap-2 py-2">
            <span className="flex min-w-0 items-center gap-2">
              <BedDouble className="size-4 shrink-0 text-muted-foreground" />
              <span className="truncate">{t}</span>
            </span>
            <span className={`shrink-0 text-xs font-semibold ${c}`}>{s}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}
