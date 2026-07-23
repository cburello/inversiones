// Cliente de cotizaciones: data912 (acciones/cedears/bonos/ONs) y dolarapi (MEP/CCL/oficial).
import { supabase } from './supabaseClient'

const DATA912_BASE = 'https://data912.com/live'
const DOLARAPI_BASE = 'https://dolarapi.com/v1/dolares'
const ARGENTINADATOS_BOLSA = 'https://api.argentinadatos.com/v1/cotizaciones/dolares/bolsa'
const ARGENTINADATOS_FCI = 'https://api.argentinadatos.com/v1/finanzas/fci'

// argentinadatos.com espeja los datos oficiales de CAFCI. Un mismo fondo puede
// estar en cualquiera de estas categorías (ej. los FCI "Mix" suelen aparecer
// en rentaVariable, no en rentaMixta), por eso se buscan todas a la vez.
const CATEGORIAS_FCI = ['rentaFija', 'mercadoDinero', 'rentaVariable', 'rentaMixta', 'retornoTotal', 'otros']

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

// Catálogo completo de FCI (todas las categorías, datos de CAFCI vía
// argentinadatos.com), aplanado en una sola lista para buscar por nombre sin
// que el usuario tenga que saber en qué categoría está su fondo. Se pensó
// para traerse una sola vez y buscar en memoria (son ~2-3 mil fondos).
export async function obtenerCatalogoFci() {
  const listas = await Promise.all(
    CATEGORIAS_FCI.map((categoria) =>
      fetchJson(`${ARGENTINADATOS_FCI}/${categoria}/ultimo`).catch(() => [])
    )
  )
  return CATEGORIAS_FCI.flatMap((categoria, i) =>
    listas[i]
      .filter((f) => f.vcp != null)
      .map((f) => ({ fondo: f.fondo, categoria, vcp: f.vcp, fecha: f.fecha }))
  )
}

// Actualiza cotizaciones de data912 (acciones/cedears/bonos) y de CAFCI (FCI,
// vía argentinadatos.com) para las especies dadas. Las FCI se matchean por su
// nombre oficial exacto (guardado en especies.nombre al crearlas con el
// buscador). Devuelve un reporte con lo actualizado y lo que no tuvo precio
// disponible; una fuente que falla no bloquea a la otra.
export async function actualizarCotizaciones(especies) {
  const actualizadas = []
  const sinPrecio = []
  const errores = []
  const fecha = hoyISO()
  const actualizadoEn = new Date().toISOString()
  const filas = []

  const tiposConApi = especies.filter((e) => e.tipo in ENDPOINT_POR_TIPO)
  const endpointsNecesarios = [...new Set(tiposConApi.flatMap((e) => ENDPOINT_POR_TIPO[e.tipo]))]

  try {
    const mapas = await Promise.all(endpointsNecesarios.map((ep) => mapaDePrecios([ep])))
    const precios = new Map()
    for (const mapa of mapas) for (const [k, v] of mapa) precios.set(k, v)

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
  } catch (err) {
    console.error('No se pudieron obtener precios de data912:', err)
    errores.push(String(err))
    sinPrecio.push(...tiposConApi.map((e) => e.ticker))
  }

  const especiesFci = especies.filter((e) => e.tipo === 'fci')
  if (especiesFci.length) {
    try {
      const catalogo = await obtenerCatalogoFci()
      const porNombre = new Map(catalogo.map((f) => [f.fondo, f]))

      for (const especie of especiesFci) {
        const fondo = porNombre.get(especie.nombre)
        if (!fondo) {
          sinPrecio.push(especie.ticker)
          continue
        }
        filas.push({
          especie_id: especie.id,
          fecha,
          precio: fondo.vcp,
          moneda: especie.moneda_cotizacion,
          fuente: 'cafci',
          actualizado_en: actualizadoEn,
        })
        actualizadas.push(especie.ticker)
      }
    } catch (err) {
      console.error('No se pudieron obtener cuotapartes de CAFCI:', err)
      errores.push(String(err))
      sinPrecio.push(...especiesFci.map((e) => e.ticker))
    }
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
