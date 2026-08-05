import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { SelectorEspecie } from './SelectorEspecie'
import { formatearCantidad, formatearArs, formatearUsd } from '../lib/formato'
import { calcularLiquidez } from '../lib/liquidez'
import './OperacionForm.css'

function hoyISO() {
  return new Date().toISOString().slice(0, 10)
}

export function OperacionForm({ especies, operacionInicial, especiePreseleccionada, onGuardar, onCancelar }) {
  const esEdicion = operacionInicial != null
  const especieFija = operacionInicial?.especies ?? especiePreseleccionada ?? null

  const [paso, setPaso] = useState(1)
  const [seleccionEspecie, setSeleccionEspecie] = useState(
    especiePreseleccionada ? { especieId: especiePreseleccionada.id, especieNueva: null } : { especieId: null, especieNueva: null }
  )
  const [tipoOperacion, setTipoOperacion] = useState(operacionInicial?.tipo_operacion ?? 'compra')
  const [fecha, setFecha] = useState(operacionInicial?.fecha ?? hoyISO())
  const [cantidad, setCantidad] = useState(operacionInicial?.cantidad ?? '')
  const [monto, setMonto] = useState(operacionInicial?.monto ?? '')
  const [moneda, setMoneda] = useState(operacionInicial?.moneda ?? 'USD')
  const [broker, setBroker] = useState(operacionInicial?.broker ?? '')
  const [notas, setNotas] = useState(operacionInicial?.notas ?? '')
  const [cargaHistorica, setCargaHistorica] = useState(operacionInicial?.carga_historica ?? false)
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState('')

  // Operaciones (todas, de cualquier especie), movimientos de caja y cobros:
  // se traen acá porque son necesarios para el saldo líquido disponible y la
  // tenencia, y este formulario se abre tanto desde Operaciones (que ya tiene
  // sus propias operaciones cargadas, pero no caja ni cobros) como desde la
  // ficha de una especie (que solo tiene las operaciones de esa especie). Se
  // resuelve una sola vez acá para que ambos casos queden bien.
  const [operaciones, setOperaciones] = useState([])
  const [movimientosCaja, setMovimientosCaja] = useState([])
  const [cobros, setCobros] = useState([])

  useEffect(() => {
    supabase
      .from('operaciones')
      .select('id, especie_id, tipo_operacion, cantidad, monto, moneda, carga_historica')
      .then(({ data }) => setOperaciones(data ?? []))
    supabase
      .from('movimientos_caja')
      .select('tipo, monto, moneda')
      .then(({ data }) => setMovimientosCaja(data ?? []))
    supabase
      .from('cobros')
      .select('monto, moneda')
      .then(({ data }) => setCobros(data ?? []))
  }, [])

  const especieIdActual = operacionInicial?.especie_id ?? seleccionEspecie.especieId

  // Líquido disponible por moneda, sin contar la propia operación que se está
  // editando (si no, comprar/vender editando se compararía contra sí misma).
  const liquidezDisponible = useMemo(() => {
    const operacionesSinEsta = esEdicion ? (operaciones ?? []).filter((op) => op.id !== operacionInicial.id) : operaciones ?? []
    return calcularLiquidez({ movimientosCaja, operaciones: operacionesSinEsta, cobros })
  }, [movimientosCaja, operaciones, cobros, esEdicion, operacionInicial])

  // Tenencia disponible de la especie elegida, sin contar la propia operación
  // que se está editando (si no, una venta editada se compararía contra sí misma).
  const tenenciaDisponible = useMemo(() => {
    let compras = 0
    let ventas = 0
    for (const op of operaciones ?? []) {
      if (op.especie_id !== especieIdActual) continue
      if (esEdicion && op.id === operacionInicial.id) continue
      if (op.tipo_operacion === 'compra') compras += Number(op.cantidad)
      else ventas += Number(op.cantidad)
    }
    return compras - ventas
  }, [operaciones, especieIdActual, esEdicion, operacionInicial])

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')

    if (!esEdicion && !seleccionEspecie.especieId && !seleccionEspecie.especieNueva) {
      setError('Ingresá un ticker.')
      setPaso(1)
      return
    }
    if (!fecha || cantidad === '' || monto === '') {
      setError('Completá fecha, cantidad y monto.')
      return
    }
    if (tipoOperacion === 'venta' && Number(cantidad) > tenenciaDisponible) {
      setError(`No podés vender ${formatearCantidad(Number(cantidad))} unidades: la tenencia disponible es ${formatearCantidad(tenenciaDisponible)}.`)
      setPaso(3)
      return
    }
    if (tipoOperacion === 'compra' && !cargaHistorica && Number(monto) > liquidezDisponible[moneda]) {
      const formatear = moneda === 'ARS' ? formatearArs : formatearUsd
      setError(`No tenés líquido suficiente en ${moneda}: disponible ${formatear(liquidezDisponible[moneda])}.`)
      setPaso(3)
      return
    }

    setGuardando(true)
    try {
      let especieId = operacionInicial?.especie_id ?? seleccionEspecie.especieId

      if (!especieId) {
        const { data: especieCreada, error: especieError } = await supabase
          .from('especies')
          .insert(seleccionEspecie.especieNueva)
          .select()
          .single()
        if (especieError) throw especieError
        especieId = especieCreada.id
      }

      const datosOperacion = {
        especie_id: especieId,
        tipo_operacion: tipoOperacion,
        fecha,
        cantidad: Number(cantidad),
        monto: Number(monto),
        moneda,
        broker: broker.trim() || null,
        notas: notas.trim() || null,
        carga_historica: cargaHistorica,
      }

      if (esEdicion) {
        const { error: updError } = await supabase.from('operaciones').update(datosOperacion).eq('id', operacionInicial.id)
        if (updError) throw updError
      } else {
        const { error: insError } = await supabase.from('operaciones').insert(datosOperacion)
        if (insError) throw insError
      }

      onGuardar()
    } catch (err) {
      setError(err.message)
    } finally {
      setGuardando(false)
    }
  }

  return (
    <div className="modal-fondo" onClick={onCancelar}>
      <form className="modal-caja" onClick={(e) => e.stopPropagation()} onSubmit={handleSubmit}>
        <div className="modal-titulo">
          <h2>{esEdicion ? 'Editar operación' : 'Nueva operación'}</h2>
          <button type="button" className="modal-cerrar" onClick={onCancelar} aria-label="Cerrar">
            ×
          </button>
        </div>

        <div className={`paso-seccion ${paso === 1 ? 'activo' : ''}`}>
          <p className="paso-titulo">1. Especie</p>

          <SelectorEspecie especies={especies} esEdicion={esEdicion} especieFija={especieFija} onCambio={setSeleccionEspecie} />

          <div className="paso-nav">
            <button type="button" onClick={() => setPaso(2)}>
              Siguiente
            </button>
          </div>
        </div>

        <div className={`paso-seccion ${paso === 2 ? 'activo' : ''}`}>
          <p className="paso-titulo">2. Tipo y fecha</p>

          <div className="tipo-toggle">
            <button
              type="button"
              className={tipoOperacion === 'compra' ? 'activo-compra' : ''}
              onClick={() => setTipoOperacion('compra')}
            >
              Compra
            </button>
            <button
              type="button"
              className={tipoOperacion === 'venta' ? 'activo-venta' : ''}
              onClick={() => setTipoOperacion('venta')}
            >
              Venta
            </button>
          </div>

          <label>Fecha</label>
          <input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} />

          <div className="paso-nav">
            <button type="button" onClick={() => setPaso(1)}>
              Atrás
            </button>
            <button type="button" onClick={() => setPaso(3)}>
              Siguiente
            </button>
          </div>
        </div>

        <div className={`paso-seccion ${paso === 3 ? 'activo' : ''}`}>
          <p className="paso-titulo">3. Cantidad y monto</p>

          <div className="fila-2">
            <div>
              <label>Cantidad</label>
              <input type="number" step="any" value={cantidad} onChange={(e) => setCantidad(e.target.value)} />
              {tipoOperacion === 'venta' && (
                <p className="ayuda-campo">Disponible: {formatearCantidad(tenenciaDisponible)}</p>
              )}
            </div>
            <div>
              <label>Monto</label>
              <input type="number" step="any" value={monto} onChange={(e) => setMonto(e.target.value)} />
            </div>
          </div>

          <label>Moneda</label>
          <select value={moneda} onChange={(e) => setMoneda(e.target.value)}>
            <option value="ARS">ARS</option>
            <option value="USD">USD</option>
          </select>
          {tipoOperacion === 'compra' && !cargaHistorica && (
            <p className="ayuda-campo">
              Líquido disponible en {moneda}: {moneda === 'ARS' ? formatearArs(liquidezDisponible.ARS) : formatearUsd(liquidezDisponible.USD)}
            </p>
          )}

          <label>Broker (opcional)</label>
          <input value={broker} onChange={(e) => setBroker(e.target.value)} />

          <label>Notas (opcional)</label>
          <textarea value={notas} onChange={(e) => setNotas(e.target.value)} rows={2} />

          <label className="checkbox-linea">
            <input type="checkbox" checked={cargaHistorica} onChange={(e) => setCargaHistorica(e.target.checked)} />
            Carga histórica (no descuenta ni valida contra el líquido)
          </label>

          <div className="paso-nav">
            <button type="button" onClick={() => setPaso(2)}>
              Atrás
            </button>
          </div>
        </div>

        {error && <p className="form-error">{error}</p>}

        <div className="modal-acciones">
          <button type="button" onClick={onCancelar}>
            Cancelar
          </button>
          <button type="submit" className="boton-primario" disabled={guardando}>
            {guardando ? 'Guardando...' : 'Guardar operación'}
          </button>
        </div>
      </form>
    </div>
  )
}
