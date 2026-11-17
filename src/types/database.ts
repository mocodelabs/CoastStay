
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {
  
  "graphql_public": {
          Tables: {
            [_ in never]: never
          }
          Views: {
            [_ in never]: never
          }
          Functions: {
            "graphql":
{ Args: { "extensions"?: Json,"operationName"?: string,"query"?: string,"variables"?: Json }; Returns: Json
                           }
          }
          Enums: {
            [_ in never]: never
          }
          CompositeTypes: {
            [_ in never]: never
          }
        },"public": {
          Tables: {
            "audit_logs": {
                  Row: {
                    "action": string,"actor_id": string | null,"booking_id": string | null,"changes": NonNullable<Json>,"created_at": string,"entity_id": string | null,"entity_type": string,"id": number,"organization_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "action": string,"actor_id"?: string | null,"booking_id"?: string | null,"changes"?: NonNullable<Json>,"created_at"?: string,"entity_id"?: string | null,"entity_type": string,"id"?: never,"organization_id": string
                  }
                  Update: {
                    "action"?: string,"actor_id"?: string | null,"booking_id"?: string | null,"changes"?: NonNullable<Json>,"created_at"?: string,"entity_id"?: string | null,"entity_type"?: string,"id"?: never,"organization_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "audit_logs_actor_id_fkey"
      columns: ["actor_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"booking_payments": {
                  Row: {
                    "amount": number,"booking_id": string,"client_request_id": string | null,"created_at": string,"currency": string,"id": string,"notes": string | null,"organization_id": string,"payment_date": string,"payment_method": Database["public"]['Enums']["payment_method"],"payment_type": Database["public"]['Enums']["payment_type"],"property_id": string | null,"recorded_by": string | null,"reverses_payment_id": string | null,"status": Database["public"]['Enums']["payment_status"],"transaction_reference": string | null,"updated_at": string,"verification_source": string | null,"verified_at": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "amount": number,"booking_id": string,"client_request_id"?: string | null,"created_at"?: string,"currency"?: string,"id"?: string,"notes"?: string | null,"organization_id": string,"payment_date": string,"payment_method": Database["public"]['Enums']["payment_method"],"payment_type": Database["public"]['Enums']["payment_type"],"property_id"?: string | null,"recorded_by"?: string | null,"reverses_payment_id"?: string | null,"status"?: Database["public"]['Enums']["payment_status"],"transaction_reference"?: string | null,"updated_at"?: string,"verification_source"?: string | null,"verified_at"?: string | null
                  }
                  Update: {
                    "amount"?: number,"booking_id"?: string,"client_request_id"?: string | null,"created_at"?: string,"currency"?: string,"id"?: string,"notes"?: string | null,"organization_id"?: string,"payment_date"?: string,"payment_method"?: Database["public"]['Enums']["payment_method"],"payment_type"?: Database["public"]['Enums']["payment_type"],"property_id"?: string | null,"recorded_by"?: string | null,"reverses_payment_id"?: string | null,"status"?: Database["public"]['Enums']["payment_status"],"transaction_reference"?: string | null,"updated_at"?: string,"verification_source"?: string | null,"verified_at"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "booking_payments_organization_id_booking_id_fkey"
      columns: ["organization_id","booking_id"]
isOneToOne: false
      referencedRelation: "bookings"
      referencedColumns: ["organization_id","id"]
    },{
      foreignKeyName: "booking_payments_organization_id_booking_id_fkey"
      columns: ["organization_id","booking_id"]
isOneToOne: false
      referencedRelation: "bookings_overview"
      referencedColumns: ["organization_id","id"]
    },{
      foreignKeyName: "booking_payments_organization_id_fkey"
      columns: ["organization_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "booking_payments_property_fk"
      columns: ["organization_id","property_id"]
isOneToOne: false
      referencedRelation: "properties"
      referencedColumns: ["organization_id","id"]
    },{
      foreignKeyName: "booking_payments_recorded_by_fkey"
      columns: ["recorded_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "booking_payments_reverses_payment_id_fkey"
      columns: ["reverses_payment_id"]
isOneToOne: true
      referencedRelation: "booking_payments"
      referencedColumns: ["id"]
    }
                  ]
                },"bookings": {
                  Row: {
                    "accommodation_amount": number | null,"additional_fees": number,"adjustment_total": number,"adults": number,"amount_paid": number,"amount_refunded": number,"balance_due": number | null,"booking_reference": string,"booking_source": Database["public"]['Enums']["booking_source"],"cancellation_fee": number,"cancellation_reason": string | null,"cancelled_at": string | null,"check_in_date": string,"check_out_date": string,"checked_in_at": string | null,"checked_out_at": string | null,"children": number,"cleaning_fee": number,"client_request_id": string | null,"confirmed_at": string | null,"created_at": string,"created_by": string | null,"currency": string,"discount_amount": number,"external_reference": string | null,"guest_id": string,"guest_requests": string | null,"id": string,"infants": number,"internal_notes": string | null,"nightly_rate": number,"nights": number | null,"organization_id": string,"property_id": string,"status": Database["public"]['Enums']["booking_status"],"total_amount": number | null,"unit_id": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "accommodation_amount"?: never,"additional_fees"?: number,"adjustment_total"?: number,"adults"?: number,"amount_paid"?: number,"amount_refunded"?: number,"balance_due"?: never,"booking_reference"?: string,"booking_source"?: Database["public"]['Enums']["booking_source"],"cancellation_fee"?: number,"cancellation_reason"?: string | null,"cancelled_at"?: string | null,"check_in_date": string,"check_out_date": string,"checked_in_at"?: string | null,"checked_out_at"?: string | null,"children"?: number,"cleaning_fee"?: number,"client_request_id"?: string | null,"confirmed_at"?: string | null,"created_at"?: string,"created_by"?: string | null,"currency"?: string,"discount_amount"?: number,"external_reference"?: string | null,"guest_id": string,"guest_requests"?: string | null,"id"?: string,"infants"?: number,"internal_notes"?: string | null,"nightly_rate": number,"nights"?: never,"organization_id": string,"property_id": string,"status"?: Database["public"]['Enums']["booking_status"],"total_amount"?: never,"unit_id": string,"updated_at"?: string
                  }
                  Update: {
                    "accommodation_amount"?: never,"additional_fees"?: number,"adjustment_total"?: number,"adults"?: number,"amount_paid"?: number,"amount_refunded"?: number,"balance_due"?: never,"booking_reference"?: string,"booking_source"?: Database["public"]['Enums']["booking_source"],"cancellation_fee"?: number,"cancellation_reason"?: string | null,"cancelled_at"?: string | null,"check_in_date"?: string,"check_out_date"?: string,"checked_in_at"?: string | null,"checked_out_at"?: string | null,"children"?: number,"cleaning_fee"?: number,"client_request_id"?: string | null,"confirmed_at"?: string | null,"created_at"?: string,"created_by"?: string | null,"currency"?: string,"discount_amount"?: number,"external_reference"?: string | null,"guest_id"?: string,"guest_requests"?: string | null,"id"?: string,"infants"?: number,"internal_notes"?: string | null,"nightly_rate"?: number,"nights"?: never,"organization_id"?: string,"property_id"?: string,"status"?: Database["public"]['Enums']["booking_status"],"total_amount"?: never,"unit_id"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "bookings_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "bookings_organization_id_fkey"
      columns: ["organization_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "bookings_organization_id_guest_id_fkey"
      columns: ["organization_id","guest_id"]
isOneToOne: false
      referencedRelation: "guests"
      referencedColumns: ["organization_id","id"]
    },{
      foreignKeyName: "bookings_organization_id_property_id_fkey"
      columns: ["organization_id","property_id"]
isOneToOne: false
      referencedRelation: "properties"
      referencedColumns: ["organization_id","id"]
    },{
      foreignKeyName: "bookings_property_id_unit_id_fkey"
      columns: ["property_id","unit_id"]
isOneToOne: false
      referencedRelation: "property_units"
      referencedColumns: ["property_id","id"]
    }
                  ]
                },"calendar_feeds": {
                  Row: {
                    "created_at": string,"created_by": string | null,"id": string,"is_active": boolean,"last_error": string | null,"last_status": string | null,"last_synced_at": string | null,"name": string,"organization_id": string,"property_id": string,"source": Database["public"]['Enums']["booking_source"],"unit_id": string,"updated_at": string,"url": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"created_by"?: string | null,"id"?: string,"is_active"?: boolean,"last_error"?: string | null,"last_status"?: string | null,"last_synced_at"?: string | null,"name": string,"organization_id": string,"property_id": string,"source"?: Database["public"]['Enums']["booking_source"],"unit_id": string,"updated_at"?: string,"url": string
                  }
                  Update: {
                    "created_at"?: string,"created_by"?: string | null,"id"?: string,"is_active"?: boolean,"last_error"?: string | null,"last_status"?: string | null,"last_synced_at"?: string | null,"name"?: string,"organization_id"?: string,"property_id"?: string,"source"?: Database["public"]['Enums']["booking_source"],"unit_id"?: string,"updated_at"?: string,"url"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "calendar_feeds_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "calendar_feeds_organization_id_property_id_fkey"
      columns: ["organization_id","property_id"]
isOneToOne: false
      referencedRelation: "properties"
      referencedColumns: ["organization_id","id"]
    },{
      foreignKeyName: "calendar_feeds_property_id_unit_id_fkey"
      columns: ["property_id","unit_id"]
isOneToOne: false
      referencedRelation: "property_units"
      referencedColumns: ["property_id","id"]
    }
                  ]
                },"calendar_sync_runs": {
                  Row: {
                    "error": string | null,"events_created": number,"events_found": number,"events_removed": number,"events_updated": number,"feed_id": string,"finished_at": string | null,"id": string,"organization_id": string,"started_at": string,"status": string
                  }
                  ComputedFields: never
                  Insert: {
                    "error"?: string | null,"events_created"?: number,"events_found"?: number,"events_removed"?: number,"events_updated"?: number,"feed_id": string,"finished_at"?: string | null,"id"?: string,"organization_id": string,"started_at"?: string,"status"?: string
                  }
                  Update: {
                    "error"?: string | null,"events_created"?: number,"events_found"?: number,"events_removed"?: number,"events_updated"?: number,"feed_id"?: string,"finished_at"?: string | null,"id"?: string,"organization_id"?: string,"started_at"?: string,"status"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "calendar_sync_runs_feed_id_fkey"
      columns: ["feed_id"]
isOneToOne: false
      referencedRelation: "calendar_feeds"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "calendar_sync_runs_organization_id_fkey"
      columns: ["organization_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    }
                  ]
                },"checklist_templates": {
                  Row: {
                    "created_at": string,"id": string,"is_default": boolean,"items": NonNullable<Json>,"name": string,"organization_id": string,"task_type": Database["public"]['Enums']["task_type"],"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"id"?: string,"is_default"?: boolean,"items"?: NonNullable<Json>,"name": string,"organization_id": string,"task_type"?: Database["public"]['Enums']["task_type"],"updated_at"?: string
                  }
                  Update: {
                    "created_at"?: string,"id"?: string,"is_default"?: boolean,"items"?: NonNullable<Json>,"name"?: string,"organization_id"?: string,"task_type"?: Database["public"]['Enums']["task_type"],"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "checklist_templates_organization_id_fkey"
      columns: ["organization_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    }
                  ]
                },"communication_logs": {
                  Row: {
                    "body": string,"booking_id": string | null,"channel": string,"created_at": string,"created_by": string | null,"dedupe_key": string | null,"error": string | null,"guest_id": string | null,"id": string,"organization_id": string,"provider": string | null,"provider_message_id": string | null,"recipient": string | null,"status": string,"template_key": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "body"?: string,"booking_id"?: string | null,"channel": string,"created_at"?: string,"created_by"?: string | null,"dedupe_key"?: string | null,"error"?: string | null,"guest_id"?: string | null,"id"?: string,"organization_id": string,"provider"?: string | null,"provider_message_id"?: string | null,"recipient"?: string | null,"status"?: string,"template_key"?: string | null
                  }
                  Update: {
                    "body"?: string,"booking_id"?: string | null,"channel"?: string,"created_at"?: string,"created_by"?: string | null,"dedupe_key"?: string | null,"error"?: string | null,"guest_id"?: string | null,"id"?: string,"organization_id"?: string,"provider"?: string | null,"provider_message_id"?: string | null,"recipient"?: string | null,"status"?: string,"template_key"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "communication_logs_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "communication_logs_organization_id_booking_id_fkey"
      columns: ["organization_id","booking_id"]
isOneToOne: false
      referencedRelation: "bookings"
      referencedColumns: ["organization_id","id"]
    },{
      foreignKeyName: "communication_logs_organization_id_booking_id_fkey"
      columns: ["organization_id","booking_id"]
isOneToOne: false
      referencedRelation: "bookings_overview"
      referencedColumns: ["organization_id","id"]
    },{
      foreignKeyName: "communication_logs_organization_id_fkey"
      columns: ["organization_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "communication_logs_organization_id_guest_id_fkey"
      columns: ["organization_id","guest_id"]
isOneToOne: false
      referencedRelation: "guests"
      referencedColumns: ["organization_id","id"]
    }
                  ]
                },"communication_templates": {
                  Row: {
                    "body": string,"channel": string,"created_at": string,"id": string,"is_active": boolean,"is_system": boolean,"name": string,"organization_id": string,"subject": string | null,"template_key": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "body": string,"channel"?: string,"created_at"?: string,"id"?: string,"is_active"?: boolean,"is_system"?: boolean,"name": string,"organization_id": string,"subject"?: string | null,"template_key": string,"updated_at"?: string
                  }
                  Update: {
                    "body"?: string,"channel"?: string,"created_at"?: string,"id"?: string,"is_active"?: boolean,"is_system"?: boolean,"name"?: string,"organization_id"?: string,"subject"?: string | null,"template_key"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "communication_templates_organization_id_fkey"
      columns: ["organization_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    }
                  ]
                },"expense_categories": {
                  Row: {
                    "code": string,"created_at": string,"id": string,"include_in_operating_income": boolean,"is_active": boolean,"is_system": boolean,"name": string,"organization_id": string,"sort_order": number,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "code": string,"created_at"?: string,"id"?: string,"include_in_operating_income"?: boolean,"is_active"?: boolean,"is_system"?: boolean,"name": string,"organization_id": string,"sort_order"?: number,"updated_at"?: string
                  }
                  Update: {
                    "code"?: string,"created_at"?: string,"id"?: string,"include_in_operating_income"?: boolean,"is_active"?: boolean,"is_system"?: boolean,"name"?: string,"organization_id"?: string,"sort_order"?: number,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "expense_categories_organization_id_fkey"
      columns: ["organization_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    }
                  ]
                },"expenses": {
                  Row: {
                    "amount": number,"booking_id": string | null,"category": string,"client_request_id": string | null,"created_at": string,"created_by": string | null,"currency": string,"description": string,"expense_date": string,"id": string,"maintenance_request_id": string | null,"notes": string | null,"organization_id": string,"payment_method": Database["public"]['Enums']["payment_method"],"property_id": string | null,"receipt_path": string | null,"status": Database["public"]['Enums']["expense_status"],"supplier": string | null,"updated_at": string,"void_reason": string | null,"voided_at": string | null,"voided_by": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "amount": number,"booking_id"?: string | null,"category": string,"client_request_id"?: string | null,"created_at"?: string,"created_by"?: string | null,"currency"?: string,"description": string,"expense_date": string,"id"?: string,"maintenance_request_id"?: string | null,"notes"?: string | null,"organization_id": string,"payment_method"?: Database["public"]['Enums']["payment_method"],"property_id"?: string | null,"receipt_path"?: string | null,"status"?: Database["public"]['Enums']["expense_status"],"supplier"?: string | null,"updated_at"?: string,"void_reason"?: string | null,"voided_at"?: string | null,"voided_by"?: string | null
                  }
                  Update: {
                    "amount"?: number,"booking_id"?: string | null,"category"?: string,"client_request_id"?: string | null,"created_at"?: string,"created_by"?: string | null,"currency"?: string,"description"?: string,"expense_date"?: string,"id"?: string,"maintenance_request_id"?: string | null,"notes"?: string | null,"organization_id"?: string,"payment_method"?: Database["public"]['Enums']["payment_method"],"property_id"?: string | null,"receipt_path"?: string | null,"status"?: Database["public"]['Enums']["expense_status"],"supplier"?: string | null,"updated_at"?: string,"void_reason"?: string | null,"voided_at"?: string | null,"voided_by"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "expenses_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "expenses_maintenance_fk"
      columns: ["organization_id","maintenance_request_id"]
isOneToOne: false
      referencedRelation: "maintenance_requests"
      referencedColumns: ["organization_id","id"]
    },{
      foreignKeyName: "expenses_organization_id_booking_id_fkey"
      columns: ["organization_id","booking_id"]
isOneToOne: false
      referencedRelation: "bookings"
      referencedColumns: ["organization_id","id"]
    },{
      foreignKeyName: "expenses_organization_id_booking_id_fkey"
      columns: ["organization_id","booking_id"]
isOneToOne: false
      referencedRelation: "bookings_overview"
      referencedColumns: ["organization_id","id"]
    },{
      foreignKeyName: "expenses_organization_id_category_fkey"
      columns: ["organization_id","category"]
isOneToOne: false
      referencedRelation: "expense_categories"
      referencedColumns: ["organization_id","code"]
    },{
      foreignKeyName: "expenses_organization_id_fkey"
      columns: ["organization_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "expenses_organization_id_property_id_fkey"
      columns: ["organization_id","property_id"]
isOneToOne: false
      referencedRelation: "properties"
      referencedColumns: ["organization_id","id"]
    },{
      foreignKeyName: "expenses_voided_by_fkey"
      columns: ["voided_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"external_calendar_events": {
                  Row: {
                    "block_id": string | null,"booking_id": string | null,"end_date": string,"external_uid": string,"feed_id": string,"fingerprint": string,"first_seen_at": string,"id": string,"last_seen_at": string,"organization_id": string,"start_date": string,"status": string,"summary": string | null,"unit_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "block_id"?: string | null,"booking_id"?: string | null,"end_date": string,"external_uid": string,"feed_id": string,"fingerprint": string,"first_seen_at"?: string,"id"?: string,"last_seen_at"?: string,"organization_id": string,"start_date": string,"status"?: string,"summary"?: string | null,"unit_id": string
                  }
                  Update: {
                    "block_id"?: string | null,"booking_id"?: string | null,"end_date"?: string,"external_uid"?: string,"feed_id"?: string,"fingerprint"?: string,"first_seen_at"?: string,"id"?: string,"last_seen_at"?: string,"organization_id"?: string,"start_date"?: string,"status"?: string,"summary"?: string | null,"unit_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "external_calendar_events_block_id_fkey"
      columns: ["block_id"]
isOneToOne: false
      referencedRelation: "property_blocks"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "external_calendar_events_booking_id_fkey"
      columns: ["booking_id"]
isOneToOne: false
      referencedRelation: "bookings"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "external_calendar_events_booking_id_fkey"
      columns: ["booking_id"]
isOneToOne: false
      referencedRelation: "bookings_overview"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "external_calendar_events_feed_id_fkey"
      columns: ["feed_id"]
isOneToOne: false
      referencedRelation: "calendar_feeds"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "external_calendar_events_organization_id_fkey"
      columns: ["organization_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "external_calendar_events_unit_id_fkey"
      columns: ["unit_id"]
isOneToOne: false
      referencedRelation: "property_units"
      referencedColumns: ["id"]
    }
                  ]
                },"guests": {
                  Row: {
                    "anonymized_at": string | null,"country": string | null,"created_at": string,"created_by": string | null,"email": string | null,"full_name": string,"id": string,"notes": string | null,"organization_id": string,"phone": string | null,"preferences": string | null,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "anonymized_at"?: string | null,"country"?: string | null,"created_at"?: string,"created_by"?: string | null,"email"?: string | null,"full_name": string,"id"?: string,"notes"?: string | null,"organization_id": string,"phone"?: string | null,"preferences"?: string | null,"updated_at"?: string
                  }
                  Update: {
                    "anonymized_at"?: string | null,"country"?: string | null,"created_at"?: string,"created_by"?: string | null,"email"?: string | null,"full_name"?: string,"id"?: string,"notes"?: string | null,"organization_id"?: string,"phone"?: string | null,"preferences"?: string | null,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "guests_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "guests_organization_id_fkey"
      columns: ["organization_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    }
                  ]
                },"housekeeping_checklist_items": {
                  Row: {
                    "completed_at": string | null,"completed_by": string | null,"id": string,"is_completed": boolean,"label": string,"notes": string | null,"organization_id": string,"requires_photo": boolean,"sort_order": number,"task_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "completed_at"?: string | null,"completed_by"?: string | null,"id"?: string,"is_completed"?: boolean,"label": string,"notes"?: string | null,"organization_id": string,"requires_photo"?: boolean,"sort_order"?: number,"task_id": string
                  }
                  Update: {
                    "completed_at"?: string | null,"completed_by"?: string | null,"id"?: string,"is_completed"?: boolean,"label"?: string,"notes"?: string | null,"organization_id"?: string,"requires_photo"?: boolean,"sort_order"?: number,"task_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "housekeeping_checklist_items_completed_by_fkey"
      columns: ["completed_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "housekeeping_checklist_items_organization_id_task_id_fkey"
      columns: ["organization_id","task_id"]
isOneToOne: false
      referencedRelation: "housekeeping_tasks"
      referencedColumns: ["organization_id","id"]
    }
                  ]
                },"housekeeping_task_comments": {
                  Row: {
                    "author_id": string | null,"body": string,"created_at": string,"id": string,"organization_id": string,"task_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "author_id"?: string | null,"body": string,"created_at"?: string,"id"?: string,"organization_id": string,"task_id": string
                  }
                  Update: {
                    "author_id"?: string | null,"body"?: string,"created_at"?: string,"id"?: string,"organization_id"?: string,"task_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "housekeeping_task_comments_author_id_fkey"
      columns: ["author_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "housekeeping_task_comments_organization_id_task_id_fkey"
      columns: ["organization_id","task_id"]
isOneToOne: false
      referencedRelation: "housekeeping_tasks"
      referencedColumns: ["organization_id","id"]
    }
                  ]
                },"housekeeping_task_photos": {
                  Row: {
                    "caption": string | null,"checklist_item_id": string | null,"created_at": string,"id": string,"organization_id": string,"storage_path": string,"task_id": string,"uploaded_by": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "caption"?: string | null,"checklist_item_id"?: string | null,"created_at"?: string,"id"?: string,"organization_id": string,"storage_path": string,"task_id": string,"uploaded_by"?: string | null
                  }
                  Update: {
                    "caption"?: string | null,"checklist_item_id"?: string | null,"created_at"?: string,"id"?: string,"organization_id"?: string,"storage_path"?: string,"task_id"?: string,"uploaded_by"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "housekeeping_task_photos_checklist_item_id_fkey"
      columns: ["checklist_item_id"]
isOneToOne: false
      referencedRelation: "housekeeping_checklist_items"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "housekeeping_task_photos_organization_id_task_id_fkey"
      columns: ["organization_id","task_id"]
isOneToOne: false
      referencedRelation: "housekeeping_tasks"
      referencedColumns: ["organization_id","id"]
    },{
      foreignKeyName: "housekeeping_task_photos_uploaded_by_fkey"
      columns: ["uploaded_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"housekeeping_tasks": {
                  Row: {
                    "assigned_to": string | null,"booking_id": string | null,"completed_at": string | null,"completion_notes": string | null,"created_at": string,"created_by": string | null,"description": string | null,"due_at": string | null,"generation_key": string | null,"id": string,"inspected_at": string | null,"inspected_by": string | null,"inspection_required": boolean,"organization_id": string,"priority": Database["public"]['Enums']["priority_level"],"property_id": string,"scheduled_at": string,"started_at": string | null,"status": Database["public"]['Enums']["task_status"],"task_type": Database["public"]['Enums']["task_type"],"title": string,"unit_id": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "assigned_to"?: string | null,"booking_id"?: string | null,"completed_at"?: string | null,"completion_notes"?: string | null,"created_at"?: string,"created_by"?: string | null,"description"?: string | null,"due_at"?: string | null,"generation_key"?: string | null,"id"?: string,"inspected_at"?: string | null,"inspected_by"?: string | null,"inspection_required"?: boolean,"organization_id": string,"priority"?: Database["public"]['Enums']["priority_level"],"property_id": string,"scheduled_at": string,"started_at"?: string | null,"status"?: Database["public"]['Enums']["task_status"],"task_type"?: Database["public"]['Enums']["task_type"],"title": string,"unit_id": string,"updated_at"?: string
                  }
                  Update: {
                    "assigned_to"?: string | null,"booking_id"?: string | null,"completed_at"?: string | null,"completion_notes"?: string | null,"created_at"?: string,"created_by"?: string | null,"description"?: string | null,"due_at"?: string | null,"generation_key"?: string | null,"id"?: string,"inspected_at"?: string | null,"inspected_by"?: string | null,"inspection_required"?: boolean,"organization_id"?: string,"priority"?: Database["public"]['Enums']["priority_level"],"property_id"?: string,"scheduled_at"?: string,"started_at"?: string | null,"status"?: Database["public"]['Enums']["task_status"],"task_type"?: Database["public"]['Enums']["task_type"],"title"?: string,"unit_id"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "housekeeping_tasks_assignee_profile_fk"
      columns: ["assigned_to"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "housekeeping_tasks_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "housekeeping_tasks_inspected_by_fkey"
      columns: ["inspected_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "housekeeping_tasks_organization_id_assigned_to_fkey"
      columns: ["organization_id","assigned_to"]
isOneToOne: false
      referencedRelation: "organization_members"
      referencedColumns: ["organization_id","user_id"]
    },{
      foreignKeyName: "housekeeping_tasks_organization_id_booking_id_fkey"
      columns: ["organization_id","booking_id"]
isOneToOne: false
      referencedRelation: "bookings"
      referencedColumns: ["organization_id","id"]
    },{
      foreignKeyName: "housekeeping_tasks_organization_id_booking_id_fkey"
      columns: ["organization_id","booking_id"]
isOneToOne: false
      referencedRelation: "bookings_overview"
      referencedColumns: ["organization_id","id"]
    },{
      foreignKeyName: "housekeeping_tasks_organization_id_property_id_fkey"
      columns: ["organization_id","property_id"]
isOneToOne: false
      referencedRelation: "properties"
      referencedColumns: ["organization_id","id"]
    },{
      foreignKeyName: "housekeeping_tasks_property_id_unit_id_fkey"
      columns: ["property_id","unit_id"]
isOneToOne: false
      referencedRelation: "property_units"
      referencedColumns: ["property_id","id"]
    }
                  ]
                },"inventory_items": {
                  Row: {
                    "category": string,"created_at": string,"id": string,"is_active": boolean,"is_low_stock": boolean | null,"minimum_quantity": number,"name": string,"organization_id": string,"property_id": string | null,"quantity_on_hand": number,"unit_cost": number | null,"unit_of_measure": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "category"?: string,"created_at"?: string,"id"?: string,"is_active"?: boolean,"is_low_stock"?: never,"minimum_quantity"?: number,"name": string,"organization_id": string,"property_id"?: string | null,"quantity_on_hand"?: number,"unit_cost"?: number | null,"unit_of_measure"?: string,"updated_at"?: string
                  }
                  Update: {
                    "category"?: string,"created_at"?: string,"id"?: string,"is_active"?: boolean,"is_low_stock"?: never,"minimum_quantity"?: number,"name"?: string,"organization_id"?: string,"property_id"?: string | null,"quantity_on_hand"?: number,"unit_cost"?: number | null,"unit_of_measure"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "inventory_items_organization_id_fkey"
      columns: ["organization_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "inventory_items_organization_id_property_id_fkey"
      columns: ["organization_id","property_id"]
isOneToOne: false
      referencedRelation: "properties"
      referencedColumns: ["organization_id","id"]
    }
                  ]
                },"inventory_movements": {
                  Row: {
                    "balance_after": number,"client_request_id": string | null,"created_at": string,"housekeeping_task_id": string | null,"id": string,"inventory_item_id": string,"movement_type": Database["public"]['Enums']["inventory_movement_type"],"notes": string | null,"organization_id": string,"performed_by": string | null,"quantity": number,"reference": string | null,"unit_cost": number | null
                  }
                  ComputedFields: never
                  Insert: {
                    "balance_after"?: number,"client_request_id"?: string | null,"created_at"?: string,"housekeeping_task_id"?: string | null,"id"?: string,"inventory_item_id": string,"movement_type": Database["public"]['Enums']["inventory_movement_type"],"notes"?: string | null,"organization_id": string,"performed_by"?: string | null,"quantity": number,"reference"?: string | null,"unit_cost"?: number | null
                  }
                  Update: {
                    "balance_after"?: number,"client_request_id"?: string | null,"created_at"?: string,"housekeeping_task_id"?: string | null,"id"?: string,"inventory_item_id"?: string,"movement_type"?: Database["public"]['Enums']["inventory_movement_type"],"notes"?: string | null,"organization_id"?: string,"performed_by"?: string | null,"quantity"?: number,"reference"?: string | null,"unit_cost"?: number | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "inventory_movements_organization_id_housekeeping_task_id_fkey"
      columns: ["organization_id","housekeeping_task_id"]
isOneToOne: false
      referencedRelation: "housekeeping_tasks"
      referencedColumns: ["organization_id","id"]
    },{
      foreignKeyName: "inventory_movements_organization_id_inventory_item_id_fkey"
      columns: ["organization_id","inventory_item_id"]
isOneToOne: false
      referencedRelation: "inventory_items"
      referencedColumns: ["organization_id","id"]
    },{
      foreignKeyName: "inventory_movements_organization_id_inventory_item_id_fkey"
      columns: ["organization_id","inventory_item_id"]
isOneToOne: false
      referencedRelation: "inventory_reconciliation"
      referencedColumns: ["organization_id","inventory_item_id"]
    },{
      foreignKeyName: "inventory_movements_performed_by_fkey"
      columns: ["performed_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"maintenance_attachments": {
                  Row: {
                    "caption": string | null,"created_at": string,"id": string,"organization_id": string,"request_id": string,"storage_path": string,"uploaded_by": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "caption"?: string | null,"created_at"?: string,"id"?: string,"organization_id": string,"request_id": string,"storage_path": string,"uploaded_by"?: string | null
                  }
                  Update: {
                    "caption"?: string | null,"created_at"?: string,"id"?: string,"organization_id"?: string,"request_id"?: string,"storage_path"?: string,"uploaded_by"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "maintenance_attachments_organization_id_request_id_fkey"
      columns: ["organization_id","request_id"]
isOneToOne: false
      referencedRelation: "maintenance_requests"
      referencedColumns: ["organization_id","id"]
    },{
      foreignKeyName: "maintenance_attachments_uploaded_by_fkey"
      columns: ["uploaded_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"maintenance_requests": {
                  Row: {
                    "actual_cost": number | null,"assigned_to": string | null,"category": string,"created_at": string,"description": string | null,"estimated_cost": number | null,"id": string,"organization_id": string,"priority": Database["public"]['Enums']["priority_level"],"property_id": string,"reported_at": string,"reported_by": string | null,"resolution_notes": string | null,"resolved_at": string | null,"status": Database["public"]['Enums']["maintenance_status"],"target_date": string | null,"technician_name": string | null,"technician_phone": string | null,"title": string,"unit_id": string | null,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "actual_cost"?: number | null,"assigned_to"?: string | null,"category"?: string,"created_at"?: string,"description"?: string | null,"estimated_cost"?: number | null,"id"?: string,"organization_id": string,"priority"?: Database["public"]['Enums']["priority_level"],"property_id": string,"reported_at"?: string,"reported_by"?: string | null,"resolution_notes"?: string | null,"resolved_at"?: string | null,"status"?: Database["public"]['Enums']["maintenance_status"],"target_date"?: string | null,"technician_name"?: string | null,"technician_phone"?: string | null,"title": string,"unit_id"?: string | null,"updated_at"?: string
                  }
                  Update: {
                    "actual_cost"?: number | null,"assigned_to"?: string | null,"category"?: string,"created_at"?: string,"description"?: string | null,"estimated_cost"?: number | null,"id"?: string,"organization_id"?: string,"priority"?: Database["public"]['Enums']["priority_level"],"property_id"?: string,"reported_at"?: string,"reported_by"?: string | null,"resolution_notes"?: string | null,"resolved_at"?: string | null,"status"?: Database["public"]['Enums']["maintenance_status"],"target_date"?: string | null,"technician_name"?: string | null,"technician_phone"?: string | null,"title"?: string,"unit_id"?: string | null,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "maintenance_requests_assignee_profile_fk"
      columns: ["assigned_to"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "maintenance_requests_organization_id_assigned_to_fkey"
      columns: ["organization_id","assigned_to"]
isOneToOne: false
      referencedRelation: "organization_members"
      referencedColumns: ["organization_id","user_id"]
    },{
      foreignKeyName: "maintenance_requests_organization_id_property_id_fkey"
      columns: ["organization_id","property_id"]
isOneToOne: false
      referencedRelation: "properties"
      referencedColumns: ["organization_id","id"]
    },{
      foreignKeyName: "maintenance_requests_property_id_unit_id_fkey"
      columns: ["property_id","unit_id"]
isOneToOne: false
      referencedRelation: "property_units"
      referencedColumns: ["property_id","id"]
    },{
      foreignKeyName: "maintenance_requests_reported_by_fkey"
      columns: ["reported_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"notifications": {
                  Row: {
                    "created_at": string,"dedupe_key": string | null,"id": string,"message": string,"notification_type": string,"organization_id": string,"read_at": string | null,"related_entity_id": string | null,"related_entity_type": string | null,"title": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"dedupe_key"?: string | null,"id"?: string,"message"?: string,"notification_type": string,"organization_id": string,"read_at"?: string | null,"related_entity_id"?: string | null,"related_entity_type"?: string | null,"title": string,"user_id": string
                  }
                  Update: {
                    "created_at"?: string,"dedupe_key"?: string | null,"id"?: string,"message"?: string,"notification_type"?: string,"organization_id"?: string,"read_at"?: string | null,"related_entity_id"?: string | null,"related_entity_type"?: string | null,"title"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "notifications_organization_id_fkey"
      columns: ["organization_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "notifications_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"organization_invitations": {
                  Row: {
                    "accepted_at": string | null,"accepted_by": string | null,"can_view_finances": boolean,"created_at": string,"email": string,"expires_at": string,"full_name": string | null,"id": string,"invited_by": string | null,"organization_id": string,"property_ids": (string)[],"revoked_at": string | null,"role": Database["public"]['Enums']["member_role"],"token_hash": string
                  }
                  ComputedFields: never
                  Insert: {
                    "accepted_at"?: string | null,"accepted_by"?: string | null,"can_view_finances"?: boolean,"created_at"?: string,"email": string,"expires_at"?: string,"full_name"?: string | null,"id"?: string,"invited_by"?: string | null,"organization_id": string,"property_ids"?: (string)[],"revoked_at"?: string | null,"role": Database["public"]['Enums']["member_role"],"token_hash": string
                  }
                  Update: {
                    "accepted_at"?: string | null,"accepted_by"?: string | null,"can_view_finances"?: boolean,"created_at"?: string,"email"?: string,"expires_at"?: string,"full_name"?: string | null,"id"?: string,"invited_by"?: string | null,"organization_id"?: string,"property_ids"?: (string)[],"revoked_at"?: string | null,"role"?: Database["public"]['Enums']["member_role"],"token_hash"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "organization_invitations_accepted_by_fkey"
      columns: ["accepted_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "organization_invitations_invited_by_fkey"
      columns: ["invited_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "organization_invitations_organization_id_fkey"
      columns: ["organization_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    }
                  ]
                },"organization_members": {
                  Row: {
                    "can_view_finances": boolean,"created_at": string,"id": string,"organization_id": string,"role": Database["public"]['Enums']["member_role"],"status": Database["public"]['Enums']["member_status"],"updated_at": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "can_view_finances"?: boolean,"created_at"?: string,"id"?: string,"organization_id": string,"role": Database["public"]['Enums']["member_role"],"status"?: Database["public"]['Enums']["member_status"],"updated_at"?: string,"user_id": string
                  }
                  Update: {
                    "can_view_finances"?: boolean,"created_at"?: string,"id"?: string,"organization_id"?: string,"role"?: Database["public"]['Enums']["member_role"],"status"?: Database["public"]['Enums']["member_status"],"updated_at"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "organization_members_organization_id_fkey"
      columns: ["organization_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "organization_members_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"organization_settings": {
                  Row: {
                    "balance_due_days_before_arrival": number,"booking_reference_prefix": string,"default_check_in_time": string,"default_check_out_time": string,"default_deposit_percent": number,"enabled_payment_methods": (Database["public"]['Enums']["payment_method"])[],"notification_preferences": NonNullable<Json>,"organization_id": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "balance_due_days_before_arrival"?: number,"booking_reference_prefix"?: string,"default_check_in_time"?: string,"default_check_out_time"?: string,"default_deposit_percent"?: number,"enabled_payment_methods"?: (Database["public"]['Enums']["payment_method"])[],"notification_preferences"?: NonNullable<Json>,"organization_id": string,"updated_at"?: string
                  }
                  Update: {
                    "balance_due_days_before_arrival"?: number,"booking_reference_prefix"?: string,"default_check_in_time"?: string,"default_check_out_time"?: string,"default_deposit_percent"?: number,"enabled_payment_methods"?: (Database["public"]['Enums']["payment_method"])[],"notification_preferences"?: NonNullable<Json>,"organization_id"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "organization_settings_organization_id_fkey"
      columns: ["organization_id"]
isOneToOne: true
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    }
                  ]
                },"organizations": {
                  Row: {
                    "address": string | null,"contact_email": string | null,"contact_phone": string | null,"created_at": string,"currency": string,"id": string,"logo_url": string | null,"name": string,"slug": string,"timezone": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "address"?: string | null,"contact_email"?: string | null,"contact_phone"?: string | null,"created_at"?: string,"currency"?: string,"id"?: string,"logo_url"?: string | null,"name": string,"slug": string,"timezone"?: string,"updated_at"?: string
                  }
                  Update: {
                    "address"?: string | null,"contact_email"?: string | null,"contact_phone"?: string | null,"created_at"?: string,"currency"?: string,"id"?: string,"logo_url"?: string | null,"name"?: string,"slug"?: string,"timezone"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    
                  ]
                },"platform_admins": {
                  Row: {
                    "created_at": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"user_id": string
                  }
                  Update: {
                    "created_at"?: string,"user_id"?: string
                  }
                  Relationships: [
                    
                  ]
                },"platform_settings": {
                  Row: {
                    "allow_self_service_orgs": boolean,"billing_instructions": string,"bootstrap_owner_email": string | null,"id": boolean,"trial_days": number,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "allow_self_service_orgs"?: boolean,"billing_instructions"?: string,"bootstrap_owner_email"?: string | null,"id"?: boolean,"trial_days"?: number,"updated_at"?: string
                  }
                  Update: {
                    "allow_self_service_orgs"?: boolean,"billing_instructions"?: string,"bootstrap_owner_email"?: string | null,"id"?: boolean,"trial_days"?: number,"updated_at"?: string
                  }
                  Relationships: [
                    
                  ]
                },"profiles": {
                  Row: {
                    "avatar_url": string | null,"created_at": string,"email": string | null,"full_name": string,"id": string,"phone": string | null,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "avatar_url"?: string | null,"created_at"?: string,"email"?: string | null,"full_name"?: string,"id": string,"phone"?: string | null,"updated_at"?: string
                  }
                  Update: {
                    "avatar_url"?: string | null,"created_at"?: string,"email"?: string | null,"full_name"?: string,"id"?: string,"phone"?: string | null,"updated_at"?: string
                  }
                  Relationships: [
                    
                  ]
                },"properties": {
                  Row: {
                    "address": string | null,"amenities": (string)[],"bathrooms": number,"bedrooms": number,"caretaker_id": string | null,"check_in_instructions": string | null,"check_in_time": string | null,"check_out_instructions": string | null,"check_out_time": string | null,"cleaning_fee": number,"county": string | null,"created_at": string,"description": string | null,"directions": string | null,"house_rules": string | null,"id": string,"latitude": number | null,"location_name": string | null,"longitude": number | null,"max_guests": number,"name": string,"organization_id": string,"property_type": Database["public"]['Enums']["property_type"],"slug": string,"standard_nightly_rate": number,"status": Database["public"]['Enums']["property_status"],"updated_at": string,"wifi_name": string | null,"wifi_password": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "address"?: string | null,"amenities"?: (string)[],"bathrooms"?: number,"bedrooms"?: number,"caretaker_id"?: string | null,"check_in_instructions"?: string | null,"check_in_time"?: string | null,"check_out_instructions"?: string | null,"check_out_time"?: string | null,"cleaning_fee"?: number,"county"?: string | null,"created_at"?: string,"description"?: string | null,"directions"?: string | null,"house_rules"?: string | null,"id"?: string,"latitude"?: number | null,"location_name"?: string | null,"longitude"?: number | null,"max_guests"?: number,"name": string,"organization_id": string,"property_type"?: Database["public"]['Enums']["property_type"],"slug"?: string,"standard_nightly_rate"?: number,"status"?: Database["public"]['Enums']["property_status"],"updated_at"?: string,"wifi_name"?: string | null,"wifi_password"?: string | null
                  }
                  Update: {
                    "address"?: string | null,"amenities"?: (string)[],"bathrooms"?: number,"bedrooms"?: number,"caretaker_id"?: string | null,"check_in_instructions"?: string | null,"check_in_time"?: string | null,"check_out_instructions"?: string | null,"check_out_time"?: string | null,"cleaning_fee"?: number,"county"?: string | null,"created_at"?: string,"description"?: string | null,"directions"?: string | null,"house_rules"?: string | null,"id"?: string,"latitude"?: number | null,"location_name"?: string | null,"longitude"?: number | null,"max_guests"?: number,"name"?: string,"organization_id"?: string,"property_type"?: Database["public"]['Enums']["property_type"],"slug"?: string,"standard_nightly_rate"?: number,"status"?: Database["public"]['Enums']["property_status"],"updated_at"?: string,"wifi_name"?: string | null,"wifi_password"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "properties_caretaker_id_fkey"
      columns: ["caretaker_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "properties_organization_id_fkey"
      columns: ["organization_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    }
                  ]
                },"property_blocks": {
                  Row: {
                    "created_at": string,"created_by": string | null,"end_date": string,"external_event_id": string | null,"id": string,"maintenance_request_id": string | null,"notes": string | null,"organization_id": string,"property_id": string,"reason": Database["public"]['Enums']["block_reason"],"start_date": string,"unit_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"created_by"?: string | null,"end_date": string,"external_event_id"?: string | null,"id"?: string,"maintenance_request_id"?: string | null,"notes"?: string | null,"organization_id": string,"property_id": string,"reason"?: Database["public"]['Enums']["block_reason"],"start_date": string,"unit_id": string
                  }
                  Update: {
                    "created_at"?: string,"created_by"?: string | null,"end_date"?: string,"external_event_id"?: string | null,"id"?: string,"maintenance_request_id"?: string | null,"notes"?: string | null,"organization_id"?: string,"property_id"?: string,"reason"?: Database["public"]['Enums']["block_reason"],"start_date"?: string,"unit_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "property_blocks_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "property_blocks_external_event_fk"
      columns: ["external_event_id"]
isOneToOne: false
      referencedRelation: "external_calendar_events"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "property_blocks_maintenance_fk"
      columns: ["organization_id","maintenance_request_id"]
isOneToOne: false
      referencedRelation: "maintenance_requests"
      referencedColumns: ["organization_id","id"]
    },{
      foreignKeyName: "property_blocks_organization_id_property_id_fkey"
      columns: ["organization_id","property_id"]
isOneToOne: false
      referencedRelation: "properties"
      referencedColumns: ["organization_id","id"]
    },{
      foreignKeyName: "property_blocks_property_id_unit_id_fkey"
      columns: ["property_id","unit_id"]
isOneToOne: false
      referencedRelation: "property_units"
      referencedColumns: ["property_id","id"]
    }
                  ]
                },"property_photos": {
                  Row: {
                    "caption": string | null,"created_at": string,"id": string,"organization_id": string,"property_id": string,"sort_order": number,"storage_path": string
                  }
                  ComputedFields: never
                  Insert: {
                    "caption"?: string | null,"created_at"?: string,"id"?: string,"organization_id": string,"property_id": string,"sort_order"?: number,"storage_path": string
                  }
                  Update: {
                    "caption"?: string | null,"created_at"?: string,"id"?: string,"organization_id"?: string,"property_id"?: string,"sort_order"?: number,"storage_path"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "property_photos_organization_id_property_id_fkey"
      columns: ["organization_id","property_id"]
isOneToOne: false
      referencedRelation: "properties"
      referencedColumns: ["organization_id","id"]
    }
                  ]
                },"property_units": {
                  Row: {
                    "created_at": string,"id": string,"is_default": boolean,"max_guests": number | null,"name": string,"nightly_rate_override": number | null,"organization_id": string,"property_id": string,"status": Database["public"]['Enums']["unit_status"],"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"id"?: string,"is_default"?: boolean,"max_guests"?: number | null,"name": string,"nightly_rate_override"?: number | null,"organization_id": string,"property_id": string,"status"?: Database["public"]['Enums']["unit_status"],"updated_at"?: string
                  }
                  Update: {
                    "created_at"?: string,"id"?: string,"is_default"?: boolean,"max_guests"?: number | null,"name"?: string,"nightly_rate_override"?: number | null,"organization_id"?: string,"property_id"?: string,"status"?: Database["public"]['Enums']["unit_status"],"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "property_units_organization_id_property_id_fkey"
      columns: ["organization_id","property_id"]
isOneToOne: false
      referencedRelation: "properties"
      referencedColumns: ["organization_id","id"]
    }
                  ]
                },"recurring_task_templates": {
                  Row: {
                    "assigned_to": string | null,"checklist_template_id": string | null,"created_at": string,"created_by": string | null,"description": string | null,"frequency": string,"id": string,"interval_count": number,"is_active": boolean,"next_due_on": string,"organization_id": string,"priority": Database["public"]['Enums']["priority_level"],"property_id": string,"task_type": Database["public"]['Enums']["task_type"],"title": string,"unit_id": string | null,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "assigned_to"?: string | null,"checklist_template_id"?: string | null,"created_at"?: string,"created_by"?: string | null,"description"?: string | null,"frequency": string,"id"?: string,"interval_count"?: number,"is_active"?: boolean,"next_due_on": string,"organization_id": string,"priority"?: Database["public"]['Enums']["priority_level"],"property_id": string,"task_type"?: Database["public"]['Enums']["task_type"],"title": string,"unit_id"?: string | null,"updated_at"?: string
                  }
                  Update: {
                    "assigned_to"?: string | null,"checklist_template_id"?: string | null,"created_at"?: string,"created_by"?: string | null,"description"?: string | null,"frequency"?: string,"id"?: string,"interval_count"?: number,"is_active"?: boolean,"next_due_on"?: string,"organization_id"?: string,"priority"?: Database["public"]['Enums']["priority_level"],"property_id"?: string,"task_type"?: Database["public"]['Enums']["task_type"],"title"?: string,"unit_id"?: string | null,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "recurring_task_templates_assignee_profile_fk"
      columns: ["assigned_to"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "recurring_task_templates_checklist_template_id_fkey"
      columns: ["checklist_template_id"]
isOneToOne: false
      referencedRelation: "checklist_templates"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "recurring_task_templates_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "recurring_task_templates_organization_id_assigned_to_fkey"
      columns: ["organization_id","assigned_to"]
isOneToOne: false
      referencedRelation: "organization_members"
      referencedColumns: ["organization_id","user_id"]
    },{
      foreignKeyName: "recurring_task_templates_organization_id_property_id_fkey"
      columns: ["organization_id","property_id"]
isOneToOne: false
      referencedRelation: "properties"
      referencedColumns: ["organization_id","id"]
    },{
      foreignKeyName: "recurring_task_templates_property_id_unit_id_fkey"
      columns: ["property_id","unit_id"]
isOneToOne: false
      referencedRelation: "property_units"
      referencedColumns: ["property_id","id"]
    }
                  ]
                },"reminder_runs": {
                  Row: {
                    "error": string | null,"finished_at": string | null,"id": number,"messages_prepared": number,"notifications_created": number,"organization_id": string | null,"started_at": string,"status": string,"triggered_by": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "error"?: string | null,"finished_at"?: string | null,"id"?: never,"messages_prepared"?: number,"notifications_created"?: number,"organization_id"?: string | null,"started_at"?: string,"status"?: string,"triggered_by"?: string | null
                  }
                  Update: {
                    "error"?: string | null,"finished_at"?: string | null,"id"?: never,"messages_prepared"?: number,"notifications_created"?: number,"organization_id"?: string | null,"started_at"?: string,"status"?: string,"triggered_by"?: string | null
                  }
                  Relationships: [
                    
                  ]
                },"staff_property_assignments": {
                  Row: {
                    "created_at": string,"id": string,"organization_id": string,"property_id": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"id"?: string,"organization_id": string,"property_id": string,"user_id": string
                  }
                  Update: {
                    "created_at"?: string,"id"?: string,"organization_id"?: string,"property_id"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "staff_property_assignments_organization_id_property_id_fkey"
      columns: ["organization_id","property_id"]
isOneToOne: false
      referencedRelation: "properties"
      referencedColumns: ["organization_id","id"]
    },{
      foreignKeyName: "staff_property_assignments_organization_id_user_id_fkey"
      columns: ["organization_id","user_id"]
isOneToOne: false
      referencedRelation: "organization_members"
      referencedColumns: ["organization_id","user_id"]
    }
                  ]
                },"subscription_payment_requests": {
                  Row: {
                    "amount": number,"id": string,"method": string,"organization_id": string,"period_end": string | null,"period_start": string | null,"plan": string,"reference": string,"review_note": string | null,"reviewed_at": string | null,"reviewed_by": string | null,"status": string,"submitted_at": string,"submitted_by": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "amount": number,"id"?: string,"method": string,"organization_id": string,"period_end"?: string | null,"period_start"?: string | null,"plan": string,"reference": string,"review_note"?: string | null,"reviewed_at"?: string | null,"reviewed_by"?: string | null,"status"?: string,"submitted_at"?: string,"submitted_by"?: string | null
                  }
                  Update: {
                    "amount"?: number,"id"?: string,"method"?: string,"organization_id"?: string,"period_end"?: string | null,"period_start"?: string | null,"plan"?: string,"reference"?: string,"review_note"?: string | null,"reviewed_at"?: string | null,"reviewed_by"?: string | null,"status"?: string,"submitted_at"?: string,"submitted_by"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "subscription_payment_requests_organization_id_fkey"
      columns: ["organization_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "subscription_payment_requests_plan_fkey"
      columns: ["plan"]
isOneToOne: false
      referencedRelation: "subscription_plans"
      referencedColumns: ["code"]
    },{
      foreignKeyName: "subscription_payment_requests_reviewed_by_fkey"
      columns: ["reviewed_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "subscription_payment_requests_submitted_by_fkey"
      columns: ["submitted_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"subscription_plans": {
                  Row: {
                    "code": string,"name": string,"period": string,"price": number,"sort_order": number
                  }
                  ComputedFields: never
                  Insert: {
                    "code": string,"name": string,"period": string,"price": number,"sort_order"?: number
                  }
                  Update: {
                    "code"?: string,"name"?: string,"period"?: string,"price"?: number,"sort_order"?: number
                  }
                  Relationships: [
                    
                  ]
                },"subscriptions": {
                  Row: {
                    "created_at": string,"current_period_end": string | null,"organization_id": string,"plan": string | null,"trial_ends_at": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"current_period_end"?: string | null,"organization_id": string,"plan"?: string | null,"trial_ends_at": string,"updated_at"?: string
                  }
                  Update: {
                    "created_at"?: string,"current_period_end"?: string | null,"organization_id"?: string,"plan"?: string | null,"trial_ends_at"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "subscriptions_organization_id_fkey"
      columns: ["organization_id"]
isOneToOne: true
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "subscriptions_plan_fkey"
      columns: ["plan"]
isOneToOne: false
      referencedRelation: "subscription_plans"
      referencedColumns: ["code"]
    }
                  ]
                },"unit_occupancy": {
                  Row: {
                    "block_id": string | null,"booking_id": string | null,"created_at": string,"during": unknown,"id": string,"organization_id": string,"source_type": string,"unit_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "block_id"?: string | null,"booking_id"?: string | null,"created_at"?: string,"during": unknown,"id"?: string,"organization_id": string,"source_type": string,"unit_id": string
                  }
                  Update: {
                    "block_id"?: string | null,"booking_id"?: string | null,"created_at"?: string,"during"?: unknown,"id"?: string,"organization_id"?: string,"source_type"?: string,"unit_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "unit_occupancy_block_id_fkey"
      columns: ["block_id"]
isOneToOne: true
      referencedRelation: "property_blocks"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "unit_occupancy_booking_fk"
      columns: ["booking_id"]
isOneToOne: true
      referencedRelation: "bookings"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "unit_occupancy_booking_fk"
      columns: ["booking_id"]
isOneToOne: true
      referencedRelation: "bookings_overview"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "unit_occupancy_organization_id_fkey"
      columns: ["organization_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "unit_occupancy_unit_id_fkey"
      columns: ["unit_id"]
isOneToOne: false
      referencedRelation: "property_units"
      referencedColumns: ["id"]
    }
                  ]
                }
          }
          Views: {
            "bookings_overview": {
                  Row: {
                    "adults": number | null,"amount_paid": number | null,"amount_refunded": number | null,"balance_due": number | null,"booking_reference": string | null,"booking_source": Database["public"]['Enums']["booking_source"] | null,"check_in_date": string | null,"check_out_date": string | null,"children": number | null,"created_at": string | null,"currency": string | null,"external_reference": string | null,"guest_id": string | null,"guest_name": string | null,"guest_phone": string | null,"id": string | null,"infants": number | null,"nightly_rate": number | null,"nights": number | null,"organization_id": string | null,"payment_state": string | null,"property_id": string | null,"property_name": string | null,"search_text": string | null,"status": Database["public"]['Enums']["booking_status"] | null,"total_amount": number | null,"unit_id": string | null,"unit_is_default": boolean | null,"unit_name": string | null
                  }
                  ComputedFields: never
                  Relationships: [
                    {
      foreignKeyName: "bookings_organization_id_fkey"
      columns: ["organization_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "bookings_organization_id_guest_id_fkey"
      columns: ["organization_id","guest_id"]
isOneToOne: false
      referencedRelation: "guests"
      referencedColumns: ["organization_id","id"]
    },{
      foreignKeyName: "bookings_organization_id_property_id_fkey"
      columns: ["organization_id","property_id"]
isOneToOne: false
      referencedRelation: "properties"
      referencedColumns: ["organization_id","id"]
    },{
      foreignKeyName: "bookings_property_id_unit_id_fkey"
      columns: ["property_id","unit_id"]
isOneToOne: false
      referencedRelation: "property_units"
      referencedColumns: ["property_id","id"]
    }
                  ]
                },"inventory_reconciliation": {
                  Row: {
                    "difference": number | null,"inventory_item_id": string | null,"ledger_quantity": number | null,"name": string | null,"organization_id": string | null,"property_id": string | null,"quantity_on_hand": number | null
                  }
                  ComputedFields: never
                  Relationships: [
                    {
      foreignKeyName: "inventory_items_organization_id_fkey"
      columns: ["organization_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "inventory_items_organization_id_property_id_fkey"
      columns: ["organization_id","property_id"]
isOneToOne: false
      referencedRelation: "properties"
      referencedColumns: ["organization_id","id"]
    }
                  ]
                }
          }
          Functions: {
            "accept_invitation":
{ Args: { "invite_token": string }; Returns: string
                           },
"anonymize_guest":
{ Args: { "target": string }; Returns: undefined
                           },
"billing_instructions":
{ Args: Record<PropertyKey, never>; Returns: string
                           },
"can_create_organization":
{ Args: Record<PropertyKey, never>; Returns: boolean
                           },
"create_booking":
{ Args: { "payload": Json }; Returns: string
                           },
"create_invitation":
{ Args: { "invite_can_view_finances"?: boolean,"invite_email": string,"invite_full_name"?: string,"invite_property_ids"?: (string)[],"invite_role": Database["public"]['Enums']["member_role"],"org": string }; Returns: {
              "expires_at": string,"invitation_id": string,"token": string
            }[]
                           },
"create_organization":
{ Args: { "org_contact_email"?: string,"org_contact_phone"?: string,"org_name": string }; Returns: string
                           },
"dashboard_today":
{ Args: { "org": string }; Returns: {
              "active_units": number,"arrivals": number,"available_units": number,"blocked_units": number,"departures": number,"occupied_units": number,"properties": number,"today": string
            }[]
                           },
"finance_summary":
{ Args: { "from_date": string,"org": string,"prop"?: string,"to_date": string }; Returns: {
              "credits_owed": number,"estimated_operating_income": number,"expenses_operating": number,"expenses_total": number,"net_collected": number,"outstanding_balance": number,"payments_received": number,"refunds": number
            }[]
                           },
"get_invitation":
{ Args: { "invite_token": string }; Returns: {
              "email": string,"expires_at": string,"organization_name": string,"role": Database["public"]['Enums']["member_role"],"state": string
            }[]
                           },
"housekeeping_schedule":
{ Args: { "from_date": string,"org": string,"to_date": string }; Returns: {
              "booking_id": string,"booking_reference": string,"check_in_date": string,"check_out_date": string,"guest_count": number,"guest_first_name": string,"guest_requests": string,"property_id": string,"property_name": string,"status": Database["public"]['Enums']["booking_status"],"unit_id": string,"unit_name": string
            }[]
                           },
"is_platform_admin":
{ Args: Record<PropertyKey, never>; Returns: boolean
                           },
"my_permissions":
{ Args: { "org": string }; Returns: (string)[]
                           },
"my_property_ids":
{ Args: { "org": string }; Returns: string[]
                           },
"platform_payment_requests":
{ Args: Record<PropertyKey, never>; Returns: {
              "amount": number,"id": string,"method": string,"organization_id": string,"organization_name": string,"plan": string,"reference": string,"review_note": string,"reviewed_at": string,"status": string,"submitted_at": string,"submitted_by_email": string
            }[]
                           },
"platform_subscriptions":
{ Args: Record<PropertyKey, never>; Returns: {
              "created_at": string,"current_period_end": string,"organization_id": string,"organization_name": string,"owner_email": string,"pending_requests": number,"plan": string,"state": string,"trial_ends_at": string
            }[]
                           },
"report_monthly":
{ Args: { "first_month": string,"months": number,"org": string }; Returns: {
              "accommodation_revenue": number,"available_nights": number,"estimated_operating_income": number,"month": string,"net_collected": number,"occupied_nights": number,"operating_expenses": number,"refunds": number,"reservation_value": number
            }[]
                           },
"report_property_performance":
{ Args: { "from_date": string,"org": string,"to_date": string }; Returns: {
              "accommodation_revenue": number,"available_nights": number,"blocked_nights": number,"occupied_nights": number,"operating_expenses": number,"payments_collected": number,"property_id": string,"property_name": string,"reservation_value": number,"unit_count": number
            }[]
                           },
"request_subscription_payment":
{ Args: { "org": string,"pay_method": string,"pay_reference": string,"plan_code": string }; Returns: string
                           },
"review_subscription_payment":
{ Args: { "approve": boolean,"note"?: string,"request_id": string }; Returns: {
              "amount": number,
"id": string,
"method": string,
"organization_id": string,
"period_end": string | null,
"period_start": string | null,
"plan": string,
"reference": string,
"review_note": string | null,
"reviewed_at": string | null,
"reviewed_by": string | null,
"status": string,
"submitted_at": string,
"submitted_by": string | null
            }
                          SetofOptions: {
        from: "*"
        to: "subscription_payment_requests"
        isOneToOne: true
        isSetofReturn: false
      } },
"run_reminders":
{ Args: { "target_org"?: string }; Returns: {
              "messages": number,"notifications": number,"organization_id": string
            }[]
                           },
"subscription_status":
{ Args: { "org": string }; Returns: {
              "can_manage": boolean,"current_period_end": string,"days_left": number,"pending_request": boolean,"plan": string,"state": string,"trial_ends_at": string
            }[]
                           },
"sync_calendar_feed":
{ Args: { "events": Json,"feed_id": string,"fetch_error"?: string }; Returns: Json
                           },
"unit_conflicts":
{ Args: { "from_date": string,"ignore_booking"?: string,"target_unit": string,"to_date": string }; Returns: {
              "block_id": string,"booking_id": string,"end_date": string,"label": string,"source_type": string,"start_date": string
            }[]
                           }
          }
          Enums: {
            "block_reason": "maintenance"|"owner_use"|"external_calendar"|"other","booking_source": "airbnb"|"booking_com"|"direct"|"whatsapp"|"phone"|"other","booking_status": "inquiry"|"pending"|"confirmed"|"checked_in"|"checked_out"|"cancelled"|"no_show","expense_status": "recorded"|"void","inventory_movement_type": "receipt"|"consumption"|"adjustment"|"return"|"transfer_in"|"transfer_out","maintenance_status": "reported"|"assigned"|"in_progress"|"waiting_for_parts"|"resolved"|"closed","member_role": "owner"|"manager"|"housekeeping"|"finance","member_status": "active"|"suspended","payment_method": "mpesa"|"bank_transfer"|"cash"|"card"|"platform_payout"|"other","payment_status": "pending"|"recorded"|"verified"|"failed","payment_type": "deposit"|"balance"|"payment"|"refund"|"adjustment_credit"|"adjustment_debit"|"reversal","priority_level": "low"|"normal"|"high"|"urgent","property_status": "active"|"inactive","property_type": "apartment"|"villa"|"cottage"|"house"|"studio"|"room"|"other","task_status": "pending"|"in_progress"|"awaiting_inspection"|"completed"|"cancelled","task_type": "turnover_clean"|"deep_clean"|"inspection"|"laundry"|"restock"|"other","unit_status": "active"|"inactive"
          }
          CompositeTypes: {
            [_ in never]: never
          }
        }
}

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
  ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
      Row: infer R
    }
    ? R
    : never
  : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
  ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
      Insert: infer I
    }
    ? I
    : never
  : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
  ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
      Update: infer U
    }
    ? U
    : never
  : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
  ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
  : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never
> = PublicCompositeTypeNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
  ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
  : never

export const Constants = {
  "graphql_public": {
          Enums: {
            
          }
        },"public": {
          Enums: {
            "block_reason": ["maintenance", "owner_use", "external_calendar", "other"],"booking_source": ["airbnb", "booking_com", "direct", "whatsapp", "phone", "other"],"booking_status": ["inquiry", "pending", "confirmed", "checked_in", "checked_out", "cancelled", "no_show"],"expense_status": ["recorded", "void"],"inventory_movement_type": ["receipt", "consumption", "adjustment", "return", "transfer_in", "transfer_out"],"maintenance_status": ["reported", "assigned", "in_progress", "waiting_for_parts", "resolved", "closed"],"member_role": ["owner", "manager", "housekeeping", "finance"],"member_status": ["active", "suspended"],"payment_method": ["mpesa", "bank_transfer", "cash", "card", "platform_payout", "other"],"payment_status": ["pending", "recorded", "verified", "failed"],"payment_type": ["deposit", "balance", "payment", "refund", "adjustment_credit", "adjustment_debit", "reversal"],"priority_level": ["low", "normal", "high", "urgent"],"property_status": ["active", "inactive"],"property_type": ["apartment", "villa", "cottage", "house", "studio", "room", "other"],"task_status": ["pending", "in_progress", "awaiting_inspection", "completed", "cancelled"],"task_type": ["turnover_clean", "deep_clean", "inspection", "laundry", "restock", "other"],"unit_status": ["active", "inactive"]
          }
        }
} as const
