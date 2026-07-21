import { useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { SelectorEspecie } from './SelectorEspecie'
import './OperacionForm.css'

function hoyISO() {
  return new Date().toISOString().slice(0, 10)
}

export function OperacionForm({ especies, operacionInicial, onGuardar, onCancelar }) {
  const esEdicion = operacionInicial != null
  const especieFija = operacionInicial?.especies ?? null

  const [paso, setPaso] = useState(1)
  const [seleccionEspecie, setSeleccionEspecie] = useState({ especieId: null, especieNueva: null })
  const [tipoOperacion, setTipoOperacion] = useState(operacionInicial?.tipo_operacion ?? 'compra')
  const [fecha, setFecha] = useState(operacionInicial?.fecha ?? hoyISO())
  const [cantidad, setCantidad] = useState(operacionInicial?.cantidad ?? '')
  const [monto, setMonto] = useState(operacionInicial?.monto ?? '')
  const [moneda, setMoneda] = useState(operacionInicial?.moneda ?? 'USD')
  const [broker, setBroker] = useState(operacionInicial?.broker ?? '')
  const [notas, setNotas] = useState(operacionInicial?.notas ?? '')
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState('')

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

          <label>Broker (opcional)</label>
          <input value={broker} onChange={(e) => setBroker(e.target.value)} />

          <label>Notas (opcional)</label>
          <textarea value={notas} onChange={(e) => setNotas(e.target.value)} rows={2} />

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
