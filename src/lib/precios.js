// Cliente de cotizaciones: data912 (acciones/cedears/bonos/ONs) y dolarapi (MEP/CCL/oficial).
import { supabase } from './supabaseClient'

const DATA912_BASE = 'https://data912.com/live'
const DOLARAPI_BASE = 'https://dolarapi.com/v1/dolares'
const ARGENTINADATOS_BOLSA = 'https://api.argentinadatos.com/v1/cotizaciones/dolares/bolsa'

// Las ON no se cotizan de forma continua: se mantienen a vencimiento, sin valuación de mercado.
const ENDPOINT_POR_TIPO = {
  accion: ['arg_stocks'],
  cedear: ['arg_cedears'],
  bono: ['arg_bonds', 'arg_notes'],
}

// Para validar contra el mercado al dar de alta un ticker sí se chequean las ON
// (aunque después no se les siga el precio día a día). FCI no tiene API: se
// carga a mano, por eso no aparece acá.
const ENDPOINT_VALIDACION_POR_TIPO = {
  accion: ['arg_stocks'],
  cedear: ['arg_cedears'],
  bono: ['arg_bonds', 'arg_notes'],
  on: ['arg_corp'],
}

async function fetchJson(url) {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`${url} respondió ${res.status}`)
  return res.json()
}

function hoyISO() {
  return new Date().toISOString().slice(0, 10)
}

// Trae MEP/CCL/oficial de dolarapi y los guarda en tipo_cambio para hoy.
// Devuelve null si la API falla (la app debe seguir mostrando el último valor cacheado).
export async function actualizarTipoCambio() {
  try {
    const [bolsa, ccl, oficial] = await Promise.all([
      fetchJson(`${DOLARAPI_BASE}/bolsa`),
      fetchJson(`${DOLARAPI_BASE}/contadoconliqui`),
      fetchJson(`${DOLARAPI_BASE}/oficial`),
    ])

    const fila = {
      fecha: hoyISO(),
      mep: bolsa.venta,
      ccl: ccl.venta,
      oficial: oficial.venta,
      fuente: 'dolarapi',
      actualizado_en: bolsa.fechaActualizacion,
    }

    const { error } = await supabase.from('tipo_cambio').upsert(fila, { onConflict: 'fecha' })
    if (error) throw error

    return fila
  } catch (err) {
    console.error('No se pudo actualizar el tipo de cambio:', err)
    return null
  }
}

// Trae el último tipo_cambio cacheado (hoy si se pudo actualizar, o el más reciente disponible).
export async function obtenerUltimoTipoCambio() {
  const { data, error } = await supabase
    .from('tipo_cambio')
    .select('*')
    .order('fecha', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error) throw error
  return data
}

// Tipo de cambio para un conjunto de fechas puntuales (ej. fechas de operaciones),
// para convertir montos históricos sin usar el MEP del día de hoy. Primero busca
// en nuestro propio cache (tipo_cambio); lo que falte lo completa con la serie
// histórica de argentinadatos.com (dolarapi no tiene históricos) y lo cachea.
// Devuelve un Map<fecha, { mep, fuente }>.
export async function obtenerTipoCambioHistorico(fechas) {
  const fechasUnicas = [...new Set(fechas)]
  if (!fechasUnicas.length) return new Map()

  const { data, error } = await supabase.from('tipo_cambio').select('fecha, mep, fuente').in('fecha', fechasUnicas)
  if (error) throw error

  const mapa = new Map(data.filter((f) => f.mep != null).map((f) => [f.fecha, { mep: f.mep, fuente: f.fuente }]))
  const faltantes = fechasUnicas.filter((f) => !mapa.has(f))
  if (!faltantes.length) return mapa

  try {
    const serieBolsa = await fetchJson(ARGENTINADATOS_BOLSA)
    const mepPorFecha = new Map(serieBolsa.map((f) => [f.fecha, f.venta]))

    const filasNuevas = []
    for (const fecha of faltantes) {
      const mep = mepPorFecha.get(fecha)
      if (mep == null) continue
      mapa.set(fecha, { mep, fuente: 'argentinadatos' })
      filasNuevas.push({ fecha, mep, fuente: 'argentinadatos' })
    }

    if (filasNuevas.length) {
      const { error: upsertError } = await supabase.from('tipo_cambio').upsert(filasNuevas, { onConflict: 'fecha' })
      if (upsertError) console.error('No se pudo cachear el histórico de argentinadatos:', upsertError)
    }
  } catch (err) {
    console.error('No se pudo completar el histórico desde argentinadatos:', err)
  }

  return mapa
}

async function mapaDePrecios(endpoints) {
  const mapa = new Map()
  for (const endpoint of endpoints) {
    const filas = await fetchJson(`${DATA912_BASE}/${endpoint}`)
    for (const fila of filas) {
      if (typeof fila.c === 'number') mapa.set(fila.symbol, fila.c)
    }
  }
  return mapa
}

// Ticker -> precio de mercado (data912) para un tipo de especie, para validar
// que un ticker nuevo realmente exista antes de darlo de alta. FCI no tiene API
// (cuotaparte manual): para ese tipo devuelve un Map vacío, sin pegarle a nada.
export async function obtenerTickersDeMercado(tipo) {
  const endpoints = ENDPOINT_VALIDACION_POR_TIPO[tipo]
  if (!endpoints) return new Map()
  return mapaDePrecios(endpoints)
}

// Igual que obtenerTickersDeMercado, pero para los 4 tipos con API a la vez
// (acción, cedear, bono, ON). Sirve para detectar solo con el ticker en qué
// tipo cotiza, sin que el usuario tenga que elegirlo primero.
export async function obtenerTodoElMercado() {
  const tipos = Object.keys(ENDPOINT_VALIDACION_POR_TIPO)
  const mapas = await Promise.all(tipos.map((tipo) => obtenerTickersDeMercado(tipo)))
  return Object.fromEntries(tipos.map((tipo, i) => [tipo, mapas[i]]))
}

// Actualiza cotizaciones de data912 para las especies dadas (acciones/cedears/bonos/ONs).
// Los FCI se cargan a mano y no pasan por acá. Devuelve un reporte con lo actualizado
// y lo que no tuvo precio disponible; no lanza si data912 falla (usa el cache existente).
export async function actualizarCotizaciones(especies) {
  const actualizadas = []
  const sinPrecio = []
  const errores = []

  const tiposConApi = especies.filter((e) => e.tipo in ENDPOINT_POR_TIPO)
  const endpointsNecesarios = [...new Set(tiposConApi.flatMap((e) => ENDPOINT_POR_TIPO[e.tipo]))]

  let precios
  try {
    const mapas = await Promise.all(endpointsNecesarios.map((ep) => mapaDePrecios([ep])))
    precios = new Map()
    for (const mapa of mapas) for (const [k, v] of mapa) precios.set(k, v)
  } catch (err) {
    console.error('No se pudieron obtener precios de data912:', err)
    return { actualizadas, sinPrecio: tiposConApi.map((e) => e.ticker), errores: [String(err)] }
  }

  const fecha = hoyISO()
  const actualizadoEn = new Date().toISOString()
  const filas = []
  for (const especie of tiposConApi) {
    const precio = precios.get(especie.ticker)
    if (precio == null) {
      sinPrecio.push(especie.ticker)
      continue
    }
    filas.push({
      especie_id: especie.id,
      fecha,
      precio,
      moneda: especie.moneda_cotizacion,
      fuente: 'data912',
      actualizado_en: actualizadoEn,
    })
    actualizadas.push(especie.ticker)
  }

  if (filas.length) {
    const { error } = await supabase.from('cotizaciones').upsert(filas, { onConflict: 'especie_id,fecha,fuente' })
    if (error) errores.push(error.message)
  }

  return { actualizadas, sinPrecio, errores }
}

// Última cotización cacheada por especie (la más reciente, sea de hoy o de un día anterior).
export async function obtenerUltimasCotizaciones(especieIds) {
  if (!especieIds.length) return new Map()

  const { data, error } = await supabase
    .from('cotizaciones')
    .select('especie_id, fecha, precio, moneda, fuente, actualizado_en')
    .in('especie_id', especieIds)
    .order('fecha', { ascending: false })

  if (error) throw error

  const ultimaPorEspecie = new Map()
  for (const fila of data) {
    if (!ultimaPorEspecie.has(fila.especie_id)) ultimaPorEspecie.set(fila.especie_id, fila)
  }
  return ultimaPorEspecie
}
