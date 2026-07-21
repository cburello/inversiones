# Cartera de inversiones

App web (React + Vite + Supabase) para seguimiento personal de inversiones: acciones, CEDEARs, bonos, obligaciones negociables y FCI. Ver [SPEC-cartera-inversiones.md](./SPEC-cartera-inversiones.md) para el detalle completo.

## Desarrollo local

1. Copiá `.env.example` a `.env` y completá `VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY` con los datos de tu proyecto Supabase (Settings → API).
2. `npm install`
3. Corré la migración inicial (`supabase/migrations/`) en el SQL Editor de tu proyecto Supabase, en orden.
4. `npm run dev`

## Importación inicial desde Excel

`node scripts/importar-excel.mjs` corre en modo dry-run (no escribe nada). Para importar de verdad:

1. Agregá `IMPORT_EMAIL` e `IMPORT_PASSWORD` a tu `.env` (la cuenta con la que vas a usar la app).
2. `node scripts/importar-excel.mjs --commit`

## Stack

React 19, Vite, React Router, Supabase (Postgres + Auth + RLS), PWA (`vite-plugin-pwa`). Cotizaciones desde [data912.com](https://data912.com), tipo de cambio desde [dolarapi.com](https://dolarapi.com) y [argentinadatos.com](https://argentinadatos.com) (histórico).
