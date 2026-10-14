import { z } from 'zod'
import { centsToDecimal, toCents } from '@/lib/currency'
import type { Database } from '@/types/database'
import { intString, money, optionalMoney, optionalText } from './common'

type PropertyRow = Database['public']['Tables']['properties']['Row']
type UnitRow = Database['public']['Tables']['property_units']['Row']

const coordinate = (min: number, max: number) =>
  z
    .string()
    .trim()
    .refine((v) => v === '' || (/^-?\d{1,3}(\.\d{1,6})?$/.test(v) && Number(v) >= min && Number(v) <= max), {
      message: `Enter a value between ${min} and ${max} (up to 6 decimals).`,
    })

const time = z.string().refine((v) => v === '' || /^\d{2}:\d{2}$/.test(v), { message: 'Use HH:MM.' })

export const PROPERTY_TYPES = ['apartment', 'villa', 'cottage', 'house', 'studio', 'room', 'other'] as const

export const propertySchema = z.object({
  name: z.string().trim().min(2, 'Enter the property name.').max(120),
  property_type: z.enum(PROPERTY_TYPES),
  description: optionalText(5000),
  location_name: optionalText(120),
  address: optionalText(500),
  county: optionalText(60),
  latitude: coordinate(-90, 90),
  longitude: coordinate(-180, 180),
  bedrooms: intString(0, 50, 'Bedrooms'),
  bathrooms: z
    .string()
    .trim()
    .refine((v) => /^\d{1,2}(\.5)?$/.test(v) && Number(v) <= 50, { message: 'Use whole or half numbers, e.g. 2 or 2.5.' }),
  max_guests: intString(1, 100, 'Maximum guests'),
  standard_nightly_rate: money('Nightly rate'),
  cleaning_fee: optionalMoney,
  amenities: z.array(z.string().trim().min(1).max(60)).max(60),
  check_in_time: time,
  check_out_time: time,
  check_in_instructions: optionalText(5000),
  check_out_instructions: optionalText(5000),
  directions: optionalText(5000),
  house_rules: optionalText(5000),
  wifi_name: optionalText(100),
  wifi_password: optionalText(100),
  caretaker_id: z.string(),
})
export type PropertyFormValues = z.infer<typeof propertySchema>

export const emptyProperty: PropertyFormValues = {
  name: '',
  property_type: 'apartment',
  description: '',
  location_name: '',
  address: '',
  county: '',
  latitude: '',
  longitude: '',
  bedrooms: '1',
  bathrooms: '1',
  max_guests: '2',
  standard_nightly_rate: '',
  cleaning_fee: '',
  amenities: [],
  check_in_time: '',
  check_out_time: '',
  check_in_instructions: '',
  check_out_instructions: '',
  directions: '',
  house_rules: '',
  wifi_name: '',
  wifi_password: '',
  caretaker_id: '',
}

const blank = (v: string) => (v.trim() === '' ? null : v.trim())

export function propertyToForm(p: PropertyRow): PropertyFormValues {
  return {
    name: p.name,
    property_type: p.property_type,
    description: p.description ?? '',
    location_name: p.location_name ?? '',
    address: p.address ?? '',
    county: p.county ?? '',
    latitude: p.latitude?.toString() ?? '',
    longitude: p.longitude?.toString() ?? '',
    bedrooms: String(p.bedrooms),
    bathrooms: String(p.bathrooms),
    max_guests: String(p.max_guests),
    standard_nightly_rate: centsToDecimal(toCents(p.standard_nightly_rate)),
    cleaning_fee: centsToDecimal(toCents(p.cleaning_fee)),
    amenities: p.amenities,
    check_in_time: p.check_in_time?.slice(0, 5) ?? '',
    check_out_time: p.check_out_time?.slice(0, 5) ?? '',
    check_in_instructions: p.check_in_instructions ?? '',
    check_out_instructions: p.check_out_instructions ?? '',
    directions: p.directions ?? '',
    house_rules: p.house_rules ?? '',
    wifi_name: p.wifi_name ?? '',
    wifi_password: p.wifi_password ?? '',
    caretaker_id: p.caretaker_id ?? '',
  }
}

export function formToProperty(v: PropertyFormValues) {
  return {
    name: v.name.trim(),
    property_type: v.property_type,
    description: blank(v.description),
    location_name: blank(v.location_name),
    address: blank(v.address),
    county: blank(v.county),
    latitude: v.latitude ? Number(v.latitude) : null,
    longitude: v.longitude ? Number(v.longitude) : null,
    bedrooms: Number(v.bedrooms),
    bathrooms: Number(v.bathrooms),
    max_guests: Number(v.max_guests),
    standard_nightly_rate: Number(v.standard_nightly_rate),
    cleaning_fee: v.cleaning_fee ? Number(v.cleaning_fee) : 0,
    amenities: v.amenities,
    check_in_time: blank(v.check_in_time),
    check_out_time: blank(v.check_out_time),
    check_in_instructions: blank(v.check_in_instructions),
    check_out_instructions: blank(v.check_out_instructions),
    directions: blank(v.directions),
    house_rules: blank(v.house_rules),
    wifi_name: blank(v.wifi_name),
    wifi_password: blank(v.wifi_password),
    caretaker_id: blank(v.caretaker_id),
  }
}

export const unitSchema = z.object({
  name: z.string().trim().min(1, 'Enter a unit name.').max(80),
  max_guests: z.string().trim().refine((v) => v === '' || (/^\d+$/.test(v) && Number(v) >= 1 && Number(v) <= 100), {
    message: 'Between 1 and 100, or leave empty to use the property maximum.',
  }),
  nightly_rate_override: optionalMoney,
})
export type UnitFormValues = z.infer<typeof unitSchema>

export function unitToForm(u: UnitRow): UnitFormValues {
  return {
    name: u.name,
    max_guests: u.max_guests?.toString() ?? '',
    nightly_rate_override: u.nightly_rate_override === null ? '' : centsToDecimal(toCents(u.nightly_rate_override)),
  }
}
