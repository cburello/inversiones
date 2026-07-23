const formatoEntero = new Intl.NumberFormat('es-AR', { maximumFractionDigits: 0 })
const formatoDecimal = new Intl.NumberFormat('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const formatoCantidad = new Intl.NumberFormat('es-AR', { maximumFractionDigits: 2 })

export function formatearArs(valor) {
  return `$ ${formatoEntero.format(Math.round(valor))}`
}

export function formatearUsd(valor) {
  return `U$S ${formatoDecimal.format(valor)}`
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
  return `${fecha.toLocaleDateString('es-AR')} ${fecha.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })}hs`
}
