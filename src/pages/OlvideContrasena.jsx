import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import './Login.css'

function traducirError(mensaje) {
  if (/rate limit|security purposes/i.test(mensaje)) {
    return 'Ya pediste un link hace poco. Esperá un minuto y probá de nuevo.'
  }
  return mensaje || 'Ocurrió un error. Intentá de nuevo.'
}

export function OlvideContrasena() {
  const [email, setEmail] = useState('')
  const [error, setError] = useState('')
  const [enviado, setEnviado] = useState(false)
  const [enviando, setEnviando] = useState(false)

  const { enviarRecuperacion } = useAuth()

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setEnviando(true)

    const { error: authError } = await enviarRecuperacion(email)

    setEnviando(false)

    if (authError) {
      setError(traducirError(authError.message))
      return
    }

    setEnviado(true)
  }

  return (
    <div className="login-page">
      <div className="login-card">
        <div className="login-header">
          <div className="login-icon">$</div>
          <h1>Cartera de inversiones</h1>
          <p className="login-subtitle">Recuperar contraseña</p>
        </div>

        <div className="login-box">
          {enviado ? (
            <p className="login-info">
              Si el email existe en el sistema, te enviamos un link para elegir una contraseña nueva. Revisá tu casilla.
            </p>
          ) : (
            <>
              {error && <p className="login-error">{error}</p>}
              <form onSubmit={handleSubmit}>
                <label className="login-field" htmlFor="email">
                  Email
                </label>
                <input
                  id="email"
                  type="email"
                  className="login-input"
                  placeholder="nombre@email.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  autoComplete="email"
                  required
                />
                <button type="submit" className="login-submit" disabled={enviando}>
                  {enviando ? 'Enviando...' : 'Enviar link de recuperación'}
                </button>
              </form>
            </>
          )}
          <Link to="/login" className="login-volver">
            ← Volver a iniciar sesión
          </Link>
        </div>
      </div>
    </div>
  )
}
