-- booking_payments.property_id is copied from the booking by trigger; make it a real relation so it
-- can be embedded and can never point at another organization's property.
alter table public.booking_payments
  add constraint booking_payments_property_fk foreign key (organization_id, property_id)
  references public.properties (organization_id, id);
