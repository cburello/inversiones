import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { MovimientoCajaForm } from '../components/MovimientoCajaForm'
import { formatearArs, formatearUsd, formatearFecha } from '../lib/formato'
import './Caja.css'

function formatearMonto(monto, moneda) {
  return moneda === 'ARS' ? formatearArs(monto) : formatearUsd(monto)
}

function calcularSaldos(movimientos) {
  const saldos = { ARS: 0, USD: 0 }
  for (const m of movimientos) {
    const signo = m.tipo === 'deposito' ? 1 : -1
    saldos[m.moneda] += signo * m.monto
  }
  return saldos
}

export function Caja() {
  const [estado, setEstado] = useState({ cargando: true, error: null })
  const [movimientos, setMovimientos] = useState([])
  const [formAbierto, setFormAbierto] = useState(false)
  const [movimientoEditando, setMovimientoEditando] = useState(null)
  const [confirmandoId, setConfirmandoId] = useState(null)

  const [filtroTipo, setFiltroTipo] = useState('todas')
  const [filtroMoneda, setFiltroMoneda] = useState('todas')

  useEffect(() => {
    cargar()
  }, [])

  async function cargar() {
    setEstado({ cargando: true, error: null })
    try {
      const { data, error } = await supabase.from('movimientos_caja').select('*').order('fecha', { ascending: false })
      if (error) throw error
      setMovimientos(data)
      setEstado({ cargando: false, error: null })
    } catch (err) {
      setEstado({ cargando: false, error: err.message })
    }
  }

  const movimientosFiltrados = useMemo(() => {
    return movimientos.filter((m) => {
      if (filtroTipo !== 'todas' && m.tipo !== filtroTipo) return false
      if (filtroMoneda !== 'todas' && m.moneda !== filtroMoneda) return false
      return true
    })
  }, [movimientos, filtroTipo, filtroMoneda])

  const saldos = calcularSaldos(movimientos)

  function abrirAlta() {
    setMovimientoEditando(null)
    setFormAbierto(true)
  }

  function abrirEdicion(m) {
    setMovimientoEditando(m)
    setFormAbierto(true)
  }

  function cerrarForm() {
    setFormAbierto(false)
    setMovimientoEditando(null)
  }

  function alGuardar() {
    cerrarForm()
    cargar()
  }

  async function eliminar(id) {
    const { error } = await supabase.from('movimientos_caja').delete().eq('id', id)
    if (error) {
      setEstado((e) => ({ ...e, error: error.message }))
      return
    }
    setConfirmandoId(null)
    setMovimientos((prev) => prev.filter((m) => m.id !== id))
  }

  if (estado.cargando) {
    return (
      <div className="caja">
        <p>Cargando caja...</p>
      </div>
    )
  }

  return (
    <div className="caja">
      <div className="caja-header">
        <h1>Caja</h1>
        <button className="boton-primario" onClick={abrirAlta}>
          + Nuevo movimiento
        </button>
      </div>

      {estado.error && <p className="negativo">{estado.error}</p>}

      <div className="saldos-grid">
        <div className="saldo-card">
          <p>Saldo ARS</p>
          <p>{formatearArs(saldos.ARS)}</p>
        </div>
        <div className="saldo-card">
          <p>Saldo USD</p>
          <p>{formatearUsd(saldos.USD)}</p>
        </div>
      </div>

      <div className="filtros">
        <select value={filtroTipo} onChange={(e) => setFiltroTipo(e.target.value)}>
          <option value="todas">Todos los tipos</option>
          <option value="deposito">Depósito</option>
          <option value="extraccion">Extracción</option>
        </select>
        <select value={filtroMoneda} onChange={(e) => setFiltroMoneda(e.target.value)}>
          <option value="todas">ARS y USD</option>
          <option value="ARS">ARS</option>
          <option value="USD">USD</option>
        </select>
      </div>

      {movimientosFiltrados.length === 0 && <p>No hay movimientos que coincidan con los filtros.</p>}

      {movimientosFiltrados.length > 0 && (
        <>
          <table className="tabla-movimientos">
            <thead>
              <tr>
                <th>Tipo</th>
                <th>Fecha</th>
                <th>Monto</th>
                <th>Broker</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {movimientosFiltrados.map((m) => (
                <FilaMovimiento
                  key={m.id}
                  m={m}
                  confirmando={confirmandoId === m.id}
                  onEditar={() => abrirEdicion(m)}
                  onPedirEliminar={() => setConfirmandoId(m.id)}
                  onCancelarEliminar={() => setConfirmandoId(null)}
                  onConfirmarEliminar={() => eliminar(m.id)}
                />
              ))}
            </tbody>
          </table>

          <div className="cards-movimientos">
            {movimientosFiltrados.map((m) => (
              <CardMovimiento
                key={m.id}
                m={m}
                confirmando={confirmandoId === m.id}
                onEditar={() => abrirEdicion(m)}
                onPedirEliminar={() => setConfirmandoId(m.id)}
                onCancelarEliminar={() => setConfirmandoId(null)}
                onConfirmarEliminar={() => eliminar(m.id)}
              />
            ))}
          </div>
        </>
      )}

      {formAbierto && (
        <MovimientoCajaForm movimientoInicial={movimientoEditando} onGuardar={alGuardar} onCancelar={cerrarForm} />
      )}
    </div>
  )
}

function AccionesFila({ confirmando, onEditar, onPedirEliminar, onCancelarEliminar, onConfirmarEliminar }) {
  if (confirmando) {
    return (
      <span className="confirmar-eliminar">
        ¿Eliminar? <button onClick={onConfirmarEliminar}>Sí</button>
        <button onClick={onCancelarEliminar}>No</button>
      </span>
    )
  }
  return (
    <span className="acciones-fila">
      <button onClick={onEditar}>Editar</button>
      <button onClick={onPedirEliminar} className="accion-eliminar">
        Eliminar
      </button>
    </span>
  )
}

function FilaMovimiento({ m, confirmando, onEditar, onPedirEliminar, onCancelarEliminar, onConfirmarEliminar }) {
  return (
    <tr>
      <td>
        <span className={`chip-tipo-mov ${m.tipo}`}>{m.tipo === 'deposito' ? 'Depósito' : 'Extracción'}</span>
      </td>
      <td>{formatearFecha(m.fecha)}</td>
      <td>{formatearMonto(m.monto, m.moneda)}</td>
      <td>{m.broker ?? '-'}</td>
      <td>
        <AccionesFila
          confirmando={confirmando}
          onEditar={onEditar}
          onPedirEliminar={onPedirEliminar}
          onCancelarEliminar={onCancelarEliminar}
          onConfirmarEliminar={onConfirmarEliminar}
        />
      </td>
    </tr>
  )
}

function CardMovimiento({ m, confirmando, onEditar, onPedirEliminar, onCancelarEliminar, onConfirmarEliminar }) {
  return (
    <div className="card-movimiento">
      <div className="card-movimiento-top">
        <div>
          <span className={`chip-tipo-mov ${m.tipo}`}>{m.tipo === 'deposito' ? 'Depósito' : 'Extracción'}</span>
          <div className="especie-tipo">
            {formatearFecha(m.fecha)}
            {m.broker ? ` · ${m.broker}` : ''}
          </div>
        </div>
        <div className="especie-nombre">{formatearMonto(m.monto, m.moneda)}</div>
      </div>
      <div className="card-movimiento-acciones">
        <AccionesFila
          confirmando={confirmando}
          onEditar={onEditar}
          onPedirEliminar={onPedirEliminar}
          onCancelarEliminar={onCancelarEliminar}
          onConfirmarEliminar={onConfirmarEliminar}
        />
      </div>
    </div>
  )
}
