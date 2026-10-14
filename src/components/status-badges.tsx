import { Badge } from '@/components/ui/primitives'
import {
  BOOKING_STATUS,
  MAINTENANCE_STATUS,
  PAYMENT_STATE,
  PAYMENT_STATUS,
  PRIORITY,
  TASK_STATUS,
  type BookingStatus,
  type MaintenanceStatus,
  type PaymentState,
  type PaymentStatus,
  type Priority,
  type TaskStatus,
} from '@/lib/labels'

export function BookingStatusBadge({ status }: { status: BookingStatus }) {
  const s = BOOKING_STATUS[status]
  return <Badge tone={s.tone}>{s.label}</Badge>
}

export function PaymentStateBadge({ state }: { state: PaymentState }) {
  if (state === 'not_applicable') return null
  const s = PAYMENT_STATE[state]
  return <Badge tone={s.tone}>{s.label}</Badge>
}

export function PaymentStatusBadge({ status }: { status: PaymentStatus }) {
  const s = PAYMENT_STATUS[status]
  return (
    <Badge tone={s.tone} title={status === 'recorded' ? 'Entered manually — not verified by an integration' : undefined}>
      {s.label}
    </Badge>
  )
}

export function TaskStatusBadge({ status }: { status: TaskStatus }) {
  const s = TASK_STATUS[status]
  return <Badge tone={s.tone}>{s.label}</Badge>
}

export function PriorityBadge({ priority, hideNormal = false }: { priority: Priority; hideNormal?: boolean }) {
  if (hideNormal && priority === 'normal') return null
  const s = PRIORITY[priority]
  return <Badge tone={s.tone}>{s.label}</Badge>
}

export function MaintenanceStatusBadge({ status }: { status: MaintenanceStatus }) {
  const s = MAINTENANCE_STATUS[status]
  return <Badge tone={s.tone}>{s.label}</Badge>
}
