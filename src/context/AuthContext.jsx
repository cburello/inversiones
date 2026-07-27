import { createContext, useContext, useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'

const AuthContext = createContext(null)

const INACTIVIDAD_MS = 3 * 60 * 1000
const EVENTOS_ACTIVIDAD = ['mousedown', 'keydown', 'scroll', 'touchstart']

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      setLoading(false)
    })

    const { data: listener } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession)
    })

    return () => listener.subscription.unsubscribe()
  }, [])

  // Desloguea automáticamente tras un rato sin actividad del usuario (sin
  // clicks, teclas, scroll ni touch). Se basa en la hora real (Date.now()) en
  // vez de confiar solo en que el setTimeout siga corriendo: en el celular,
  // el navegador suspende los timers cuando se apaga la pantalla o se cambia
  // de app, así que un setTimeout solo nunca llega a dispararse mientras está
  // en segundo plano. El chequeo en "visibilitychange" recalcula el tiempo
  // real transcurrido apenas volvés a la app, sin importar cuánto estuvo pausado.
  useEffect(() => {
    if (!session) return

    let ultimaActividad = Date.now()
    let intervalId

    function registrarActividad() {
      ultimaActividad = Date.now()
    }

    function chequearInactividad() {
      if (Date.now() - ultimaActividad >= INACTIVIDAD_MS) supabase.auth.signOut()
    }

    function alCambiarVisibilidad() {
      if (document.visibilityState === 'visible') chequearInactividad()
    }

    EVENTOS_ACTIVIDAD.forEach((evento) => window.addEventListener(evento, registrarActividad))
    document.addEventListener('visibilitychange', alCambiarVisibilidad)
    intervalId = setInterval(chequearInactividad, 10 * 1000)

    return () => {
      clearInterval(intervalId)
      EVENTOS_ACTIVIDAD.forEach((evento) => window.removeEventListener(evento, registrarActividad))
      document.removeEventListener('visibilitychange', alCambiarVisibilidad)
    }
  }, [session])

  const value = {
    session,
    user: session?.user ?? null,
    loading,
    signIn: (email, password) =>
      supabase.auth.signInWithPassword({ email, password }),
    signUp: (email, password) =>
      supabase.auth.signUp({ email, password }),
    signOut: () => supabase.auth.signOut(),
    // Envía el mail con el link para elegir una contraseña nueva (usuario deslogueado).
    enviarRecuperacion: (email) =>
      supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/restablecer-contrasena`,
      }),
    // Cambia la contraseña de la sesión actual: sirve tanto para el usuario ya
    // logueado (cambiar contraseña desde la app) como para la sesión temporal
    // que Supabase crea al entrar desde el link de recuperación.
    cambiarPassword: (password) => supabase.auth.updateUser({ password }),
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth debe usarse dentro de AuthProvider')
  }
  return context
}
