import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'
import {
  actualizarCotizaciones,
  actualizarTipoCambio,
  obtenerUltimasCotizaciones,
  obtenerUltimoTipoCambio,
  obtenerTipoCambioHistorico,
} from '../lib/precios'
import { calcularPosicion, calcularConsolidado } from '../lib/valuacion'
import { formatearArs, formatearUsd, formatearPct, formatearFecha, formatearFechaHora, formatearCantidad } from '../lib/formato'
import './Dashboard.css'

const TOLERANCIA_TENENCIA = 0.0001

const ETIQUETA_TIPO = {
  accion: 'Acción',
  cedear: 'Cedear',
  bono: 'Bono',
  on: 'ON',
  fci: 'FCI',
}

export function Dashboard() {
  const [estado, setEstado] = useState({ cargando: true, error: null })
  const [posiciones, setPosiciones] = useState([])
  const [operaciones, setOperaciones] = useState([])
  const [tipoCambio, setTipoCambio] = useState(null)
  const [filtroTipo, setFiltroTipo] = useState('todas')
  const [orden, setOrden] = useState({ campo: 'valuacion', asc: false })

  useEffect(() => {
    cargar()
  }, [])

  async function cargar() {
    setEstado({ cargando: true, error: null })
    try {
      const { data: operaciones, error: opError } = await supabase.from('operaciones').select('*')
      if (opError) throw opError

      const especieIds = [...new Set(operaciones.map((o) => o.especie_id))]
      const { data: especies, error: espError } = await supabase.from('especies').select('*').in('id', especieIds)
      if (espError) throw espError

      await Promise.allSettled([actualizarTipoCambio(), actualizarCotizaciones(especies)])

      const fechasOperaciones = operaciones.map((o) => o.fecha)
      const [cotizaciones, ultimoTipoCambio, tipoCambioHistorico] = await Promise.all([
        obtenerUltimasCotizaciones(especieIds),
        obtenerUltimoTipoCambio(),
        obtenerTipoCambioHistorico(fechasOperaciones),
      ])

      if (!ultimoTipoCambio) {
        setEstado({ cargando: false, error: 'No se pudo obtener el tipo de cambio y no hay ninguno cacheado todavía.' })
        return
      }

      const operacionesPorEspecie = new Map()
      for (const op of operaciones) {
        if (!operacionesPorEspecie.has(op.especie_id)) operacionesPorEspecie.set(op.especie_id, [])
        operacionesPorEspecie.get(op.especie_id).push(op)
      }

      const todasLasPosiciones = especies.map((especie) =>
        calcularPosicion({
          especie,
          operaciones: operacionesPorEspecie.get(especie.id) ?? [],
          cotizacion: cotizaciones.get(especie.id) ?? null,
          mep: ultimoTipoCambio.mep,
          tipoCambioHistorico,
        })
      )

      // tenencia negativa = datos incompletos (ventas sin la compra correspondiente
      // en la planilla original); no es una posición real, se excluye.
      const posicionesVigentes = todasLasPosiciones.filter((p) => p.tenencia > TOLERANCIA_TENENCIA)

      setPosiciones(posicionesVigentes)
      setOperaciones(operaciones)
      setTipoCambio(ultimoTipoCambio)
      setEstado({ cargando: false, error: null })
    } catch (err) {
      setEstado({ cargando: false, error: err.message })
    }
  }

  function cambiarOrden(campo) {
    setOrden((actual) =>
      actual.campo === campo ? { campo, asc: !actual.asc } : { campo, asc: campo === 'ticker' }
    )
  }

  if (estado.cargando) {
    return (
      <div className="dashboard">
        <p>Cargando cartera...</p>
      </div>
    )
  }

  if (estado.error) {
    return (
      <div className="dashboard">
        <p className="negativo">{estado.error}</p>
        <button onClick={cargar}>Reintentar</button>
      </div>
    )
  }

  const tiposDisponibles = [...new Set(posiciones.map((p) => p.especie.tipo))]
  const posicionesFiltradas = (
    filtroTipo === 'todas' ? posiciones : posiciones.filter((p) => p.especie.tipo === filtroTipo)
  )
    .slice()
    .sort((a, b) => {
      let comparacion
      if (orden.campo === 'ticker') comparacion = a.especie.ticker.localeCompare(b.especie.ticker)
      else if (orden.campo === 'fecha') comparacion = a.fechaUltimaOperacion.localeCompare(b.fechaUltimaOperacion)
      else comparacion = a.valuacionUsd - b.valuacionUsd
      return orden.asc ? comparacion : -comparacion
    })
  const consolidado = calcularConsolidado(posicionesFiltradas)

  const especieIdsFiltrados = new Set(posicionesFiltradas.map((p) => p.especie.id))
  const operacionesFiltradas = operaciones.filter((o) => especieIdsFiltrados.has(o.especie_id))

  const timestampsCotizaciones = posiciones.filter((p) => p.precioActualizadoEn).map((p) => p.precioActualizadoEn)
  const cotizacionMasReciente = timestampsCotizaciones.length
    ? timestampsCotizaciones.reduce((max, actual) => (actual > max ? actual : max))
    : null

  return (
    <div className="dashboard">
      <h1>Cartera de inversiones</h1>

      <div className="resumen-grid">
        <div className="resumen-card">
          <p>Valuación total ARS</p>
          <p>{formatearArs(consolidado.valuacionArs)}</p>
        </div>
        <div className="resumen-card">
          <p>Valuación total USD MEP</p>
          <p>{formatearUsd(consolidado.valuacionUsd)}</p>
        </div>
        <div className={`resumen-card ${consolidado.resultadoUsd >= 0 ? 'positivo' : 'negativo'}`}>
          <p>Resultado consolidado</p>
          <p>
            {formatearUsd(consolidado.resultadoUsd)} ({formatearPct(consolidado.resultadoPct)})
          </p>
        </div>
        <div className="resumen-card">
          <p>Monto invertido</p>
          <p>
            {formatearArs(consolidado.costoArs)}
            <span className="resumen-card-secundario"> · {formatearUsd(consolidado.costoUsd)}</span>
          </p>
        </div>
      </div>

      <div className="mep-bar">
        <span>
          Dólar MEP usado: <strong>{formatearArs(tipoCambio.mep)}</strong>
        </span>
        <span className="muted">· actualizado {formatearFechaHora(tipoCambio.actualizado_en ?? tipoCambio.fecha)}</span>
        <span className="muted">
          · {operacionesFiltradas.length} operaciones / {posicionesFiltradas.length} especies
          {filtroTipo !== 'todas' ? ` (${ETIQUETA_TIPO[filtroTipo] ?? filtroTipo})` : ''}
        </span>
        {cotizacionMasReciente && (
          <span className="muted">· cotizaciones actualizadas {formatearFechaHora(cotizacionMasReciente)}</span>
        )}
      </div>

      {posiciones.length === 0 && <p>Todavía no tenés posiciones vigentes.</p>}

      {posiciones.length > 0 && (
        <>
          <div className="filtro-tipos">
            <button className={filtroTipo === 'todas' ? 'activo' : ''} onClick={() => setFiltroTipo('todas')}>
              Todas
            </button>
            {tiposDisponibles.map((tipo) => (
              <button key={tipo} className={filtroTipo === tipo ? 'activo' : ''} onClick={() => setFiltroTipo(tipo)}>
                {ETIQUETA_TIPO[tipo] ?? tipo}
              </button>
            ))}
          </div>

          <div className="orden-controles">
            <span className="orden-etiqueta">Ordenar por:</span>
            <BotonOrden campo="valuacion" ordenActual={orden} onClick={cambiarOrden}>
              Valuación
            </BotonOrden>
            <BotonOrden campo="ticker" ordenActual={orden} onClick={cambiarOrden}>
              Ticker
            </BotonOrden>
            <BotonOrden campo="fecha" ordenActual={orden} onClick={cambiarOrden}>
              Última operación
            </BotonOrden>
          </div>

          <div className="tabla-wrapper">
            <table className="tabla-especies">
              <thead>
                <tr>
                  <th>Especie</th>
                  <th>Tenencia</th>
                  <th>Fecha inversión</th>
                  <th>Precio</th>
                  <th>Invertido</th>
                  <th>Valuación</th>
                  <th>Resultado</th>
                </tr>
              </thead>
              <tbody>
                {posicionesFiltradas.map((p) => (
                  <FilaEspecie key={p.especie.id} p={p} />
                ))}
              </tbody>
            </table>
          </div>

          <div className="cards-especies">
            {posicionesFiltradas.map((p) => (
              <CardEspecie key={p.especie.id} p={p} />
            ))}
          </div>
        </>
      )}
    </div>
  )
}

function BotonOrden({ campo, ordenActual, onClick, children }) {
  const activo = ordenActual.campo === campo
  return (
    <button className={activo ? 'activo' : ''} onClick={() => onClick(campo)}>
      {children} {activo && (ordenActual.asc ? '↑' : '↓')}
    </button>
  )
}

// Botón que al tocarlo (o pasar el mouse en desktop) muestra un tooltip con contenido libre.
function InfoTooltip({ trigger, triggerClassName = '', children }) {
  const [abierto, setAbierto] = useState(false)

  return (
    <span className="info-tooltip-wrap">
      <button type="button" className={`info-tooltip-boton ${triggerClassName}`} onClick={() => setAbierto((v) => !v)}>
        {trigger}
      </button>
      <span className={`info-tooltip ${abierto ? 'abierto' : ''}`}>{children}</span>
    </span>
  )
}

function TickerConDescripcion({ especie }) {
  if (!especie.nombre) return <div className="especie-nombre">{especie.ticker}</div>

  return (
    <div>
      <InfoTooltip trigger={especie.ticker} triggerClassName="especie-nombre ticker-boton">
        {especie.nombre}
      </InfoTooltip>
    </div>
  )
}

// Detalle de qué MEP se usó para convertir cada lote comprado en dólares a pesos.
function DetalleInvertido({ p }) {
  if (!p.detalleInvertido.length) return null

  return (
    <InfoTooltip trigger="ⓘ" triggerClassName="info-icono">
      <div className="tooltip-titulo">Tipo de cambio usado por lote</div>
      {p.detalleInvertido.map((d, i) => (
        <div key={i} className="tooltip-fila">
          {formatearFecha(d.fecha)} · {d.moneda === 'USD' ? formatearUsd(d.monto) : formatearArs(d.monto)} → MEP{' '}
          {formatearArs(d.mep)}
          <div className="dato-secundario">{d.fuente}</div>
        </div>
      ))}
    </InfoTooltip>
  )
}

function FilaEspecie({ p }) {
  return (
    <tr>
      <td>
        <TickerConDescripcion especie={p.especie} />
        <div className="especie-tipo">
          {p.especie.tipo} · <Link to={`/especies/${p.especie.id}`}>ver detalle</Link>
        </div>
        {p.esStale && <div className="badge-stale">precio del {formatearFecha(p.fechaPrecio)}</div>}
      </td>
      <td>{formatearCantidad(p.tenencia)}</td>
      <td>{formatearFecha(p.fechaInversion)}</td>
      <td>
        {p.mantieneAVencimiento ? (
          <span className="dato-secundario">a vencimiento</span>
        ) : p.tienePrecio ? (
          <>
            <div>{formatearArs(p.precioArs)}</div>
            <div className="dato-secundario">{formatearUsd(p.precioUsd)}</div>
          </>
        ) : (
          'sin cotización'
        )}
      </td>
      <td>
        <div>
          {formatearArs(p.costoArs)} <DetalleInvertido p={p} />
        </div>
        <div className="dato-secundario">{formatearUsd(p.costoUsd)}</div>
      </td>
      {p.mantieneAVencimiento ? (
        <td className="dato-secundario" colSpan={2}>
          Se mantiene a vencimiento, sin valuación de mercado
        </td>
      ) : (
        <>
          <td>
            <div>{formatearArs(p.valuacionArs)}</div>
            <div className="dato-secundario">{formatearUsd(p.valuacionUsd)}</div>
          </td>
          <td className={p.resultadoUsd >= 0 ? 'positivo' : 'negativo'}>
            <div>{formatearArs(p.resultadoArs)}</div>
            <div>
              {formatearUsd(p.resultadoUsd)} ({formatearPct(p.resultadoPct)})
            </div>
          </td>
        </>
      )}
    </tr>
  )
}

function CardEspecie({ p }) {
  return (
    <div className="card-especie">
      <div className="card-especie-top">
        <div>
          <TickerConDescripcion especie={p.especie} />
          <div className="especie-tipo">
            {p.especie.tipo} · {formatearCantidad(p.tenencia)} unidades · <Link to={`/especies/${p.especie.id}`}>ver detalle</Link>
          </div>
          {p.esStale && <div className="badge-stale">precio del {formatearFecha(p.fechaPrecio)}</div>}
        </div>
        <div className="card-especie-valores">
          {p.mantieneAVencimiento ? (
            <div className="dato-secundario">a vencimiento</div>
          ) : (
            <>
              <div className="especie-nombre">{formatearArs(p.valuacionArs)}</div>
              <div className="dato-secundario">{formatearUsd(p.valuacionUsd)}</div>
              <div className={p.resultadoUsd >= 0 ? 'positivo' : 'negativo'}>
                {formatearUsd(p.resultadoUsd)} ({formatearPct(p.resultadoPct)})
              </div>
            </>
          )}
        </div>
      </div>
      <div className="card-especie-precio">
        Precio: {p.mantieneAVencimiento ? 'sin valuación de mercado' : p.tienePrecio ? `${formatearArs(p.precioArs)} · ${formatearUsd(p.precioUsd)}` : 'sin cotización'}
      </div>
      <div className="card-especie-precio">
        Invertido: {formatearArs(p.costoArs)} · {formatearUsd(p.costoUsd)} ({formatearFecha(p.fechaInversion)}){' '}
        <DetalleInvertido p={p} />
      </div>
    </div>
  )
}
