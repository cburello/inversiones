const formatoEntero = new Intl.NumberFormat('es-AR', { maximumFractionDigits: 0 })
const formatoDecimal = new Intl.NumberFormat('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const formatoCantidad = new Intl.NumberFormat('es-AR', { maximumFractionDigits: 2 })
const formatoPrecioFci = new Intl.NumberFormat('es-AR', { minimumFractionDigits: 6, maximumFractionDigits: 6 })

export function formatearArs(valor) {
  return `$ ${formatoEntero.format(Math.round(valor))}`
}

export function formatearUsd(valor) {
  return `U$S ${formatoDecimal.format(valor)}`
}

// Precio de cuotaparte de FCI: con solo 2 decimales dos fondos distintos
// pueden verse idénticos (ej. 1,54 vs 1,543824), por eso van con 6.
export function formatearArsFci(valor) {
  return `$ ${formatoPrecioFci.format(valor)}`
}

export function formatearUsdFci(valor) {
  return `U$S ${formatoPrecioFci.format(valor)}`
}

// Para tenencia/cantidad: hasta 2 decimales (las cuotapartes de FCI son
// fraccionarias y arrastran ruido de punto flotante si se muestran crudas).
export function formatearCantidad(valor) {
  return formatoCantidad.format(valor)
}

export function formatearPct(valor) {
  if (valor == null) return '-'
  const signo = valor > 0 ? '+' : ''
  return `${signo}${formatoDecimal.format(valor)}%`
}

export function formatearFecha(fechaISO) {
  if (!fechaISO) return '-'
  const [anio, mes, dia] = fechaISO.split('-')
  return `${dia}/${mes}/${anio}`
}

export function formatearFechaHora(fechaISO) {
  const fecha = new Date(fechaISO)
  return `${fecha.toLocaleDateString('es-AR')} ${fecha.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', hour12: false })}hs`
}
