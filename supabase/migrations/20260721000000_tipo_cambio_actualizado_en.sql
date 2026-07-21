-- Guarda el momento real de actualización que informa dolarapi (no solo la fecha).
alter table public.tipo_cambio add column actualizado_en timestamptz;
