import type { Database } from '@/types/database'

type Enums = Database['public']['Enums']
export type BookingStatus = Enums['booking_status']
export type BookingSource = Enums['booking_source']
export type PaymentType = Enums['payment_type']
export type PaymentMethod = Enums['payment_method']
export type PaymentStatus = Enums['payment_status']
export type TaskStatus = Enums['task_status']
export type TaskType = Enums['task_type']
export type Priority = Enums['priority_level']
export type MaintenanceStatus = Enums['maintenance_status']
export type PropertyType = Enums['property_type']
export type BlockReason = Enums['block_reason']
export type MovementType = Enums['inventory_movement_type']

export type Tone = 'neutral' | 'ocean' | 'info' | 'warning' | 'danger' | 'success' | 'muted'

export const BOOKING_STATUS: Record<BookingStatus, { label: string; tone: Tone }> = {
  inquiry: { label: 'Inquiry', tone: 'muted' },
  pending: { label: 'Pending', tone: 'warning' },
  confirmed: { label: 'Confirmed', tone: 'info' },
  checked_in: { label: 'Checked in', tone: 'ocean' },
  checked_out: { label: 'Checked out', tone: 'success' },
  cancelled: { label: 'Cancelled', tone: 'danger' },
  no_show: { label: 'No show', tone: 'neutral' },
}
export const BOOKING_STATUSES = Object.keys(BOOKING_STATUS) as BookingStatus[]

export const BOOKING_SOURCE: Record<BookingSource, string> = {
  airbnb: 'Airbnb',
  booking_com: 'Booking.com',
  direct: 'Direct',
  whatsapp: 'WhatsApp',
  phone: 'Phone',
  other: 'Other',
}
export const BOOKING_SOURCES = Object.keys(BOOKING_SOURCE) as BookingSource[]

export type PaymentState = 'unpaid' | 'partial' | 'paid' | 'overpaid' | 'not_applicable'
export const PAYMENT_STATE: Record<PaymentState, { label: string; tone: Tone }> = {
  unpaid: { label: 'Unpaid', tone: 'danger' },
  partial: { label: 'Part paid', tone: 'warning' },
  paid: { label: 'Paid', tone: 'success' },
  overpaid: { label: 'Credit due', tone: 'info' },
  not_applicable: { label: '—', tone: 'muted' },
}

export const PAYMENT_TYPE: Record<PaymentType, string> = {
  deposit: 'Deposit',
  balance: 'Balance payment',
  payment: 'Payment',
  refund: 'Refund',
  adjustment_credit: 'Credit adjustment',
  adjustment_debit: 'Charge adjustment',
  reversal: 'Reversal',
}

export const PAYMENT_METHOD: Record<PaymentMethod, string> = {
  mpesa: 'M-Pesa',
  bank_transfer: 'Bank transfer',
  cash: 'Cash',
  card: 'Card',
  platform_payout: 'Platform payout',
  other: 'Other',
}

export const PAYMENT_STATUS: Record<PaymentStatus, { label: string; tone: Tone }> = {
  pending: { label: 'Pending', tone: 'warning' },
  recorded: { label: 'Recorded', tone: 'neutral' },
  verified: { label: 'Verified', tone: 'success' },
  failed: { label: 'Failed', tone: 'danger' },
}

export const TASK_STATUS: Record<TaskStatus, { label: string; tone: Tone }> = {
  pending: { label: 'To do', tone: 'warning' },
  in_progress: { label: 'In progress', tone: 'info' },
  awaiting_inspection: { label: 'Awaiting inspection', tone: 'ocean' },
  completed: { label: 'Completed', tone: 'success' },
  cancelled: { label: 'Cancelled', tone: 'muted' },
}

export const TASK_TYPE: Record<TaskType, string> = {
  turnover_clean: 'Turnover clean',
  deep_clean: 'Deep clean',
  inspection: 'Inspection',
  laundry: 'Laundry',
  restock: 'Restock',
  other: 'Other',
}

export const PRIORITY: Record<Priority, { label: string; tone: Tone }> = {
  low: { label: 'Low', tone: 'muted' },
  normal: { label: 'Normal', tone: 'neutral' },
  high: { label: 'High', tone: 'warning' },
  urgent: { label: 'Urgent', tone: 'danger' },
}
export const PRIORITIES = Object.keys(PRIORITY) as Priority[]

export const MAINTENANCE_STATUS: Record<MaintenanceStatus, { label: string; tone: Tone }> = {
  reported: { label: 'Reported', tone: 'warning' },
  assigned: { label: 'Assigned', tone: 'info' },
  in_progress: { label: 'In progress', tone: 'ocean' },
  waiting_for_parts: { label: 'Waiting for parts', tone: 'warning' },
  resolved: { label: 'Resolved', tone: 'success' },
  closed: { label: 'Closed', tone: 'muted' },
}
export const MAINTENANCE_STATUSES = Object.keys(MAINTENANCE_STATUS) as MaintenanceStatus[]

export const MAINTENANCE_CATEGORY: Record<string, string> = {
  plumbing: 'Plumbing',
  electrical: 'Electrical',
  appliance: 'Appliance',
  air_conditioning: 'Air conditioning',
  furniture: 'Furniture',
  structural: 'Structural',
  pest_control: 'Pest control',
  pool: 'Pool',
  garden: 'Garden',
  internet: 'Internet',
  security: 'Security',
  general: 'General',
}

export const PROPERTY_TYPE: Record<PropertyType, string> = {
  apartment: 'Apartment',
  villa: 'Villa',
  cottage: 'Cottage',
  house: 'House',
  studio: 'Studio',
  room: 'Room',
  other: 'Other',
}

export const BLOCK_REASON: Record<BlockReason, string> = {
  maintenance: 'Maintenance',
  owner_use: 'Owner use',
  external_calendar: 'External calendar',
  other: 'Other',
}

export const MOVEMENT_TYPE: Record<MovementType, { label: string; sign: 1 | -1 | 0 }> = {
  receipt: { label: 'Stock received', sign: 1 },
  consumption: { label: 'Used', sign: -1 },
  adjustment: { label: 'Adjustment', sign: 0 },
  return: { label: 'Returned to stock', sign: 1 },
  transfer_in: { label: 'Transfer in', sign: 1 },
  transfer_out: { label: 'Transfer out', sign: -1 },
}

export const INVENTORY_CATEGORY: Record<string, string> = {
  toiletries: 'Toiletries',
  cleaning: 'Cleaning',
  linen: 'Linen',
  kitchen: 'Kitchen',
  beverages: 'Beverages',
  maintenance: 'Maintenance',
  general: 'General',
}

export const KENYA_COASTAL_COUNTIES = ['Mombasa', 'Kwale', 'Kilifi', 'Lamu', 'Tana River', 'Taita-Taveta'] as const

export const AMENITY_SUGGESTIONS = [
  'Wi-Fi',
  'Air conditioning',
  'Ceiling fans',
  'Swimming pool',
  'Beach access',
  'Ocean view',
  'Kitchen',
  'Washing machine',
  'Parking',
  'Backup generator',
  'Hot shower',
  'Smart TV',
  'Workspace',
  'Garden',
  'BBQ grill',
  'Security guard',
  'Housekeeping',
  'Mosquito nets',
] as const
