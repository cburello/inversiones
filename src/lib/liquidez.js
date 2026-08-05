// Saldo líquido disponible por moneda (ARS/USD): movimientos de caja
// (depósito/extracción) + compras/ventas de operaciones (también mueven el
// líquido) + cobros (acreditan). Las operaciones marcadas "carga_historica"
// no se cuentan: son compras/ventas hechas antes de empezar a llevar este
// registro, sin el líquido correspondiente cargado en el sistema.
export function calcularLiquidez({ movimientosCaja = [], operaciones = [], cobros = [] }) {
  const saldo = { ARS: 0, USD: 0 }

  for (const m of movimientosCaja) {
    saldo[m.moneda] += m.tipo === 'deposito' ? m.monto : -m.monto
  }

  for (const op of operaciones) {
    if (op.carga_historica) continue
    saldo[op.moneda] += op.tipo_operacion === 'compra' ? -op.monto : op.monto
  }

  for (const c of cobros) {
    saldo[c.moneda] += c.monto
  }

  return saldo
}
