import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { OperacionForm } from '../components/OperacionForm'
import { formatearArs, formatearUsd, formatearFecha, formatearCantidad } from '../lib/formato'
import './Operaciones.css'

const ETIQUETA_TIPO = {
  accion: 'Acción',
  cedear: 'Cedear',
  bono: 'Bono',
  on: 'ON',
  fci: 'FCI',
}

function formatearMonto(monto, moneda) {
  return moneda === 'ARS' ? formatearArs(monto) : formatearUsd(monto)
}

export function Operaciones() {
  const [estado, setEstado] = useState({ cargando: true, error: null })
  const [operaciones, setOperaciones] = useState([])
  const [especies, setEspecies] = useState([])
  const [formAbierto, setFormAbierto] = useState(false)
  const [operacionEditando, setOperacionEditando] = useState(null)
  const [confirmandoId, setConfirmandoId] = useState(null)

  const [filtroTipoEspecie, setFiltroTipoEspecie] = useState('todas')
  const [filtroEspecieId, setFiltroEspecieId] = useState('todas')
  const [filtroTipoOperacion, setFiltroTipoOperacion] = useState('todas')
  const [filtroDesde, setFiltroDesde] = useState('')
  const [filtroHasta, setFiltroHasta] = useState('')
  const [orden, setOrden] = useState({ campo: 'fecha', asc: false })

  useEffect(() => {
    cargar()
  }, [])

  async function cargar() {
    setEstado({ cargando: true, error: null })
    try {
      const [{ data: ops, error: opError }, { data: todasEspecies, error: espError }] = await Promise.all([
        supabase.from('operaciones').select('*, especies(id, ticker, tipo, nombre)').order('fecha', { ascending: false }),
        supabase.from('especies').select('*').order('ticker'),
      ])
      if (opError) throw opError
      if (espError) throw espError

      setOperaciones(ops)
      setEspecies(todasEspecies)
      setEstado({ cargando: false, error: null })
    } catch (err) {
      setEstado({ cargando: false, error: err.message })
    }
  }

  const especiesConOperaciones = useMemo(() => {
    const idsUsados = new Set(operaciones.map((o) => o.especie_id))
    return especies.filter((e) => idsUsados.has(e.id) && (filtroTipoEspecie === 'todas' || e.tipo === filtroTipoEspecie))
  }, [operaciones, especies, filtroTipoEspecie])

  function cambiarFiltroTipoEspecie(tipo) {
    setFiltroTipoEspecie(tipo)
    setFiltroEspecieId('todas')
  }

  function cambiarOrden(campo) {
    setOrden((actual) => (actual.campo === campo ? { campo, asc: !actual.asc } : { campo, asc: campo === 'ticker' }))
  }

  const operacionesFiltradas = useMemo(() => {
    return operaciones
      .filter((op) => {
        if (filtroTipoEspecie !== 'todas' && op.especies?.tipo !== filtroTipoEspecie) return false
        if (filtroEspecieId !== 'todas' && op.especie_id !== filtroEspecieId) return false
        if (filtroTipoOperacion !== 'todas' && op.tipo_operacion !== filtroTipoOperacion) return false
        if (filtroDesde && op.fecha < filtroDesde) return false
        if (filtroHasta && op.fecha > filtroHasta) return false
        return true
      })
      .slice()
      .sort((a, b) => {
        const comparacion =
          orden.campo === 'ticker' ? (a.especies?.ticker ?? '').localeCompare(b.especies?.ticker ?? '') : a.fecha.localeCompare(b.fecha)
        return orden.asc ? comparacion : -comparacion
      })
  }, [operaciones, filtroTipoEspecie, filtroEspecieId, filtroTipoOperacion, filtroDesde, filtroHasta, orden])

  function abrirAlta() {
    setOperacionEditando(null)
    setFormAbierto(true)
  }

  function abrirEdicion(op) {
    setOperacionEditando(op)
    setFormAbierto(true)
  }

  function cerrarForm() {
    setFormAbierto(false)
    setOperacionEditando(null)
  }

  function alGuardar() {
    cerrarForm()
    cargar()
  }

  async function eliminar(id) {
    const { error } = await supabase.from('operaciones').delete().eq('id', id)
    if (error) {
      setEstado((e) => ({ ...e, error: error.message }))
      return
    }
    setConfirmandoId(null)
    setOperaciones((prev) => prev.filter((o) => o.id !== id))
  }

  if (estado.cargando) {
    return (
      <div className="operaciones">
        <p>Cargando operaciones...</p>
      </div>
    )
  }

  return (
    <div className="operaciones">
      <div className="operaciones-header">
        <h1>Operaciones</h1>
        <button className="boton-primario" onClick={abrirAlta}>
          + Nueva operación
        </button>
      </div>

      {estado.error && <p className="negativo">{estado.error}</p>}

      <div className="filtros">
        <select value={filtroTipoEspecie} onChange={(e) => cambiarFiltroTipoEspecie(e.target.value)}>
          <option value="todas">Todos los instrumentos</option>
          {Object.entries(ETIQUETA_TIPO).map(([tipo, etiqueta]) => (
            <option key={tipo} value={tipo}>
              {etiqueta}
            </option>
          ))}
        </select>
        <select value={filtroEspecieId} onChange={(e) => setFiltroEspecieId(e.target.value)}>
          <option value="todas">Todas las especies</option>
          {especiesConOperaciones.map((e) => (
            <option key={e.id} value={e.id}>
              {e.ticker} ({ETIQUETA_TIPO[e.tipo] ?? e.tipo})
            </option>
          ))}
        </select>
        <select value={filtroTipoOperacion} onChange={(e) => setFiltroTipoOperacion(e.target.value)}>
          <option value="todas">Todos los tipos</option>
          <option value="compra">Compra</option>
          <option value="venta">Venta</option>
        </select>
        <input type="date" value={filtroDesde} onChange={(e) => setFiltroDesde(e.target.value)} />
        <span className="filtros-separador">a</span>
        <input type="date" value={filtroHasta} onChange={(e) => setFiltroHasta(e.target.value)} />
      </div>

      <div className="orden-controles">
        <span className="orden-etiqueta">Ordenar por:</span>
        <button className={orden.campo === 'fecha' ? 'activo' : ''} onClick={() => cambiarOrden('fecha')}>
          Fecha {orden.campo === 'fecha' && (orden.asc ? '↑' : '↓')}
        </button>
        <button className={orden.campo === 'ticker' ? 'activo' : ''} onClick={() => cambiarOrden('ticker')}>
          Ticker {orden.campo === 'ticker' && (orden.asc ? '↑' : '↓')}
        </button>
      </div>

      {operacionesFiltradas.length === 0 && <p>No hay operaciones que coincidan con los filtros.</p>}

      {operacionesFiltradas.length > 0 && (
        <>
          <table className="tabla-operaciones">
            <thead>
              <tr>
                <th>Especie</th>
                <th>Tipo</th>
                <th>Fecha</th>
                <th>Cantidad</th>
                <th>Monto</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {operacionesFiltradas.map((op) => (
                <FilaOperacion
                  key={op.id}
                  op={op}
                  confirmando={confirmandoId === op.id}
                  onEditar={() => abrirEdicion(op)}
                  onPedirEliminar={() => setConfirmandoId(op.id)}
                  onCancelarEliminar={() => setConfirmandoId(null)}
                  onConfirmarEliminar={() => eliminar(op.id)}
                />
              ))}
            </tbody>
          </table>

          <div className="cards-operaciones">
            {operacionesFiltradas.map((op) => (
              <CardOperacion
                key={op.id}
                op={op}
                confirmando={confirmandoId === op.id}
                onEditar={() => abrirEdicion(op)}
                onPedirEliminar={() => setConfirmandoId(op.id)}
                onCancelarEliminar={() => setConfirmandoId(null)}
                onConfirmarEliminar={() => eliminar(op.id)}
              />
            ))}
          </div>
        </>
      )}

      {formAbierto && (
        <OperacionForm especies={especies} operacionInicial={operacionEditando} onGuardar={alGuardar} onCancelar={cerrarForm} />
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
      <button onClick={onEditar} aria-label="Editar">
        Editar
      </button>
      <button onClick={onPedirEliminar} aria-label="Eliminar" className="accion-eliminar">
        Eliminar
      </button>
    </span>
  )
}

function FilaOperacion({ op, confirmando, onEditar, onPedirEliminar, onCancelarEliminar, onConfirmarEliminar }) {
  return (
    <tr>
      <td>
        <div className="especie-nombre">{op.especies?.ticker}</div>
        <div className="especie-tipo">{ETIQUETA_TIPO[op.especies?.tipo] ?? op.especies?.tipo}</div>
      </td>
      <td>
        <span className={`chip-tipo ${op.tipo_operacion}`}>{op.tipo_operacion === 'compra' ? 'Compra' : 'Venta'}</span>
      </td>
      <td>{formatearFecha(op.fecha)}</td>
      <td>{formatearCantidad(op.cantidad)}</td>
      <td>{formatearMonto(op.monto, op.moneda)}</td>
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

function CardOperacion({ op, confirmando, onEditar, onPedirEliminar, onCancelarEliminar, onConfirmarEliminar }) {
  return (
    <div className="card-operacion">
      <div className="card-operacion-top">
        <div>
          <div className="especie-nombre">{op.especies?.ticker}</div>
          <div className="especie-tipo">
            {ETIQUETA_TIPO[op.especies?.tipo] ?? op.especies?.tipo} · {formatearFecha(op.fecha)}
          </div>
        </div>
        <span className={`chip-tipo ${op.tipo_operacion}`}>{op.tipo_operacion === 'compra' ? 'Compra' : 'Venta'}</span>
      </div>
      <div className="card-operacion-monto">
        {formatearCantidad(op.cantidad)} unidades · {formatearMonto(op.monto, op.moneda)}
      </div>
      <div className="card-operacion-acciones">
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
