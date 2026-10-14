import { ArrowDownLeft, ArrowUpRight, Ban, Download, FileText, Pencil, Plus, Printer, Receipt, Scale, TrendingUp, Wallet } from 'lucide-react'
import { useState } from 'react'
import { Link, useSearchParams } from 'react-router'
import { toast } from 'sonner'
import { EmptyState, ErrorState, KpiSkeleton, ListSkeleton, QueryState } from '@/components/feedback/states'
import { DateRangeFilter, presetRange } from '@/components/forms/date-range'
import { Field } from '@/components/forms/field'
import { Kpi, KpiGrid } from '@/components/kpi'
import { PageHeader } from '@/components/layout/page-header'
import { Money } from '@/components/money'
import { BookingStatusBadge, PaymentStatusBadge } from '@/components/status-badges'
import { Pagination } from '@/components/tables/pagination'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { NativeSelect, Textarea } from '@/components/ui/input'
import { Badge, Card, CardContent, CardHeader, CardTitle } from '@/components/ui/primitives'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/menu'
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/table'
import { stayLabel } from '@/features/bookings/booking-table'
import { usePropertyOptions } from '@/features/properties/api'
import { useOrg } from '@/features/workspace/workspace-provider'
import { useUrlFilters } from '@/hooks/use-url-state'
import { formatCents, toCents } from '@/lib/currency'
import { formatDate, isISODate, todayISO } from '@/lib/date-utils'
import { toUserMessage } from '@/lib/errors'
import { PAYMENT_METHOD, PAYMENT_TYPE } from '@/lib/labels'
import { openSignedFile } from '@/lib/storage'
import { downloadText, toCsv } from '@/lib/utils'
import { PAYMENT_METHODS } from '@/schemas/booking'
import {
  fetchExpensesForExport,
  fetchLedgerForExport,
  useExpenseCategories,
  useExpenses,
  useFinanceSummary,
  useLedger,
  useOutstanding,
  useVoidExpense,
  type Expense,
} from './api'
import { ExpenseDialog } from './expense-dialog'

const FILTERS = ['tab', 'from', 'to', 'property', 'method', 'type', 'category', 'status', 'kind'] as const

function Overview({ from, to, property }: { from: string; to: string; property: string }) {
  const { currency } = useOrg()
  const s = useFinanceSummary(from, to, property)
  const fmt = (v: number) => formatCents(toCents(v), currency, { compact: true })
  if (s.isPending) return <KpiSkeleton count={8} />
  if (s.isError) return <ErrorState error={s.error} onRetry={() => void s.refetch()} />
  const d = s.data
  return (
    <div className="space-y-5">
      <KpiGrid>
        <Kpi icon={ArrowDownLeft} tone="success" label="Payments received" value={fmt(d.payments_received)} hint="Deposits and balances, net of reversals" />
        <Kpi icon={ArrowUpRight} tone="warning" label="Refunds to guests" value={fmt(d.refunds)} />
        <Kpi icon={Wallet} label="Net collected" value={fmt(d.net_collected)} hint="Received − refunds" />
        <Kpi icon={Receipt} tone="danger" label="Operating expenses" value={fmt(d.expenses_operating)} hint={d.expenses_total !== d.expenses_operating ? `All expenses: ${fmt(d.expenses_total)}` : undefined} />
        <Kpi
          icon={TrendingUp}
          tone={d.estimated_operating_income >= 0 ? 'success' : 'danger'}
          label="Estimated operating income"
          value={fmt(d.estimated_operating_income)}
          hint="Net collected − operating expenses"
        />
        <Kpi icon={Scale} tone="warning" label="Outstanding balances" value={fmt(d.outstanding_balance)} hint="Owed by guests now (all dates)" />
        <Kpi icon={Scale} tone="info" label="Credits owed to guests" value={fmt(d.credits_owed)} hint="Refunds still to send" />
      </KpiGrid>
      <Card>
        <CardHeader>
          <CardTitle>How these figures are calculated</CardTitle>
        </CardHeader>
        <CardContent className="space-y-1.5 text-sm text-muted-foreground">
          <p>Cash basis: payments, refunds and expenses count on the date they were recorded as paid, within the selected period.</p>
          <p>Reversals cancel the original entry in the period the reversal is dated. Voided expenses are excluded.</p>
          <p>
            Estimated operating income is a management indicator — net collected minus expenses in categories marked “counts towards
            operating income”. It is not accounting or tax profit.
          </p>
          <p>Outstanding balances and credits are the current position across all bookings, regardless of the period.</p>
        </CardContent>
      </Card>
    </div>
  )
}

function Ledger({ from, to, property, method, type, page, onPage }: { from: string; to: string; property: string; method: string; type: string; page: number; onPage: (p: number) => void }) {
  const { orgId, currency } = useOrg()
  const filters = { from, to, property, method, type, page }
  const ledger = useLedger(filters)
  const [exporting, setExporting] = useState(false)

  async function exportCsv() {
    setExporting(true)
    try {
      const rows = await fetchLedgerForExport(orgId, filters)
      const csv = toCsv(
        rows.map((r) => ({
          date: r.payment_date,
          booking: r.booking?.booking_reference,
          guest: r.booking?.guest?.full_name,
          property: r.property?.name,
          type: PAYMENT_TYPE[r.payment_type],
          method: PAYMENT_METHOD[r.payment_method],
          reference: r.transaction_reference,
          status: r.status,
          amount: r.amount,
          currency: r.currency,
          recorded_by: r.recorder?.full_name,
          notes: r.notes,
        })),
        [
          { key: 'date', label: 'Date' },
          { key: 'booking', label: 'Booking' },
          { key: 'guest', label: 'Guest' },
          { key: 'property', label: 'Property' },
          { key: 'type', label: 'Type' },
          { key: 'method', label: 'Method' },
          { key: 'reference', label: 'Reference' },
          { key: 'status', label: 'Status' },
          { key: 'amount', label: 'Amount' },
          { key: 'currency', label: 'Currency' },
          { key: 'recorded_by', label: 'Recorded by' },
          { key: 'notes', label: 'Notes' },
        ],
      )
      downloadText(`coaststay-transactions-${from}-to-${to}.csv`, csv)
    } catch (e) {
      toast.error(toUserMessage(e))
    } finally {
      setExporting(false)
    }
  }

  return (
    <QueryState
      query={ledger}
      loading={<ListSkeleton />}
      isEmpty={(d) => d.rows.length === 0}
      empty={<EmptyState icon={Wallet} title="No transactions in this period" description="Payments are recorded from each booking." />}
    >
      {(d) => (
        <>
          <div className="mb-2 flex justify-end">
            <Button variant="outline" size="sm" onClick={exportCsv} loading={exporting}>
              <Download /> Export CSV
            </Button>
          </div>
          <Card>
            <Table>
              <THead>
                <tr>
                  <TH>Date</TH>
                  <TH>Booking</TH>
                  <TH className="hidden md:table-cell">Type</TH>
                  <TH className="hidden lg:table-cell">Method · ref</TH>
                  <TH className="hidden sm:table-cell">Status</TH>
                  <TH className="text-right">Amount</TH>
                </tr>
              </THead>
              <TBody>
                {d.rows.map((p) => {
                  const out = p.payment_type === 'refund' || p.payment_type === 'reversal'
                  return (
                    <TR key={p.id}>
                      <TD className="text-sm whitespace-nowrap">{formatDate(p.payment_date)}</TD>
                      <TD className="text-sm">
                        {p.booking ? (
                          <Link to={`/bookings/${p.booking.id}`} className="font-medium hover:underline">
                            {p.booking.guest?.full_name ?? p.booking.booking_reference}
                          </Link>
                        ) : (
                          '—'
                        )}
                        <p className="text-xs text-muted-foreground">
                          {p.booking?.booking_reference} · {p.property?.name}
                        </p>
                        <p className="text-xs text-muted-foreground md:hidden">{PAYMENT_TYPE[p.payment_type]}</p>
                      </TD>
                      <TD className="hidden text-sm md:table-cell">{PAYMENT_TYPE[p.payment_type]}</TD>
                      <TD className="hidden text-sm lg:table-cell">
                        {PAYMENT_METHOD[p.payment_method]}
                        {p.transaction_reference && <span className="block text-xs text-muted-foreground">{p.transaction_reference}</span>}
                      </TD>
                      <TD className="hidden sm:table-cell">
                        <PaymentStatusBadge status={p.status} />
                      </TD>
                      <TD className={out ? 'text-right text-danger' : 'text-right'}>
                        {out && '− '}
                        <Money value={p.amount} currency={currency} />
                      </TD>
                    </TR>
                  )
                })}
              </TBody>
            </Table>
          </Card>
          <Pagination page={page} total={d.total} onPage={onPage} />
        </>
      )}
    </QueryState>
  )
}

function VoidDialog({ expense, onClose }: { expense: Expense | null; onClose: () => void }) {
  const voidExpense = useVoidExpense()
  const [reason, setReason] = useState('')
  const [err, setErr] = useState<string | null>(null)
  return (
    <Dialog open={expense !== null} onOpenChange={(o) => !o && !voidExpense.isPending && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Void this expense?</DialogTitle>
          <DialogDescription>It stays in the history marked void and is excluded from reports.</DialogDescription>
        </DialogHeader>
        <Field label="Reason" required error={err ?? undefined}>
          <Textarea rows={2} value={reason} onChange={(e) => setReason(e.target.value)} />
        </Field>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={voidExpense.isPending}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            loading={voidExpense.isPending}
            onClick={() => {
              if (reason.trim().length < 3) {
                setErr('Give a reason.')
                return
              }
              voidExpense.mutate(
                { id: expense!.id, reason: reason.trim() },
                {
                  onSuccess: () => {
                    toast.success('Expense voided.')
                    setReason('')
                    setErr(null)
                    onClose()
                  },
                  onError: (e) => setErr(toUserMessage(e)),
                },
              )
            }}
          >
            <Ban /> Void expense
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function Expenses({ from, to, property, category, status, page, onPage }: { from: string; to: string; property: string; category: string; status: string; page: number; onPage: (p: number) => void }) {
  const { orgId, currency, can } = useOrg()
  const filters = { from, to, property, category, status, page }
  const expenses = useExpenses(filters)
  const categories = useExpenseCategories()
  const [editing, setEditing] = useState<Expense | null>(null)
  const [creating, setCreating] = useState(false)
  const [voiding, setVoiding] = useState<Expense | null>(null)
  const [exporting, setExporting] = useState(false)
  const catName = (code: string) => categories.data?.find((c) => c.code === code)?.name ?? code

  async function exportCsv() {
    setExporting(true)
    try {
      const rows = await fetchExpensesForExport(orgId, filters)
      downloadText(
        `coaststay-expenses-${from}-to-${to}.csv`,
        toCsv(
          rows.map((e) => ({
            date: e.expense_date,
            description: e.description,
            category: catName(e.category),
            property: e.property?.name ?? 'Business-wide',
            supplier: e.supplier,
            method: PAYMENT_METHOD[e.payment_method],
            amount: e.amount,
            currency: e.currency,
            status: e.status,
            void_reason: e.void_reason,
          })),
          [
            { key: 'date', label: 'Date' },
            { key: 'description', label: 'Description' },
            { key: 'category', label: 'Category' },
            { key: 'property', label: 'Property' },
            { key: 'supplier', label: 'Supplier' },
            { key: 'method', label: 'Paid by' },
            { key: 'amount', label: 'Amount' },
            { key: 'currency', label: 'Currency' },
            { key: 'status', label: 'Status' },
            { key: 'void_reason', label: 'Void reason' },
          ],
        ),
      )
    } catch (e) {
      toast.error(toUserMessage(e))
    } finally {
      setExporting(false)
    }
  }

  return (
    <>
      <div className="mb-2 flex flex-wrap justify-end gap-2">
        <Button variant="outline" size="sm" onClick={exportCsv} loading={exporting}>
          <Download /> Export CSV
        </Button>
        {can('finance.record') && (
          <Button size="sm" onClick={() => setCreating(true)}>
            <Plus /> Record expense
          </Button>
        )}
      </div>
      <QueryState
        query={expenses}
        loading={<ListSkeleton />}
        isEmpty={(d) => d.rows.length === 0}
        empty={<EmptyState icon={Receipt} title="No expenses in this period" />}
      >
        {(d) => (
          <>
            <Card>
              <Table>
                <THead>
                  <tr>
                    <TH>Date</TH>
                    <TH>Expense</TH>
                    <TH className="hidden md:table-cell">Property</TH>
                    <TH className="text-right">Amount</TH>
                    <TH className="w-24">
                      <span className="sr-only">Actions</span>
                    </TH>
                  </tr>
                </THead>
                <TBody>
                  {d.rows.map((e) => (
                    <TR key={e.id} className={e.status === 'void' ? 'opacity-60' : undefined}>
                      <TD className="text-sm whitespace-nowrap">{formatDate(e.expense_date)}</TD>
                      <TD className="text-sm">
                        <span className="font-medium">{e.description}</span>
                        {e.status === 'void' && (
                          <Badge tone="danger" className="ml-2">
                            Void
                          </Badge>
                        )}
                        <p className="text-xs text-muted-foreground">
                          {catName(e.category)}
                          {e.supplier && ` · ${e.supplier}`} · {PAYMENT_METHOD[e.payment_method]}
                        </p>
                        {e.status === 'void' && e.void_reason && <p className="text-xs text-danger">{e.void_reason}</p>}
                      </TD>
                      <TD className="hidden text-sm md:table-cell">{e.property?.name ?? 'Business-wide'}</TD>
                      <TD className="text-right">
                        <Money value={e.amount} currency={currency} />
                      </TD>
                      <TD>
                        <div className="flex justify-end">
                          {e.receipt_path && (
                            <Button
                              variant="ghost"
                              size="icon-sm"
                              aria-label="View receipt"
                              onClick={() => openSignedFile('receipts', e.receipt_path!).catch((err) => toast.error(toUserMessage(err)))}
                            >
                              <FileText />
                            </Button>
                          )}
                          {can('finance.record') && e.status === 'recorded' && (
                            <>
                              <Button variant="ghost" size="icon-sm" aria-label="Edit expense" onClick={() => setEditing(e)}>
                                <Pencil />
                              </Button>
                              <Button variant="ghost" size="icon-sm" aria-label="Void expense" onClick={() => setVoiding(e)}>
                                <Ban className="text-danger" />
                              </Button>
                            </>
                          )}
                        </div>
                      </TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            </Card>
            <Pagination page={page} total={d.total} onPage={onPage} />
          </>
        )}
      </QueryState>
      {(creating || editing) && (
        <ExpenseDialog
          open
          expense={editing}
          onOpenChange={(o) => {
            if (!o) {
              setCreating(false)
              setEditing(null)
            }
          }}
          defaults={property && property !== 'shared' ? { property_id: property } : undefined}
        />
      )}
      <VoidDialog expense={voiding} onClose={() => setVoiding(null)} />
    </>
  )
}

function Outstanding({ property, kind, page, onPage }: { property: string; kind: 'owed' | 'credit'; page: number; onPage: (p: number) => void }) {
  const { currency } = useOrg()
  const q = useOutstanding({ property, kind, page })
  return (
    <QueryState
      query={q}
      loading={<ListSkeleton />}
      isEmpty={(d) => d.rows.length === 0}
      empty={<EmptyState icon={Scale} title={kind === 'owed' ? 'Nothing outstanding' : 'No credits owed to guests'} />}
    >
      {(d) => (
        <>
          <Card>
            <Table>
              <THead>
                <tr>
                  <TH>Guest</TH>
                  <TH className="hidden md:table-cell">Stay</TH>
                  <TH>Status</TH>
                  <TH className="hidden text-right sm:table-cell">Total</TH>
                  <TH className="text-right">{kind === 'owed' ? 'Balance due' : 'Owed to guest'}</TH>
                </tr>
              </THead>
              <TBody>
                {d.rows.map((b) => (
                  <TR key={b.id}>
                    <TD>
                      <Link to={`/bookings/${b.id}`} className="font-medium hover:underline">
                        {b.guest_name}
                      </Link>
                      <p className="text-xs text-muted-foreground">{b.booking_reference}</p>
                    </TD>
                    <TD className="hidden text-sm md:table-cell">
                      {stayLabel(b)}
                      <p className="text-xs text-muted-foreground">
                        {formatDate(b.check_in_date)} → {formatDate(b.check_out_date)}
                      </p>
                    </TD>
                    <TD>
                      <BookingStatusBadge status={b.status} />
                    </TD>
                    <TD className="hidden text-right sm:table-cell">
                      <Money value={b.total_amount} currency={currency} compact />
                    </TD>
                    <TD className={kind === 'owed' ? 'text-right font-medium text-warning' : 'text-right font-medium text-info'}>
                      <Money value={Math.abs(b.balance_due)} currency={currency} />
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </Card>
          <Pagination page={page} total={d.total} onPage={onPage} />
        </>
      )}
    </QueryState>
  )
}

export function FinancesPage() {
  const { timezone } = useOrg()
  const today = todayISO(timezone)
  const { values, page, set } = useUrlFilters(FILTERS)
  const [, setParams] = useSearchParams()
  const properties = usePropertyOptions()
  const categories = useExpenseCategories()
  const def = presetRange('this_month', today)
  const from = isISODate(values.from) ? values.from : def.from
  const to = isISODate(values.to) ? values.to : def.to
  const tab = values.tab || 'overview'
  const onPage = (p: number) => set({ page: p })

  return (
    <>
      <PageHeader
        title="Finances"
        description="Payments, expenses, balances and refunds."
        actions={
          <Button variant="outline" onClick={() => window.print()} className="no-print">
            <Printer /> Print
          </Button>
        }
      />
      <div className="no-print mb-4 flex flex-col gap-3 lg:flex-row lg:items-end">
        {tab !== 'outstanding' && <DateRangeFilter from={from} to={to} today={today} onChange={(r) => set({ from: r.from, to: r.to })} />}
        <div className="space-y-1">
          <label htmlFor="fin-property" className="text-sm font-medium">
            Property
          </label>
          <NativeSelect id="fin-property" value={values.property} onChange={(e) => set({ property: e.target.value })} className="w-48">
            <option value="">All properties</option>
            {tab === 'expenses' && <option value="shared">Business-wide only</option>}
            {properties.data?.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </NativeSelect>
        </div>
        {tab === 'payments' && (
          <>
            <NativeSelect aria-label="Method" value={values.method} onChange={(e) => set({ method: e.target.value })} className="w-40">
              <option value="">Any method</option>
              {PAYMENT_METHODS.map((m) => (
                <option key={m} value={m}>
                  {PAYMENT_METHOD[m]}
                </option>
              ))}
            </NativeSelect>
            <NativeSelect aria-label="Type" value={values.type} onChange={(e) => set({ type: e.target.value })} className="w-48">
              <option value="">All types</option>
              <option value="refunds_adjustments">Refunds, adjustments & reversals</option>
              {Object.entries(PAYMENT_TYPE).map(([k, l]) => (
                <option key={k} value={k}>
                  {l}
                </option>
              ))}
            </NativeSelect>
          </>
        )}
        {tab === 'expenses' && (
          <>
            <NativeSelect aria-label="Category" value={values.category} onChange={(e) => set({ category: e.target.value })} className="w-44">
              <option value="">All categories</option>
              {categories.data?.map((c) => (
                <option key={c.code} value={c.code}>
                  {c.name}
                </option>
              ))}
            </NativeSelect>
            <NativeSelect aria-label="Status" value={values.status} onChange={(e) => set({ status: e.target.value })} className="w-36">
              <option value="">Recorded</option>
              <option value="void">Void</option>
              <option value="all">All</option>
            </NativeSelect>
          </>
        )}
        {tab === 'outstanding' && (
          <NativeSelect aria-label="Direction" value={values.kind} onChange={(e) => set({ kind: e.target.value })} className="w-52">
            <option value="">Owed by guests</option>
            <option value="credit">Owed to guests (refunds due)</option>
          </NativeSelect>
        )}
      </div>

      <Tabs value={tab} onValueChange={(t) => setParams((p) => { const n = new URLSearchParams(p); n.set('tab', t); n.delete('page'); return n }, { replace: true })}>
        <TabsList className="no-print">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="payments">Transactions</TabsTrigger>
          <TabsTrigger value="expenses">Expenses</TabsTrigger>
          <TabsTrigger value="outstanding">Balances</TabsTrigger>
        </TabsList>
        <p className="mt-3 hidden text-sm print:block">
          Period {formatDate(from)} – {formatDate(to)}
        </p>
        <TabsContent value="overview">
          <Overview from={from} to={to} property={values.property === 'shared' ? '' : values.property} />
        </TabsContent>
        <TabsContent value="payments">
          <Ledger from={from} to={to} property={values.property} method={values.method} type={values.type} page={page} onPage={onPage} />
        </TabsContent>
        <TabsContent value="expenses">
          <Expenses from={from} to={to} property={values.property} category={values.category} status={values.status} page={page} onPage={onPage} />
        </TabsContent>
        <TabsContent value="outstanding">
          <Outstanding property={values.property === 'shared' ? '' : values.property} kind={values.kind === 'credit' ? 'credit' : 'owed'} page={page} onPage={onPage} />
        </TabsContent>
      </Tabs>
    </>
  )
}
