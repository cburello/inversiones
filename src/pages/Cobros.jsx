import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { CobroForm } from '../components/CobroForm'
import { formatearArs, formatearUsd, formatearFecha } from '../lib/formato'
import './Cobros.css'

const ETIQUETA_TIPO_ESPECIE = {
  accion: 'Acción',
  cedear: 'Cedear',
  bono: 'Bono',
  on: 'ON',
  fci: 'FCI',
}

const ETIQUETA_TIPO_COBRO = {
  renta: 'Renta',
  amortizacion: 'Amortización',
  dividendo: 'Dividendo',
}

function formatearMonto(monto, moneda) {
  return moneda === 'ARS' ? formatearArs(monto) : formatearUsd(monto)
}

export function Cobros() {
  const [estado, setEstado] = useState({ cargando: true, error: null })
  const [cobros, setCobros] = useState([])
  const [especies, setEspecies] = useState([])
  const [formAbierto, setFormAbierto] = useState(false)
  const [cobroEditando, setCobroEditando] = useState(null)
  const [confirmandoId, setConfirmandoId] = useState(null)

  const [filtroEspecieId, setFiltroEspecieId] = useState('todas')
  const [filtroTipo, setFiltroTipo] = useState('todas')
  const [filtroDesde, setFiltroDesde] = useState('')
  const [filtroHasta, setFiltroHasta] = useState('')

  useEffect(() => {
    cargar()
  }, [])

  async function cargar() {
    setEstado({ cargando: true, error: null })
    try {
      const [{ data: filas, error: cobrosError }, { data: todasEspecies, error: espError }] = await Promise.all([
        supabase.from('cobros').select('*, especies(id, ticker, tipo, nombre)').order('fecha', { ascending: false }),
        supabase.from('especies').select('*').order('ticker'),
      ])
      if (cobrosError) throw cobrosError
      if (espError) throw espError

      setCobros(filas)
      setEspecies(todasEspecies)
      setEstado({ cargando: false, error: null })
    } catch (err) {
      setEstado({ cargando: false, error: err.message })
    }
  }

  const especiesConCobros = useMemo(() => {
    const idsUsados = new Set(cobros.map((c) => c.especie_id))
    return especies.filter((e) => idsUsados.has(e.id))
  }, [cobros, especies])

  const cobrosFiltrados = useMemo(() => {
    return cobros.filter((c) => {
      if (filtroEspecieId !== 'todas' && c.especie_id !== filtroEspecieId) return false
      if (filtroTipo !== 'todas' && c.tipo !== filtroTipo) return false
      if (filtroDesde && c.fecha < filtroDesde) return false
      if (filtroHasta && c.fecha > filtroHasta) return false
      return true
    })
  }, [cobros, filtroEspecieId, filtroTipo, filtroDesde, filtroHasta])

  function abrirAlta() {
    setCobroEditando(null)
    setFormAbierto(true)
  }

  function abrirEdicion(cobro) {
    setCobroEditando(cobro)
    setFormAbierto(true)
  }

  function cerrarForm() {
    setFormAbierto(false)
    setCobroEditando(null)
  }

  function alGuardar() {
    cerrarForm()
    cargar()
  }

  async function eliminar(id) {
    const { error } = await supabase.from('cobros').delete().eq('id', id)
    if (error) {
      setEstado((e) => ({ ...e, error: error.message }))
      return
    }
    setConfirmandoId(null)
    setCobros((prev) => prev.filter((c) => c.id !== id))
  }

  if (estado.cargando) {
    return (
      <div className="cobros">
        <p>Cargando cobros...</p>
      </div>
    )
  }

  return (
    <div className="cobros">
      <div className="cobros-header">
        <h1>Cobros</h1>
        <button className="boton-primario" onClick={abrirAlta}>
          + Nuevo cobro
        </button>
      </div>

      {estado.error && <p className="negativo">{estado.error}</p>}

      <div className="filtros">
        <select value={filtroEspecieId} onChange={(e) => setFiltroEspecieId(e.target.value)}>
          <option value="todas">Todas las especies</option>
          {especiesConCobros.map((e) => (
            <option key={e.id} value={e.id}>
              {e.ticker} ({ETIQUETA_TIPO_ESPECIE[e.tipo] ?? e.tipo})
            </option>
          ))}
        </select>
        <select value={filtroTipo} onChange={(e) => setFiltroTipo(e.target.value)}>
          <option value="todas">Todos los tipos</option>
          <option value="renta">Renta</option>
          <option value="amortizacion">Amortización</option>
          <option value="dividendo">Dividendo</option>
        </select>
        <input type="date" value={filtroDesde} onChange={(e) => setFiltroDesde(e.target.value)} />
        <span className="filtros-separador">a</span>
        <input type="date" value={filtroHasta} onChange={(e) => setFiltroHasta(e.target.value)} />
      </div>

      {cobrosFiltrados.length === 0 && <p>No hay cobros que coincidan con los filtros.</p>}

      {cobrosFiltrados.length > 0 && (
        <>
          <table className="tabla-cobros">
            <thead>
              <tr>
                <th>Especie</th>
                <th>Tipo</th>
                <th>Fecha</th>
                <th>Monto</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {cobrosFiltrados.map((c) => (
                <FilaCobro
                  key={c.id}
                  c={c}
                  confirmando={confirmandoId === c.id}
                  onEditar={() => abrirEdicion(c)}
                  onPedirEliminar={() => setConfirmandoId(c.id)}
                  onCancelarEliminar={() => setConfirmandoId(null)}
                  onConfirmarEliminar={() => eliminar(c.id)}
                />
              ))}
            </tbody>
          </table>

          <div className="cards-cobros">
            {cobrosFiltrados.map((c) => (
              <CardCobro
                key={c.id}
                c={c}
                confirmando={confirmandoId === c.id}
                onEditar={() => abrirEdicion(c)}
                onPedirEliminar={() => setConfirmandoId(c.id)}
                onCancelarEliminar={() => setConfirmandoId(null)}
                onConfirmarEliminar={() => eliminar(c.id)}
              />
            ))}
          </div>
        </>
      )}

      {formAbierto && (
        <CobroForm especies={especies} cobroInicial={cobroEditando} onGuardar={alGuardar} onCancelar={cerrarForm} />
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

function FilaCobro({ c, confirmando, onEditar, onPedirEliminar, onCancelarEliminar, onConfirmarEliminar }) {
  return (
    <tr>
      <td>
        <div className="especie-nombre">{c.especies?.ticker}</div>
        <div className="especie-tipo">{ETIQUETA_TIPO_ESPECIE[c.especies?.tipo] ?? c.especies?.tipo}</div>
      </td>
      <td>
        <span className={`chip-tipo-cobro ${c.tipo}`}>{ETIQUETA_TIPO_COBRO[c.tipo] ?? c.tipo}</span>
      </td>
      <td>{formatearFecha(c.fecha)}</td>
      <td>{formatearMonto(c.monto, c.moneda)}</td>
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

function CardCobro({ c, confirmando, onEditar, onPedirEliminar, onCancelarEliminar, onConfirmarEliminar }) {
  return (
    <div className="card-cobro">
      <div className="card-cobro-top">
        <div>
          <div className="especie-nombre">{c.especies?.ticker}</div>
          <div className="especie-tipo">
            {ETIQUETA_TIPO_ESPECIE[c.especies?.tipo] ?? c.especies?.tipo} · {formatearFecha(c.fecha)}
          </div>
        </div>
        <span className={`chip-tipo-cobro ${c.tipo}`}>{ETIQUETA_TIPO_COBRO[c.tipo] ?? c.tipo}</span>
      </div>
      <div className="card-cobro-monto">{formatearMonto(c.monto, c.moneda)}</div>
      <div className="card-cobro-acciones">
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
