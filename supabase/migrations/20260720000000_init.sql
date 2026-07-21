-- Esquema inicial: especies, operaciones, cobros, movimientos_caja, cotizaciones, tipo_cambio

create extension if not exists pgcrypto;

-- especies -------------------------------------------------------------

create table public.especies (
  id uuid primary key default gen_random_uuid(),
  ticker varchar not null,
  nombre varchar,
  tipo varchar not null check (tipo in ('accion', 'cedear', 'bono', 'on', 'fci')),
  moneda_cotizacion varchar not null check (moneda_cotizacion in ('ARS', 'USD')),
  factor_cotizacion numeric not null default 1,
  vencimiento date,
  tasa numeric,
  ley varchar check (ley in ('AR', 'NY')),
  meses_pago varchar,
  creado_por uuid default auth.uid() references auth.users (id),
  created_at timestamptz not null default now(),
  unique (ticker, tipo)
);

create index especies_tipo_idx on public.especies (tipo);

alter table public.especies enable row level security;

create policy "especies_select" on public.especies
  for select to authenticated using (true);

create policy "especies_insert" on public.especies
  for insert to authenticated with check (creado_por = auth.uid());

create policy "especies_update" on public.especies
  for update to authenticated
  using (creado_por = auth.uid())
  with check (creado_por = auth.uid());

-- operaciones ------------------------------------------------------------

create table public.operaciones (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id),
  especie_id uuid not null references public.especies (id),
  tipo_operacion varchar not null check (tipo_operacion in ('compra', 'venta')),
  fecha date not null,
  cantidad numeric not null check (cantidad > 0),
  monto numeric not null check (monto > 0),
  moneda varchar not null check (moneda in ('ARS', 'USD')),
  tc_mep numeric,
  broker varchar,
  notas text,
  created_at timestamptz not null default now()
);

create index operaciones_user_id_idx on public.operaciones (user_id);
create index operaciones_especie_id_idx on public.operaciones (especie_id);
create index operaciones_fecha_idx on public.operaciones (fecha);

alter table public.operaciones enable row level security;

create policy "operaciones_all" on public.operaciones
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- cobros -------------------------------------------------------------

create table public.cobros (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id),
  especie_id uuid not null references public.especies (id),
  tipo varchar not null check (tipo in ('renta', 'amortizacion', 'dividendo')),
  fecha date not null,
  monto numeric not null check (monto > 0),
  moneda varchar not null check (moneda in ('ARS', 'USD')),
  notas text,
  created_at timestamptz not null default now()
);

create index cobros_user_id_idx on public.cobros (user_id);
create index cobros_especie_id_idx on public.cobros (especie_id);

alter table public.cobros enable row level security;

create policy "cobros_all" on public.cobros
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- movimientos_caja -------------------------------------------------------

create table public.movimientos_caja (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id),
  tipo varchar not null check (tipo in ('deposito', 'extraccion')),
  fecha date not null,
  monto numeric not null check (monto > 0),
  moneda varchar not null check (moneda in ('ARS', 'USD')),
  broker varchar,
  notas text,
  created_at timestamptz not null default now()
);

create index movimientos_caja_user_id_idx on public.movimientos_caja (user_id);

alter table public.movimientos_caja enable row level security;

create policy "movimientos_caja_all" on public.movimientos_caja
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- cotizaciones (cache compartido) ----------------------------------------

create table public.cotizaciones (
  id uuid primary key default gen_random_uuid(),
  especie_id uuid not null references public.especies (id),
  fecha date not null,
  precio numeric not null check (precio >= 0),
  moneda varchar not null check (moneda in ('ARS', 'USD')),
  fuente varchar,
  created_at timestamptz not null default now(),
  unique (especie_id, fecha, fuente)
);

alter table public.cotizaciones enable row level security;

create policy "cotizaciones_select" on public.cotizaciones
  for select to authenticated using (true);

create policy "cotizaciones_insert" on public.cotizaciones
  for insert to authenticated with check (true);

create policy "cotizaciones_update" on public.cotizaciones
  for update to authenticated using (true) with check (true);

-- tipo_cambio (compartido) ------------------------------------------------

create table public.tipo_cambio (
  fecha date primary key,
  mep numeric,
  ccl numeric,
  oficial numeric,
  fuente varchar,
  created_at timestamptz not null default now()
);

alter table public.tipo_cambio enable row level security;

create policy "tipo_cambio_select" on public.tipo_cambio
  for select to authenticated using (true);

create policy "tipo_cambio_insert" on public.tipo_cambio
  for insert to authenticated with check (true);

create policy "tipo_cambio_update" on public.tipo_cambio
  for update to authenticated using (true) with check (true);
