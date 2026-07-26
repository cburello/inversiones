-- cotizaciones es un cache compartido (igual que insert/update, ya abiertos a
-- cualquier usuario autenticado); faltaba la política de delete para poder
-- limpiar filas mal fechadas (ej. cuando cambia cómo se calcula "fecha").
create policy "cotizaciones_delete" on public.cotizaciones
  for delete to authenticated using (true);
