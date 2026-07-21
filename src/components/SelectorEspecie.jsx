import { useEffect, useMemo, useState } from 'react'
import { obtenerTodoElMercado } from '../lib/precios'
import { formatearArs } from '../lib/formato'

export const TIPOS_ESPECIE = [
  { value: 'accion', label: 'Acción' },
  { value: 'cedear', label: 'Cedear' },
  { value: 'bono', label: 'Bono' },
  { value: 'on', label: 'ON' },
  { value: 'fci', label: 'FCI' },
]

export function etiquetaTipo(tipo) {
  return TIPOS_ESPECIE.find((t) => t.value === tipo)?.label ?? tipo
}

// Campo de ticker reutilizable: busca en el catálogo propio y, si no está, en
// el mercado (data912, los 4 tipos con API a la vez) para autocompletar el
// tipo de especie. Si tampoco está en el mercado, permite darla de alta con
// los datos mínimos. Avisa al padre (onCambio) qué especie quedó resuelta:
// { especieId, especieNueva } — uno de los dos, o ambos null si todavía no
// hay nada válido.
export function SelectorEspecie({ especies, esEdicion, especieFija, onCambio }) {
  const [ticker, setTicker] = useState('')
  const [tipoEspecie, setTipoEspecie] = useState('cedear')
  const [tipoElegidoAMano, setTipoElegidoAMano] = useState(false)
  const [nombreNueva, setNombreNueva] = useState('')
  const [monedaCotizacionNueva, setMonedaCotizacionNueva] = useState('ARS')
  const [mercado, setMercado] = useState(null) // null | 'cargando' | 'error' | { accion, cedear, bono, on }

  const tickerNormalizado = ticker.trim().toUpperCase()
  const tickersSugeridos = useMemo(() => [...new Set(especies.map((e) => e.ticker))], [especies])

  // El mismo ticker puede existir como más de un tipo en el catálogo (raro,
  // pero posible). Si hay una sola coincidencia se usa directo; si hay más
  // de una, el select de tipo sirve para desambiguar.
  const coincidenciasLocales = useMemo(() => {
    if (esEdicion || !tickerNormalizado) return []
    return especies.filter((e) => e.ticker.toUpperCase() === tickerNormalizado)
  }, [especies, tickerNormalizado, esEdicion])

  const especieEncontrada = useMemo(() => {
    if (coincidenciasLocales.length === 1) return coincidenciasLocales[0]
    if (coincidenciasLocales.length > 1) return coincidenciasLocales.find((e) => e.tipo === tipoEspecie) ?? null
    return null
  }, [coincidenciasLocales, tipoEspecie])

  const tickerEsNuevo = !esEdicion && tickerNormalizado !== '' && !especieEncontrada

  // Si no está en el catálogo, se busca en el mercado en los 4 tipos con API a
  // la vez, para detectar en cuál cotiza sin que el usuario tenga que elegirlo
  // primero. Se trae una sola vez por ticker.
  useEffect(() => {
    if (esEdicion || !tickerEsNuevo || mercado) return
    setMercado('cargando')
    obtenerTodoElMercado()
      .then(setMercado)
      .catch(() => setMercado('error'))
  }, [esEdicion, tickerEsNuevo, mercado])

  const coincidenciasMercado = useMemo(() => {
    if (!tickerEsNuevo || !mercado || mercado === 'cargando' || mercado === 'error') return []
    return Object.entries(mercado)
      .map(([tipo, mapa]) => (mapa.has(tickerNormalizado) ? { tipo, precio: mapa.get(tickerNormalizado) } : null))
      .filter(Boolean)
  }, [tickerEsNuevo, mercado, tickerNormalizado])

  // Autocompleta el tipo cuando hay una sola coincidencia (local o de mercado),
  // salvo que el usuario ya lo haya elegido a mano para este ticker.
  useEffect(() => {
    if (esEdicion || tipoElegidoAMano) return
    if (coincidenciasLocales.length === 1) {
      setTipoEspecie(coincidenciasLocales[0].tipo)
    } else if (coincidenciasLocales.length === 0 && coincidenciasMercado.length === 1) {
      setTipoEspecie(coincidenciasMercado[0].tipo)
    }
  }, [esEdicion, tipoElegidoAMano, coincidenciasLocales, coincidenciasMercado])

  // Avisa al formulario padre qué especie quedó resuelta.
  useEffect(() => {
    if (esEdicion) return
    if (especieEncontrada) {
      onCambio({ especieId: especieEncontrada.id, especieNueva: null })
    } else if (tickerEsNuevo) {
      onCambio({
        especieId: null,
        especieNueva: {
          ticker: tickerNormalizado,
          tipo: tipoEspecie,
          nombre: nombreNueva.trim() || null,
          moneda_cotizacion: monedaCotizacionNueva,
          factor_cotizacion: tipoEspecie === 'bono' || tipoEspecie === 'on' ? 100 : 1,
        },
      })
    } else {
      onCambio({ especieId: null, especieNueva: null })
    }
  }, [esEdicion, especieEncontrada, tickerEsNuevo, tickerNormalizado, tipoEspecie, nombreNueva, monedaCotizacionNueva, onCambio])

  function handleTickerChange(valor) {
    setTicker(valor)
    setTipoElegidoAMano(false)
    setMercado(null)
  }

  function handleTipoChange(valor) {
    setTipoEspecie(valor)
    setTipoElegidoAMano(true)
  }

  if (esEdicion) {
    return (
      <p className="especie-fija">
        {especieFija?.ticker} · {etiquetaTipo(especieFija?.tipo)}
      </p>
    )
  }

  return (
    <>
      <label>Ticker</label>
      <input
        list="tickers-sugeridos"
        value={ticker}
        onChange={(e) => handleTickerChange(e.target.value)}
        placeholder="ej. AAPL"
        autoFocus
      />
      <datalist id="tickers-sugeridos">
        {tickersSugeridos.map((t) => (
          <option key={t} value={t} />
        ))}
      </datalist>

      <label>Tipo de especie</label>
      <select value={tipoEspecie} onChange={(e) => handleTipoChange(e.target.value)}>
        {TIPOS_ESPECIE.map((t) => (
          <option key={t.value} value={t.value}>
            {t.label}
          </option>
        ))}
      </select>

      {coincidenciasLocales.length > 1 && (
        <div className="validacion-warning">
          Este ticker existe como más de un tipo en tu catálogo (
          {coincidenciasLocales.map((e) => etiquetaTipo(e.tipo)).join(', ')}). Elegí cuál corresponde arriba.
        </div>
      )}

      {especieEncontrada && (
        <div className="validacion-ok">
          ✓ {especieEncontrada.nombre || especieEncontrada.ticker} · {etiquetaTipo(especieEncontrada.tipo)}
        </div>
      )}

      {tickerEsNuevo && (
        <MensajeMercado mercado={mercado} coincidencias={coincidenciasMercado} tipoEspecie={tipoEspecie} tipoElegidoAMano={tipoElegidoAMano} />
      )}

      {tickerEsNuevo && (
        <div className="validacion-nueva">
          <p>No existe en el catálogo. Completá los datos para darlo de alta:</p>
          <label>Nombre (opcional)</label>
          <input value={nombreNueva} onChange={(e) => setNombreNueva(e.target.value)} placeholder="Descripción de la especie" />
          <label>Moneda de cotización</label>
          <select value={monedaCotizacionNueva} onChange={(e) => setMonedaCotizacionNueva(e.target.value)}>
            <option value="ARS">ARS</option>
            <option value="USD">USD</option>
          </select>
        </div>
      )}
    </>
  )
}

function MensajeMercado({ mercado, coincidencias, tipoEspecie, tipoElegidoAMano }) {
  if (tipoEspecie === 'fci') {
    return (
      <div className="validacion-sin-verificar">Los FCI no tienen cotización automática; la cuotaparte se carga a mano.</div>
    )
  }
  if (mercado === 'cargando' || mercado === null) {
    return <div className="validacion-verificando">Verificando en el mercado (acción, cedear, bono, ON)...</div>
  }
  if (mercado === 'error') {
    return (
      <div className="validacion-sin-verificar">No se pudo verificar contra el mercado. Revisá el ticker manualmente.</div>
    )
  }
  if (coincidencias.length === 0) {
    return (
      <div className="validacion-warning">
        No se encontró este ticker en ningún tipo del mercado. Revisá que esté bien escrito antes de darlo de alta.
      </div>
    )
  }
  if (coincidencias.length === 1) {
    return (
      <div className="validacion-ok">
        ✓ Cotiza en el mercado como {etiquetaTipo(coincidencias[0].tipo).toLowerCase()} a{' '}
        {formatearArs(coincidencias[0].precio)}
      </div>
    )
  }
  return (
    <div className={tipoElegidoAMano ? 'validacion-ok' : 'validacion-warning'}>
      Se encontró en más de un tipo: {coincidencias.map((c) => etiquetaTipo(c.tipo)).join(', ')}. Elegí cuál corresponde
      arriba.
    </div>
  )
}
