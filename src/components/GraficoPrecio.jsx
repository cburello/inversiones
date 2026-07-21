import { formatearFecha } from '../lib/formato'

// Gráfico de línea simple en SVG puro (sin librerías), a partir del historial
// de la tabla cotizaciones. Como recién empezamos a cachear precios día a día,
// el historial va a ser corto al principio y se va a ir completando solo.
export function GraficoPrecio({ puntos }) {
  if (puntos.length === 0) {
    return <p className="grafico-vacio">Todavía no hay historial de precios cacheado para esta especie.</p>
  }

  if (puntos.length === 1) {
    return (
      <p className="grafico-vacio">
        Solo hay un precio cacheado ({formatearFecha(puntos[0].fecha)}). El gráfico va a aparecer cuando haya más de un
        día de historial.
      </p>
    )
  }

  const ancho = 640
  const alto = 160
  const padding = 24

  const precios = puntos.map((p) => p.precio)
  const min = Math.min(...precios)
  const max = Math.max(...precios)
  const rango = max - min || 1

  const coordX = (i) => padding + (i / (puntos.length - 1)) * (ancho - padding * 2)
  const coordY = (precio) => alto - padding - ((precio - min) / rango) * (alto - padding * 2)

  const pathD = puntos.map((p, i) => `${i === 0 ? 'M' : 'L'} ${coordX(i)} ${coordY(p.precio)}`).join(' ')
  const ultimo = puntos[puntos.length - 1]

  return (
    <svg viewBox={`0 0 ${ancho} ${alto}`} className="grafico-precio" preserveAspectRatio="xMidYMid meet">
      <path d={pathD} fill="none" stroke="var(--accent)" strokeWidth="2" />
      {puntos.map((p, i) => (
        <circle key={p.fecha} cx={coordX(i)} cy={coordY(p.precio)} r={i === puntos.length - 1 ? 3.5 : 2} fill="var(--accent)" />
      ))}
      <text x={padding} y={14} className="grafico-etiqueta">
        {formatearFecha(puntos[0].fecha)}
      </text>
      <text x={ancho - padding} y={14} textAnchor="end" className="grafico-etiqueta">
        {formatearFecha(ultimo.fecha)}
      </text>
    </svg>
  )
}
