import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import './Login.css'

const MENSAJES_ERROR = {
  'Invalid login credentials': 'Email o contraseña incorrectos.',
  'User already registered': 'Ya existe una cuenta con ese email.',
  'Email not confirmed': 'Confirmá tu email antes de ingresar.',
  'Password should be at least 6 characters': 'La contraseña debe tener al menos 6 caracteres.',
}

function traducirError(mensaje) {
  return MENSAJES_ERROR[mensaje] ?? 'Ocurrió un error. Intentá de nuevo.'
}

export function Login() {
  const [modo, setModo] = useState('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [info, setInfo] = useState('')
  const [enviando, setEnviando] = useState(false)

  const { user, signIn, signUp } = useAuth()
  const navigate = useNavigate()

  useEffect(() => {
    if (user) navigate('/', { replace: true })
  }, [user, navigate])

  function cambiarModo(nuevoModo) {
    setModo(nuevoModo)
    setError('')
    setInfo('')
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setInfo('')
    setEnviando(true)

    const { data, error: authError } =
      modo === 'login' ? await signIn(email, password) : await signUp(email, password)

    setEnviando(false)

    if (authError) {
      setError(traducirError(authError.message))
      return
    }

    if (modo === 'signup' && !data.session) {
      setInfo('Revisá tu correo para confirmar la cuenta antes de ingresar.')
    }
  }

  return (
    <div className="login-page">
      <div className="login-card">
        <div className="login-header">
          <div className="login-icon">$</div>
          <h1>Cartera de inversiones</h1>
          <p className="login-subtitle">Ingresá para ver tu tenencia</p>
        </div>

        <div className="login-box">
          <div className="login-tabs">
            <button
              type="button"
              className={`login-tab ${modo === 'login' ? 'active' : ''}`}
              onClick={() => cambiarModo('login')}
            >
              Iniciar sesión
            </button>
            <button
              type="button"
              className={`login-tab ${modo === 'signup' ? 'active' : ''}`}
              onClick={() => cambiarModo('signup')}
            >
              Crear cuenta
            </button>
          </div>

          {error && <p className="login-error">{error}</p>}
          {info && <p className="login-info">{info}</p>}

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

            <label className="login-field" htmlFor="password">
              Contraseña
            </label>
            <input
              id="password"
              type="password"
              className="login-input"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete={modo === 'login' ? 'current-password' : 'new-password'}
              required
              minLength={6}
            />

            <button type="submit" className="login-submit" disabled={enviando}>
              {enviando ? 'Enviando...' : modo === 'login' ? 'Ingresar' : 'Crear cuenta'}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}
