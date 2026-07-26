import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { CampoPassword } from '../components/CampoPassword'
import './Login.css'

function traducirError(mensaje) {
  if (/should be at least 6 characters/i.test(mensaje)) {
    return 'La contraseña debe tener al menos 6 caracteres.'
  }
  return mensaje || 'Ocurrió un error. Intentá de nuevo.'
}

export function RestablecerContrasena() {
  const { session, loading, cambiarPassword } = useAuth()
  const navigate = useNavigate()

  const [password, setPassword] = useState('')
  const [confirmacion, setConfirmacion] = useState('')
  const [error, setError] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [listo, setListo] = useState(false)
  // Supabase devuelve el motivo real (link vencido, ya usado, etc.) como
  // parámetros en la URL cuando el redirect falla, en vez de tirar un error de JS.
  const [errorLink] = useState(() => {
    const hash = window.location.hash.startsWith('#') ? window.location.hash.slice(1) : ''
    const params = new URLSearchParams(hash || window.location.search)
    const descripcion = params.get('error_description')
    return descripcion ? descripcion.replace(/\+/g, ' ') : null
  })

  useEffect(() => {
    if (!listo) return
    const timer = setTimeout(() => navigate('/', { replace: true }), 2000)
    return () => clearTimeout(timer)
  }, [listo, navigate])

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')

    if (password !== confirmacion) {
      setError('Las contraseñas no coinciden.')
      return
    }

    setEnviando(true)
    const { error: authError } = await cambiarPassword(password)
    setEnviando(false)

    if (authError) {
      setError(traducirError(authError.message))
      return
    }

    setListo(true)
  }

  return (
    <div className="login-page">
      <div className="login-card">
        <div className="login-header">
          <div className="login-icon">$</div>
          <h1>Cartera de inversiones</h1>
          <p className="login-subtitle">Elegí una contraseña nueva</p>
        </div>

        <div className="login-box">
          {listo ? (
            <p className="login-info">Contraseña actualizada. Te llevamos al dashboard...</p>
          ) : loading ? (
            <p className="login-info">Verificando el link...</p>
          ) : !session ? (
            <>
              <p className="login-error">{errorLink ?? 'Este link no es válido o ya venció.'}</p>
              <Link to="/olvide-contrasena" className="login-volver">
                Pedir un link nuevo
              </Link>
            </>
          ) : (
            <>
              {error && <p className="login-error">{error}</p>}
              <form onSubmit={handleSubmit}>
                <label className="login-field" htmlFor="password">
                  Contraseña nueva
                </label>
                <CampoPassword
                  id="password"
                  className="login-input"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="new-password"
                  required
                  minLength={6}
                />
                <label className="login-field" htmlFor="confirmacion">
                  Repetir contraseña
                </label>
                <CampoPassword
                  id="confirmacion"
                  className="login-input"
                  value={confirmacion}
                  onChange={(e) => setConfirmacion(e.target.value)}
                  autoComplete="new-password"
                  required
                  minLength={6}
                />
                <button type="submit" className="login-submit" disabled={enviando}>
                  {enviando ? 'Guardando...' : 'Guardar contraseña'}
                </button>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
