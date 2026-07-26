import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { CampoPassword } from '../components/CampoPassword'
import './CambiarContrasena.css'

function traducirError(mensaje) {
  if (/should be at least 6 characters/i.test(mensaje)) {
    return 'La contraseña debe tener al menos 6 caracteres.'
  }
  return mensaje || 'Ocurrió un error. Intentá de nuevo.'
}

export function CambiarContrasena() {
  const { cambiarPassword } = useAuth()

  const [password, setPassword] = useState('')
  const [confirmacion, setConfirmacion] = useState('')
  const [error, setError] = useState('')
  const [ok, setOk] = useState(false)
  const [enviando, setEnviando] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setOk(false)

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

    setPassword('')
    setConfirmacion('')
    setOk(true)
  }

  return (
    <div className="cambiar-contrasena">
      <Link to="/" className="volver-link">
        ← Volver al dashboard
      </Link>

      <h1>Cambiar contraseña</h1>

      {error && <p className="cc-error">{error}</p>}
      {ok && <p className="cc-ok">Contraseña actualizada.</p>}

      <form onSubmit={handleSubmit} className="cambiar-contrasena-form">
        <label htmlFor="password">Contraseña nueva</label>
        <CampoPassword
          id="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="new-password"
          required
          minLength={6}
        />
        <label htmlFor="confirmacion">Repetir contraseña</label>
        <CampoPassword
          id="confirmacion"
          value={confirmacion}
          onChange={(e) => setConfirmacion(e.target.value)}
          autoComplete="new-password"
          required
          minLength={6}
        />
        <button type="submit" className="cc-submit" disabled={enviando}>
          {enviando ? 'Guardando...' : 'Guardar'}
        </button>
      </form>
    </div>
  )
}
