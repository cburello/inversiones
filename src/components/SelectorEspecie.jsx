import { useEffect, useMemo, useState } from 'react'
import { obtenerTodoElMercado, obtenerCatalogoFci } from '../lib/precios'
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

// Saca tildes y pasa a minúsculas, para poder buscar "dolares" y encontrar
// "Dólares" (nadie tipea tildes en un buscador).
function normalizar(texto) {
  return texto
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
}

function sugerirTickerCorto(fondo) {
  return fondo
    .replace(/^Fima\s+/i, '')
    .replace(/^Adcap\s+/i, '')
    .replace(/\s*-\s*Clase.*$/i, '')
    .trim()
    .toUpperCase()
}

// Varios FCI en dólares (vistos en Fima y en Balanz) informan la cuotaparte de
// CAFCI en una escala 1000 veces mayor a la real (probablemente por una
// redenominación histórica). No hay forma de confirmarlo sin el dato real del
// usuario, así que esto es una heurística por nombre; queda visible y
// editable el selector de moneda para que se pueda corregir si hace falta.
function detectarMonedaFci(fondo) {
  return /d[oó]lar|usd/i.test(fondo) ? 'USD' : 'ARS'
}

// Campo de ticker reutilizable: busca en el catálogo propio y, si no está,
// en el mercado (data912 para acción/cedear/bono/ON, o el catálogo de CAFCI
// para FCI) para autocompletar el tipo de especie o mostrar el fondo real. Si
// tampoco se encuentra, permite darla de alta con los datos mínimos. Avisa al
// padre (onCambio) qué especie quedó resuelta: { especieId, especieNueva } —
// uno de los dos, o ambos null si todavía no hay nada válido.
export function SelectorEspecie({ especies, esEdicion, especieFija, onCambio }) {
  const [ticker, setTicker] = useState('')
  const [tipoEspecie, setTipoEspecie] = useState('cedear')
  const [tipoElegidoAMano, setTipoElegidoAMano] = useState(false)
  const [nombreNueva, setNombreNueva] = useState('')
  const [monedaCotizacionNueva, setMonedaCotizacionNueva] = useState('ARS')
  const [mercado, setMercado] = useState(null) // null | 'cargando' | 'error' | { accion, cedear, bono, on }
  const [catalogoFci, setCatalogoFci] = useState(null) // null | 'cargando' | 'error' | [{fondo, categoria, vcp, fecha}]
  const [fondoSeleccionado, setFondoSeleccionado] = useState(null)
  const [tickerCortoFci, setTickerCortoFci] = useState('')

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

  // Si no está en el catálogo y el tipo no es FCI, se busca en el mercado en
  // los 4 tipos con API a la vez, para detectar en cuál cotiza sin que el
  // usuario tenga que elegirlo primero. Se trae una sola vez por ticker.
  useEffect(() => {
    if (esEdicion || tipoEspecie === 'fci' || !tickerEsNuevo || mercado) return
    setMercado('cargando')
    obtenerTodoElMercado()
      .then(setMercado)
      .catch(() => setMercado('error'))
  }, [esEdicion, tipoEspecie, tickerEsNuevo, mercado])

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

  // Para FCI se busca por nombre en el catálogo de CAFCI (todas las
  // categorías a la vez, ya que un mismo fondo puede estar en cualquiera).
  // Se trae una sola vez y se busca en memoria en cada tecla.
  useEffect(() => {
    if (esEdicion || tipoEspecie !== 'fci' || !tickerEsNuevo || catalogoFci) return
    setCatalogoFci('cargando')
    obtenerCatalogoFci()
      .then(setCatalogoFci)
      .catch(() => setCatalogoFci('error'))
  }, [esEdicion, tipoEspecie, tickerEsNuevo, catalogoFci])

  const resultadosFci = useMemo(() => {
    if (tipoEspecie !== 'fci' || !Array.isArray(catalogoFci) || !ticker.trim()) return []
    const q = normalizar(ticker)
    return catalogoFci.filter((f) => normalizar(f.fondo).includes(q)).slice(0, 8)
  }, [tipoEspecie, catalogoFci, ticker])

  // Avisa al formulario padre qué especie quedó resuelta.
  useEffect(() => {
    if (esEdicion) return

    if (especieEncontrada) {
      onCambio({ especieId: especieEncontrada.id, especieNueva: null })
      return
    }

    if (tipoEspecie === 'fci') {
      // Verificado contra ~2.135 fondos de CAFCI (patrimonio/ccp vs. vcp):
      // el vcp que informa la API viene sistemáticamente en una escala 1000
      // veces mayor a la real, en ARS y en USD por igual. Para un fondo
      // elegido del buscador (confirmado contra CAFCI) se usa 1000 siempre;
      // para el alta manual (sin verificar) se deja 1, más conservador.
      if (fondoSeleccionado && tickerCortoFci.trim()) {
        onCambio({
          especieId: null,
          especieNueva: {
            ticker: tickerCortoFci.trim().toUpperCase(),
            tipo: 'fci',
            nombre: fondoSeleccionado.fondo,
            moneda_cotizacion: monedaCotizacionNueva,
            factor_cotizacion: 1000,
          },
        })
      } else if (tickerEsNuevo) {
        onCambio({
          especieId: null,
          especieNueva: {
            ticker: tickerNormalizado,
            tipo: 'fci',
            nombre: nombreNueva.trim() || null,
            moneda_cotizacion: monedaCotizacionNueva,
            factor_cotizacion: 1,
          },
        })
      } else {
        onCambio({ especieId: null, especieNueva: null })
      }
      return
    }

    if (tickerEsNuevo) {
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
  }, [
    esEdicion,
    especieEncontrada,
    tipoEspecie,
    fondoSeleccionado,
    tickerCortoFci,
    tickerEsNuevo,
    tickerNormalizado,
    nombreNueva,
    monedaCotizacionNueva,
    onCambio,
  ])

  function handleTickerChange(valor) {
    setTicker(valor)
    setTipoElegidoAMano(false)
    setMercado(null)
    setFondoSeleccionado(null)
    setTickerCortoFci('')
  }

  function handleTipoChange(valor) {
    setTipoEspecie(valor)
    setTipoElegidoAMano(true)
    setFondoSeleccionado(null)
    setTickerCortoFci('')
  }

  function elegirFondoFci(fondo) {
    setFondoSeleccionado(fondo)
    setTickerCortoFci(sugerirTickerCorto(fondo.fondo))
    setMonedaCotizacionNueva(detectarMonedaFci(fondo.fondo))
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
      <label>{tipoEspecie === 'fci' ? 'Ticker o nombre del fondo' : 'Ticker'}</label>
      <input
        list="tickers-sugeridos"
        value={ticker}
        onChange={(e) => handleTickerChange(e.target.value)}
        placeholder={tipoEspecie === 'fci' ? 'ej. mix dolares' : 'ej. AAPL'}
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

      {tickerEsNuevo && tipoEspecie === 'fci' && (
        <BuscadorFci
          catalogo={catalogoFci}
          resultados={resultadosFci}
          fondoSeleccionado={fondoSeleccionado}
          tickerCorto={tickerCortoFci}
          onElegir={elegirFondoFci}
          onCambiarTickerCorto={setTickerCortoFci}
          nombreNueva={nombreNueva}
          setNombreNueva={setNombreNueva}
          monedaCotizacionNueva={monedaCotizacionNueva}
          setMonedaCotizacionNueva={setMonedaCotizacionNueva}
        />
      )}

      {tickerEsNuevo && tipoEspecie !== 'fci' && (
        <>
          <MensajeMercado
            mercado={mercado}
            coincidencias={coincidenciasMercado}
            tipoEspecie={tipoEspecie}
            tipoElegidoAMano={tipoElegidoAMano}
          />
          <div className="validacion-nueva">
            <p>No existe en el catálogo. Completá los datos para darlo de alta:</p>
            <label>Nombre (opcional)</label>
            <input
              value={nombreNueva}
              onChange={(e) => setNombreNueva(e.target.value)}
              placeholder="Descripción de la especie"
            />
            <label>Moneda de cotización</label>
            <select value={monedaCotizacionNueva} onChange={(e) => setMonedaCotizacionNueva(e.target.value)}>
              <option value="ARS">ARS</option>
              <option value="USD">USD</option>
            </select>
          </div>
        </>
      )}
    </>
  )
}

function BuscadorFci({
  catalogo,
  resultados,
  fondoSeleccionado,
  tickerCorto,
  onElegir,
  onCambiarTickerCorto,
  nombreNueva,
  setNombreNueva,
  monedaCotizacionNueva,
  setMonedaCotizacionNueva,
}) {
  return (
    <div className="validacion-nueva">
      {fondoSeleccionado ? (
        <div className="validacion-ok">
          ✓ {fondoSeleccionado.fondo} · cuotaparte {formatearArs(fondoSeleccionado.vcp)}
        </div>
      ) : catalogo === 'cargando' || catalogo === null ? (
        <p>Buscando en el catálogo de CAFCI...</p>
      ) : catalogo === 'error' ? (
        <p>No se pudo consultar CAFCI. Completá el nombre a mano abajo.</p>
      ) : resultados.length === 0 ? (
        <p>No se encontró ningún fondo con ese nombre en CAFCI. Completá el nombre a mano abajo, o revisá cómo lo escribiste.</p>
      ) : (
        <div className="resultados-fci">
          {resultados.map((f) => (
            <button type="button" key={f.fondo} className="resultado-fci" onClick={() => onElegir(f)}>
              <span>{f.fondo}</span>
              <span className="dato-secundario">{formatearArs(f.vcp)}</span>
            </button>
          ))}
        </div>
      )}

      {fondoSeleccionado ? (
        <>
          <label>Ticker corto (como lo vas a ver en la app)</label>
          <input value={tickerCorto} onChange={(e) => onCambiarTickerCorto(e.target.value)} />
        </>
      ) : (
        <>
          <label>Nombre (si no lo encontraste arriba)</label>
          <input value={nombreNueva} onChange={(e) => setNombreNueva(e.target.value)} placeholder="Descripción de la especie" />
        </>
      )}

      <label>Moneda de cotización</label>
      <select value={monedaCotizacionNueva} onChange={(e) => setMonedaCotizacionNueva(e.target.value)}>
        <option value="ARS">ARS</option>
        <option value="USD">USD</option>
      </select>
    </div>
  )
}

function MensajeMercado({ mercado, coincidencias, tipoEspecie, tipoElegidoAMano }) {
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
