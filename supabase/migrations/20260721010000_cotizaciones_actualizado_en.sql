-- Guarda el momento en que la app buscó cada cotización (data912 no expone su propio timestamp).
alter table public.cotizaciones add column actualizado_en timestamptz;
