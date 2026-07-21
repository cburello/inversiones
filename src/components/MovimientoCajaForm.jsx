import { useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import './OperacionForm.css'

function hoyISO() {
  return new Date().toISOString().slice(0, 10)
}

export function MovimientoCajaForm({ movimientoInicial, onGuardar, onCancelar }) {
  const esEdicion = movimientoInicial != null

  const [tipo, setTipo] = useState(movimientoInicial?.tipo ?? 'deposito')
  const [fecha, setFecha] = useState(movimientoInicial?.fecha ?? hoyISO())
  const [monto, setMonto] = useState(movimientoInicial?.monto ?? '')
  const [moneda, setMoneda] = useState(movimientoInicial?.moneda ?? 'ARS')
  const [broker, setBroker] = useState(movimientoInicial?.broker ?? '')
  const [notas, setNotas] = useState(movimientoInicial?.notas ?? '')
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')

    if (!fecha || monto === '') {
      setError('Completá fecha y monto.')
      return
    }

    setGuardando(true)
    try {
      const datos = {
        tipo,
        fecha,
        monto: Number(monto),
        moneda,
        broker: broker.trim() || null,
        notas: notas.trim() || null,
      }

      if (esEdicion) {
        const { error: updError } = await supabase.from('movimientos_caja').update(datos).eq('id', movimientoInicial.id)
        if (updError) throw updError
      } else {
        const { error: insError } = await supabase.from('movimientos_caja').insert(datos)
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
          <h2>{esEdicion ? 'Editar movimiento' : 'Nuevo movimiento'}</h2>
          <button type="button" className="modal-cerrar" onClick={onCancelar} aria-label="Cerrar">
            ×
          </button>
        </div>

        <div className="tipo-toggle">
          <button type="button" className={tipo === 'deposito' ? 'activo-compra' : ''} onClick={() => setTipo('deposito')}>
            Depósito
          </button>
          <button
            type="button"
            className={tipo === 'extraccion' ? 'activo-venta' : ''}
            onClick={() => setTipo('extraccion')}
          >
            Extracción
          </button>
        </div>

        <label>Fecha</label>
        <input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} />

        <label>Monto</label>
        <input type="number" step="any" value={monto} onChange={(e) => setMonto(e.target.value)} />

        <label>Moneda</label>
        <select value={moneda} onChange={(e) => setMoneda(e.target.value)}>
          <option value="ARS">ARS</option>
          <option value="USD">USD</option>
        </select>

        <label>Broker (opcional)</label>
        <input value={broker} onChange={(e) => setBroker(e.target.value)} placeholder="ej. INVIU, GALICIA" />

        <label>Notas (opcional)</label>
        <textarea value={notas} onChange={(e) => setNotas(e.target.value)} rows={2} />

        {error && <p className="form-error">{error}</p>}

        <div className="modal-acciones">
          <button type="button" onClick={onCancelar}>
            Cancelar
          </button>
          <button type="submit" className="boton-primario" disabled={guardando}>
            {guardando ? 'Guardando...' : 'Guardar movimiento'}
          </button>
        </div>
      </form>
    </div>
  )
}
