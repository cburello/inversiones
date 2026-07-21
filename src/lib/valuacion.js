// Cálculo de tenencia, costo promedio y resultado por especie.
// Simplificación v1: el costo se convierte a la otra moneda con el MEP de la
// fecha de la operación si lo tenemos cacheado (tabla tipo_cambio); si no,
// con el MEP actual como aproximación.

function convertirAAmbasMonedas(monto, moneda, mepAUsar) {
  if (moneda === 'ARS') return { ars: monto, usd: monto / mepAUsar }
  return { ars: monto * mepAUsar, usd: monto }
}

function hoyISO() {
  return new Date().toISOString().slice(0, 10)
}

// Las ON se mantienen a vencimiento: no se calcula valuación de mercado ni
// resultado no realizado, solo tenencia, fecha de inversión y costo.
export function calcularPosicion({ especie, operaciones, cotizacion, mep, tipoCambioHistorico }) {
  let cantidadCompras = 0
  let cantidadVentas = 0
  let costoComprasArs = 0
  let costoComprasUsd = 0
  let fechaInversion = null
  let fechaUltimaOperacion = null
  const detalleInvertido = []

  for (const op of operaciones) {
    if (fechaUltimaOperacion == null || op.fecha > fechaUltimaOperacion) fechaUltimaOperacion = op.fecha

    if (op.tipo_operacion !== 'compra') {
      cantidadVentas += op.cantidad
      continue
    }

    const historico = tipoCambioHistorico?.get(op.fecha)
    const mepAUsar = op.tc_mep ?? historico?.mep ?? mep
    const fuenteMep = op.tc_mep != null ? 'cargado en la operación' : historico ? historico.fuente : 'MEP actual (sin histórico disponible)'

    const { ars, usd } = convertirAAmbasMonedas(op.monto, op.moneda, mepAUsar)

    cantidadCompras += op.cantidad
    costoComprasArs += ars
    costoComprasUsd += usd
    if (fechaInversion == null || op.fecha < fechaInversion) fechaInversion = op.fecha

    detalleInvertido.push({ fecha: op.fecha, monto: op.monto, moneda: op.moneda, mep: mepAUsar, fuente: fuenteMep })
  }

  const tenencia = cantidadCompras - cantidadVentas
  const costoUnitarioArs = cantidadCompras > 0 ? costoComprasArs / cantidadCompras : 0
  const costoUnitarioUsd = cantidadCompras > 0 ? costoComprasUsd / cantidadCompras : 0
  const costoArs = tenencia * costoUnitarioArs
  const costoUsd = tenencia * costoUnitarioUsd

  const mantieneAVencimiento = especie.tipo === 'on'

  const tienePrecio = !mantieneAVencimiento && cotizacion != null
  const precio = tienePrecio ? cotizacion.precio : null
  const precioArs = !tienePrecio ? null : especie.moneda_cotizacion === 'ARS' ? precio : precio * mep
  const precioUsd = !tienePrecio ? null : especie.moneda_cotizacion === 'USD' ? precio : precio / mep
  const valuacionNativa = tienePrecio ? (tenencia * precio) / especie.factor_cotizacion : 0

  const valuacionArs = !tienePrecio ? 0 : especie.moneda_cotizacion === 'ARS' ? valuacionNativa : valuacionNativa * mep
  const valuacionUsd = !tienePrecio ? 0 : especie.moneda_cotizacion === 'USD' ? valuacionNativa : valuacionNativa / mep

  const resultadoArs = mantieneAVencimiento ? null : valuacionArs - costoArs
  const resultadoUsd = mantieneAVencimiento ? null : valuacionUsd - costoUsd
  const resultadoPct = mantieneAVencimiento || costoUsd === 0 ? null : (resultadoUsd / Math.abs(costoUsd)) * 100

  return {
    especie,
    tenencia,
    precio,
    precioArs,
    precioUsd,
    monedaCotizacion: especie.moneda_cotizacion,
    tienePrecio,
    mantieneAVencimiento,
    fechaPrecio: cotizacion?.fecha ?? null,
    precioActualizadoEn: cotizacion?.actualizado_en ?? null,
    esStale: tienePrecio && cotizacion.fecha !== hoyISO(),
    costoArs,
    costoUsd,
    fechaInversion,
    fechaUltimaOperacion,
    detalleInvertido,
    valuacionArs,
    valuacionUsd,
    resultadoArs,
    resultadoUsd,
    resultadoPct,
  }
}

// El monto invertido (costo) se suma de TODAS las posiciones, ON incluidas: el
// usuario quiere ver cuánto tiene puesto en cada tipo y en el total general.
// La valuación total también suma las ON, usando su costo como aproximación
// (no se les sigue precio de mercado, así que no hay un valor de hoy real).
// El resultado (ganancia/pérdida), en cambio, solo tiene sentido sobre las
// posiciones que sí se valúan a mercado: ahí las ON quedan afuera.
export function calcularConsolidado(posiciones) {
  const costoTotal = posiciones.reduce(
    (acc, p) => ({ costoArs: acc.costoArs + p.costoArs, costoUsd: acc.costoUsd + p.costoUsd }),
    { costoArs: 0, costoUsd: 0 }
  )

  const valuacionTotal = posiciones.reduce(
    (acc, p) => ({
      valuacionArs: acc.valuacionArs + (p.mantieneAVencimiento ? p.costoArs : p.valuacionArs),
      valuacionUsd: acc.valuacionUsd + (p.mantieneAVencimiento ? p.costoUsd : p.valuacionUsd),
    }),
    { valuacionArs: 0, valuacionUsd: 0 }
  )

  const posicionesConValuacion = posiciones.filter((p) => !p.mantieneAVencimiento)
  const totalesValuados = posicionesConValuacion.reduce(
    (acc, p) => ({
      valuacionArs: acc.valuacionArs + p.valuacionArs,
      valuacionUsd: acc.valuacionUsd + p.valuacionUsd,
      costoArs: acc.costoArs + p.costoArs,
      costoUsd: acc.costoUsd + p.costoUsd,
    }),
    { valuacionArs: 0, valuacionUsd: 0, costoArs: 0, costoUsd: 0 }
  )

  const resultadoArs = totalesValuados.valuacionArs - totalesValuados.costoArs
  const resultadoUsd = totalesValuados.valuacionUsd - totalesValuados.costoUsd
  const resultadoPct = totalesValuados.costoUsd !== 0 ? (resultadoUsd / Math.abs(totalesValuados.costoUsd)) * 100 : null

  return {
    valuacionArs: valuacionTotal.valuacionArs,
    valuacionUsd: valuacionTotal.valuacionUsd,
    costoArs: costoTotal.costoArs,
    costoUsd: costoTotal.costoUsd,
    resultadoArs,
    resultadoUsd,
    resultadoPct,
  }
}
