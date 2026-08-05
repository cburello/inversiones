-- Marca operaciones cargadas "a posteriori" (compras/ventas históricas,
-- previas a llevar el registro de líquido) para excluirlas del cálculo de
-- saldo disponible y de la validación de fondos al comprar.
alter table public.operaciones add column carga_historica boolean not null default false;
