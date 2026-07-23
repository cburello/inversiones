import { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'
import { obtenerUltimoTipoCambio, obtenerTipoCambioHistorico, obtenerUltimasCotizaciones } from '../lib/precios'
import { calcularPosicion } from '../lib/valuacion'
import { formatearArs, formatearUsd, formatearFecha, formatearPct, formatearCantidad } from '../lib/formato'
import { etiquetaTipo } from '../components/SelectorEspecie'
import { GraficoPrecio } from '../components/GraficoPrecio'
import './EspecieDetalle.css'

export function EspecieDetalle() {
  const { id } = useParams()
  const [estado, setEstado] = useState({ cargando: true, error: null })
  const [datos, setDatos] = useState(null)

  useEffect(() => {
    cargar()
  }, [id])

  async function cargar() {
    setEstado({ cargando: true, error: null })
    try {
      const [
        { data: especie, error: espError },
        { data: operaciones, error: opError },
        { data: cobros, error: cobError },
        { data: historialPrecios, error: histError },
      ] = await Promise.all([
        supabase.from('especies').select('*').eq('id', id).single(),
        supabase.from('operaciones').select('*').eq('especie_id', id).order('fecha', { ascending: false }),
        supabase.from('cobros').select('*').eq('especie_id', id).order('fecha', { ascending: false }),
        supabase.from('cotizaciones').select('fecha, precio, moneda, fuente').eq('especie_id', id).order('fecha', { ascending: true }),
      ])
      if (espError) throw espError
      if (opError) throw opError
      if (cobError) throw cobError
      if (histError) throw histError

      const ultimoTipoCambio = await obtenerUltimoTipoCambio()
      const tipoCambioHistorico = await obtenerTipoCambioHistorico(operaciones.map((o) => o.fecha))
      const cotizaciones = await obtenerUltimasCotizaciones([id])

      const posicion = ultimoTipoCambio
        ? calcularPosicion({
            especie,
            operaciones,
            cotizacion: cotizaciones.get(id) ?? null,
            mep: ultimoTipoCambio.mep,
            tipoCambioHistorico,
          })
        : null

      setDatos({ especie, operaciones, cobros, historialPrecios, posicion })
      setEstado({ cargando: false, error: null })
    } catch (err) {
      setEstado({ cargando: false, error: err.message })
    }
  }

  if (estado.cargando) {
    return (
      <div className="especie-detalle">
        <p>Cargando especie...</p>
      </div>
    )
  }

  if (estado.error) {
    return (
      <div className="especie-detalle">
        <p className="negativo">{estado.error}</p>
        <Link to="/">Volver al dashboard</Link>
      </div>
    )
  }

  const { especie, operaciones, cobros, historialPrecios, posicion } = datos

  return (
    <div className="especie-detalle">
      <Link to="/" className="volver-link">
        ← Volver al dashboard
      </Link>

      <div className="especie-detalle-header">
        <div>
          <h1>{especie.ticker}</h1>
          <p className="especie-detalle-subtitulo">
            {especie.nombre ? `${especie.nombre} · ` : ''}
            {etiquetaTipo(especie.tipo)}
            {especie.vencimiento ? ` · vence ${formatearFecha(especie.vencimiento)}` : ''}
          </p>
        </div>
        {posicion && (
          <div className="especie-detalle-resumen">
            <div>
              <p>Tenencia</p>
              <p>{formatearCantidad(posicion.tenencia)}</p>
            </div>
            <div>
              <p>Invertido</p>
              <p>
                {formatearArs(posicion.costoArs)} <span className="dato-secundario">· {formatearUsd(posicion.costoUsd)}</span>
              </p>
            </div>
            {!posicion.mantieneAVencimiento && (
              <div>
                <p>Resultado</p>
                <p className={posicion.resultadoUsd >= 0 ? 'positivo' : 'negativo'}>
                  {formatearUsd(posicion.resultadoUsd)} ({formatearPct(posicion.resultadoPct)})
                </p>
              </div>
            )}
          </div>
        )}
      </div>

      <section className="especie-detalle-seccion">
        <h2>Historial de precio</h2>
        <GraficoPrecio puntos={historialPrecios} />
      </section>

      <section className="especie-detalle-seccion">
        <h2>Lotes ({operaciones.length})</h2>
        {operaciones.length === 0 ? (
          <p>No hay operaciones cargadas para esta especie.</p>
        ) : (
          <table className="tabla-detalle">
            <thead>
              <tr>
                <th>Tipo</th>
                <th>Fecha</th>
                <th>Cantidad</th>
                <th>Monto</th>
              </tr>
            </thead>
            <tbody>
              {operaciones.map((op) => (
                <tr key={op.id}>
                  <td>
                    <span className={`chip-tipo ${op.tipo_operacion}`}>{op.tipo_operacion === 'compra' ? 'Compra' : 'Venta'}</span>
                  </td>
                  <td>{formatearFecha(op.fecha)}</td>
                  <td>{formatearCantidad(op.cantidad)}</td>
                  <td>{op.moneda === 'ARS' ? formatearArs(op.monto) : formatearUsd(op.monto)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section className="especie-detalle-seccion">
        <h2>Cobros ({cobros.length})</h2>
        {cobros.length === 0 ? (
          <p>No hay cobros cargados para esta especie.</p>
        ) : (
          <table className="tabla-detalle">
            <thead>
              <tr>
                <th>Tipo</th>
                <th>Fecha</th>
                <th>Monto</th>
              </tr>
            </thead>
            <tbody>
              {cobros.map((c) => (
                <tr key={c.id}>
                  <td>{c.tipo}</td>
                  <td>{formatearFecha(c.fecha)}</td>
                  <td>{c.moneda === 'ARS' ? formatearArs(c.monto) : formatearUsd(c.monto)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  )
}
