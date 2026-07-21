import { useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { SelectorEspecie } from './SelectorEspecie'
import './OperacionForm.css'

const TIPOS_COBRO = [
  { value: 'renta', label: 'Renta' },
  { value: 'amortizacion', label: 'Amortización' },
  { value: 'dividendo', label: 'Dividendo' },
]

function hoyISO() {
  return new Date().toISOString().slice(0, 10)
}

export function CobroForm({ especies, cobroInicial, onGuardar, onCancelar }) {
  const esEdicion = cobroInicial != null
  const especieFija = cobroInicial?.especies ?? null

  const [seleccionEspecie, setSeleccionEspecie] = useState({ especieId: null, especieNueva: null })
  const [tipo, setTipo] = useState(cobroInicial?.tipo ?? 'renta')
  const [fecha, setFecha] = useState(cobroInicial?.fecha ?? hoyISO())
  const [monto, setMonto] = useState(cobroInicial?.monto ?? '')
  const [moneda, setMoneda] = useState(cobroInicial?.moneda ?? 'USD')
  const [notas, setNotas] = useState(cobroInicial?.notas ?? '')
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')

    if (!esEdicion && !seleccionEspecie.especieId && !seleccionEspecie.especieNueva) {
      setError('Ingresá un ticker.')
      return
    }
    if (!fecha || monto === '') {
      setError('Completá fecha y monto.')
      return
    }

    setGuardando(true)
    try {
      let especieId = cobroInicial?.especie_id ?? seleccionEspecie.especieId

      if (!especieId) {
        const { data: especieCreada, error: especieError } = await supabase
          .from('especies')
          .insert(seleccionEspecie.especieNueva)
          .select()
          .single()
        if (especieError) throw especieError
        especieId = especieCreada.id
      }

      const datosCobro = {
        especie_id: especieId,
        tipo,
        fecha,
        monto: Number(monto),
        moneda,
        notas: notas.trim() || null,
      }

      if (esEdicion) {
        const { error: updError } = await supabase.from('cobros').update(datosCobro).eq('id', cobroInicial.id)
        if (updError) throw updError
      } else {
        const { error: insError } = await supabase.from('cobros').insert(datosCobro)
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
          <h2>{esEdicion ? 'Editar cobro' : 'Nuevo cobro'}</h2>
          <button type="button" className="modal-cerrar" onClick={onCancelar} aria-label="Cerrar">
            ×
          </button>
        </div>

        <SelectorEspecie especies={especies} esEdicion={esEdicion} especieFija={especieFija} onCambio={setSeleccionEspecie} />

        <label>Tipo</label>
        <select value={tipo} onChange={(e) => setTipo(e.target.value)}>
          {TIPOS_COBRO.map((t) => (
            <option key={t.value} value={t.value}>
              {t.label}
            </option>
          ))}
        </select>

        {tipo === 'amortizacion' && (
          <div className="validacion-sin-verificar">
            Una amortización reduce el capital, pero no ajusta la cantidad de nominales en tu tenencia. Si querés
            reflejarla, cargá también una venta en Operaciones.
          </div>
        )}

        <label>Fecha</label>
        <input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} />

        <label>Monto</label>
        <input type="number" step="any" value={monto} onChange={(e) => setMonto(e.target.value)} />

        <label>Moneda</label>
        <select value={moneda} onChange={(e) => setMoneda(e.target.value)}>
          <option value="ARS">ARS</option>
          <option value="USD">USD</option>
        </select>

        <label>Notas (opcional)</label>
        <textarea value={notas} onChange={(e) => setNotas(e.target.value)} rows={2} />

        {error && <p className="form-error">{error}</p>}

        <div className="modal-acciones">
          <button type="button" onClick={onCancelar}>
            Cancelar
          </button>
          <button type="submit" className="boton-primario" disabled={guardando}>
            {guardando ? 'Guardando...' : 'Guardar cobro'}
          </button>
        </div>
      </form>
    </div>
  )
}
