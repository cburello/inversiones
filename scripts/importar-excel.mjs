// Importa el Excel de tenencias a Supabase. Por defecto corre en modo dry-run
// (solo imprime lo que haria); pasar --commit para escribir de verdad.
import 'dotenv/config'
import ExcelJS from 'exceljs'
import { createClient } from '@supabase/supabase-js'

const ARCHIVO = process.argv.find((a) => a.endsWith('.xlsx')) ??
  'Tenencias-208077_Burello_Claudio Ricardo-2026-01-09.xlsx'
const COMMIT = process.argv.includes('--commit')
const FORZAR = process.argv.includes('--force')

const TICKERS_RENOMBRADOS = { PNZCO: 'PNDCO' }

function limpiarTexto(valor) {
  if (valor && typeof valor === 'object' && 'result' in valor) return valor.result
  if (valor && typeof valor === 'object' && valor.richText) {
    return valor.richText.map((t) => t.text).join('')
  }
  return valor
}

function filaComoArray(row) {
  return row.values.slice(1).map(limpiarTexto)
}

function esFecha(valor) {
  return valor instanceof Date
}

function aFechaISO(valor) {
  if (!esFecha(valor)) return null
  return valor.toISOString().slice(0, 10)
}

// Convierte "804.584,00" (formato es-AR) a 804584.00
function parsearMontoArs(texto) {
  return Number(texto.replace(/\./g, '').replace(',', '.'))
}

function parsearNotaPesos(nota) {
  if (!nota) return null
  const match = /Pesos\s*\(\$?\s*([\d.,]+)\)/i.exec(nota)
  if (!match) return null
  return parsearMontoArs(match[1])
}

// --- Parsers por hoja -----------------------------------------------------

function parseOnBonos(sheet) {
  const especies = new Map()
  const operaciones = []
  const avisos = []
  let sumaInvertido = 0
  let fechaValuacion = null

  sheet.eachRow((row, n) => {
    const r = filaComoArray(row)
    if (n === 3 && typeof r[2] === 'string') {
      const m = /(\d{2})\/(\d{2})\/(\d{4})/.exec(r[2])
      if (m) fechaValuacion = `${m[3]}-${m[2]}-${m[1]}`
    }

    const broker = r[1]
    const cantidad = r[5]
    if (typeof broker !== 'string' || typeof cantidad !== 'number') return

    let ticker = String(r[0]).trim().replace(/\s*\(.*\)\s*$/, '')
    if (TICKERS_RENOMBRADOS[ticker]) {
      avisos.push(`ON-BONOS: ticker ${ticker} renombrado a ${TICKERS_RENOMBRADOS[ticker]}`)
      ticker = TICKERS_RENOMBRADOS[ticker]
    }

    const nombre = typeof r[2] === 'string' ? r[2] : null
    const tipo = nombre && /bono/i.test(nombre) ? 'bono' : 'on'
    const invertidoUsd = r[8]

    especies.set(`${ticker}|${tipo}`, {
      ticker,
      nombre,
      tipo,
      moneda_cotizacion: 'ARS',
      factor_cotizacion: 100,
      vencimiento: aFechaISO(r[3]),
      tasa: typeof r[4] === 'number' ? r[4] : null,
      ley: r[6] === 'AR' || r[6] === 'NY' ? r[6] : null,
      meses_pago: typeof r[9] === 'string' ? r[9] : null,
    })

    sumaInvertido += invertidoUsd
    operaciones.push({
      ticker,
      tipo,
      tipo_operacion: 'compra',
      fecha: fechaValuacion,
      cantidad,
      monto: invertidoUsd,
      moneda: 'USD',
      broker: 'INVIU',
      notas: 'Fecha de compra no registrada en la planilla original; se usó la fecha de la planilla como referencia.',
    })
  })

  return { especies: [...especies.values()], operaciones, avisos, sumaInvertido }
}

function parseCedear(sheet) {
  const especies = new Map()
  const operaciones = []
  const avisos = []
  let sumaVigente = 0
  let vigente = true

  sheet.eachRow((row) => {
    const r = filaComoArray(row)
    const ticker = r[0]
    const cantidad = r[3]
    if (typeof ticker !== 'string' || typeof cantidad !== 'number') {
      // Fila de subtotal (ticker vacío con invertido numérico): marca el fin
      // de las posiciones vigentes; lo que sigue son posiciones ya cerradas.
      if (typeof r[4] === 'number') vigente = false
      return
    }

    const invertido = r[4]
    const fecha = r[5]
    const nota = typeof r[6] === 'string' ? r[6] : null
    const tipoOperacion = invertido < 0 ? 'venta' : 'compra'

    let moneda = 'USD'
    let monto = Math.abs(invertido)

    const montoPesos = parsearNotaPesos(nota)
    if (montoPesos != null) {
      moneda = 'ARS'
      monto = montoPesos
    } else if (nota && /en pesos/i.test(nota)) {
      avisos.push(
        `CEDEAR: ${ticker} (${aFechaISO(fecha)}) marcado "${nota}" en la planilla pero sin monto en pesos individual; se importó en USD (${monto}). Revisar manualmente.`
      )
    }

    especies.set(`${ticker}|cedear`, {
      ticker,
      nombre: typeof r[1] === 'string' ? r[1] : null,
      tipo: 'cedear',
      moneda_cotizacion: 'ARS',
      factor_cotizacion: 1,
      vencimiento: null,
      tasa: null,
      ley: null,
      meses_pago: null,
    })

    if (vigente && tipoOperacion === 'compra') sumaVigente += invertido

    operaciones.push({
      ticker,
      tipo: 'cedear',
      tipo_operacion: tipoOperacion,
      fecha: aFechaISO(fecha),
      cantidad,
      monto,
      moneda,
      broker: typeof r[2] === 'string' ? r[2] : 'INVIU',
      notas: nota,
    })
  })

  return { especies: [...especies.values()], operaciones, avisos, sumaVigente }
}

function parseFci(sheet) {
  const especies = new Map()
  const operaciones = []
  let seccionActual = null

  sheet.eachRow((row) => {
    const r = filaComoArray(row)
    if (typeof r[0] === 'string') {
      seccionActual = r[0].replace(/^FCI\s*-\s*/i, '').trim()
      return
    }
    if (!esFecha(r[0]) || typeof r[1] !== 'number' || !seccionActual) return

    especies.set(seccionActual, {
      ticker: seccionActual,
      nombre: seccionActual,
      tipo: 'fci',
      moneda_cotizacion: 'USD',
      factor_cotizacion: 1,
      vencimiento: null,
      tasa: null,
      ley: null,
      meses_pago: null,
    })

    operaciones.push({
      ticker: seccionActual,
      tipo: 'fci',
      tipo_operacion: r[1] > 0 ? 'compra' : 'venta',
      fecha: aFechaISO(r[0]),
      cantidad: Math.abs(r[1]),
      monto: Math.abs(r[1]),
      moneda: 'USD',
      broker: 'GALICIA',
      notas: [typeof r[3] === 'string' ? r[3] : null, 'Cuotaparte asumida = 1 USD para la importación inicial.']
        .filter(Boolean)
        .join(' | '),
    })
  })

  return { especies: [...especies.values()], operaciones }
}

function parseMovimientos(sheet) {
  const movimientos = []

  sheet.eachRow((row) => {
    const r = filaComoArray(row)
    if (!esFecha(r[0]) || typeof r[1] !== 'string') return

    const tipo = /extrac/i.test(r[1]) ? 'extraccion' : 'deposito'
    const montoArs = r[2]
    const montoUsd = r[3]

    if (typeof montoArs === 'number') {
      movimientos.push({ tipo, fecha: aFechaISO(r[0]), monto: montoArs, moneda: 'ARS', broker: 'INVIU', notas: r[4] ?? null })
    }
    if (typeof montoUsd === 'number') {
      movimientos.push({ tipo, fecha: aFechaISO(r[0]), monto: montoUsd, moneda: 'USD', broker: 'INVIU', notas: r[4] ?? null })
    }
  })

  return movimientos
}

// --- Main ------------------------------------------------------------------

async function main() {
  const workbook = new ExcelJS.Workbook()
  await workbook.xlsx.readFile(ARCHIVO)

  const onBonos = parseOnBonos(workbook.getWorksheet('ON-BONOS'))
  const cedear = parseCedear(workbook.getWorksheet('CEDEAR'))
  const fci = parseFci(workbook.getWorksheet('FCI - GALICIA'))
  const movimientos = parseMovimientos(workbook.getWorksheet('MOVIMIENTOS'))

  const todasLasEspecies = [...onBonos.especies, ...cedear.especies, ...fci.especies]
  const todasLasOperaciones = [...onBonos.operaciones, ...cedear.operaciones, ...fci.operaciones]

  console.log('=== Resumen de la importación ===')
  console.log(`Especies detectadas: ${todasLasEspecies.length}`)
  console.log(`Operaciones detectadas: ${todasLasOperaciones.length}`)
  console.log(`Movimientos de caja detectados: ${movimientos.length}`)
  console.log()
  console.log('=== Validación de totales ===')
  console.log(`ON-BONOS: suma invertido USD = ${onBonos.sumaInvertido.toFixed(2)} (planilla: 30.382,35)`)
  console.log(`CEDEAR (posiciones vigentes): suma invertido USD = ${cedear.sumaVigente.toFixed(2)} (planilla: 14.109,09)`)

  if (onBonos.avisos.length || cedear.avisos.length) {
    console.log()
    console.log('=== Avisos para revisar manualmente ===')
    for (const aviso of [...onBonos.avisos, ...cedear.avisos]) console.log(`- ${aviso}`)
  }

  if (!COMMIT) {
    console.log()
    console.log('Dry-run: no se escribió nada. Corré con --commit para importar de verdad.')
    return
  }

  const email = process.env.IMPORT_EMAIL
  const password = process.env.IMPORT_PASSWORD
  if (!email || !password) {
    throw new Error('Faltan IMPORT_EMAIL / IMPORT_PASSWORD en .env para poder loguearse antes de importar.')
  }

  const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY)
  const { error: loginError } = await supabase.auth.signInWithPassword({ email, password })
  if (loginError) {
    console.log('No se pudo loguear, se intenta crear la cuenta...')
    const { error: signUpError } = await supabase.auth.signUp({ email, password })
    if (signUpError) throw signUpError
    console.log(`Cuenta creada para ${email}.`)
  }

  const { count, error: countError } = await supabase
    .from('operaciones')
    .select('id', { count: 'exact', head: true })
  if (countError) throw countError

  if (count > 0 && !FORZAR) {
    throw new Error(
      `Ya hay ${count} operaciones cargadas para este usuario. Corré con --force si igual querés reimportar (puede duplicar datos).`
    )
  }

  console.log('\n=== Importando ===')

  const especieIdPorClave = new Map()
  for (const especie of todasLasEspecies) {
    const { data: existente } = await supabase
      .from('especies')
      .select('id')
      .eq('ticker', especie.ticker)
      .eq('tipo', especie.tipo)
      .maybeSingle()

    let id = existente?.id
    if (!id) {
      const { data: creada, error } = await supabase.from('especies').insert(especie).select('id').single()
      if (error) throw error
      id = creada.id
    }
    especieIdPorClave.set(`${especie.ticker}|${especie.tipo}`, id)
  }
  console.log(`Especies listas: ${especieIdPorClave.size}`)

  const operacionesAInsertar = todasLasOperaciones.map(({ ticker, tipo, ...resto }) => ({
    ...resto,
    especie_id: especieIdPorClave.get(`${ticker}|${tipo}`),
  }))

  const { error: opError } = await supabase.from('operaciones').insert(operacionesAInsertar)
  if (opError) throw opError
  console.log(`Operaciones insertadas: ${operacionesAInsertar.length}`)

  if (movimientos.length) {
    const { error: movError } = await supabase.from('movimientos_caja').insert(movimientos)
    if (movError) throw movError
    console.log(`Movimientos de caja insertados: ${movimientos.length}`)
  }

  const especiesFci = fci.especies
  if (especiesFci.length) {
    const cotizacionesFci = especiesFci.map((especie) => ({
      especie_id: especieIdPorClave.get(`${especie.ticker}|fci`),
      fecha: new Date().toISOString().slice(0, 10),
      precio: 1,
      moneda: 'USD',
      fuente: 'manual',
    }))
    const { error: cotError } = await supabase.from('cotizaciones').insert(cotizacionesFci)
    if (cotError) throw cotError
    console.log(`Cotizaciones iniciales de FCI insertadas: ${cotizacionesFci.length}`)
  }

  console.log('\nImportación completa.')
}

main().catch((err) => {
  console.error('\nError:', err.message ?? err)
  process.exit(1)
})
