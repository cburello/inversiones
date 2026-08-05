import { useState } from 'react'
import { NavLink, Outlet } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import './AppLayout.css'

const activo = ({ isActive }) => (isActive ? 'activo' : '')

const ICONOS = {
  dashboard: (
    <path d="M3 9.5 12 3l9 6.5V20a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1z" />
  ),
  operaciones: (
    <path d="M8 3 4 7l4 4M4 7h13a3 3 0 0 1 3 3v1M16 21l4-4-4-4M20 17H7a3 3 0 0 1-3-3v-1" />
  ),
  caja: (
    <path d="M3 8h15a3 3 0 0 1 3 3v7a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1zM3 8V6a1 1 0 0 1 1-1h11M16 14h3" />
  ),
  mas: <path d="M5 12h.01M12 12h.01M19 12h.01" />,
}

function IconoNav({ nombre }) {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      {ICONOS[nombre]}
    </svg>
  )
}

export function AppLayout() {
  const { user, signOut } = useAuth()
  const [masAbierto, setMasAbierto] = useState(false)

  return (
    <div className="app-layout">
      <header className="app-nav">
        <nav>
          <NavLink to="/" end className={activo}>
            Dashboard
          </NavLink>
          <NavLink to="/operaciones" className={activo}>
            Operaciones
          </NavLink>
          <NavLink to="/cobros" className={activo}>
            Cobros
          </NavLink>
          <NavLink to="/caja" className={activo}>
            Caja
          </NavLink>
        </nav>
        <div className="app-nav-usuario">
          <NavLink to="/cambiar-contrasena" className={activo}>
            Cambiar contraseña
          </NavLink>
          <button className="app-nav-salir" onClick={signOut}>
            Cerrar sesión ({user?.email})
          </button>
        </div>
      </header>

      <main className="app-main">
        <Outlet />
      </main>

      <nav className="bottom-nav">
        <NavLink to="/" end className={activo} aria-label="Dashboard">
          <IconoNav nombre="dashboard" />
          <span>Dashboard</span>
        </NavLink>
        <NavLink to="/operaciones" className={activo} aria-label="Operaciones">
          <IconoNav nombre="operaciones" />
          <span>Operaciones</span>
        </NavLink>
        <NavLink to="/caja" className={activo} aria-label="Caja">
          <IconoNav nombre="caja" />
          <span>Caja</span>
        </NavLink>
        <button className={masAbierto ? 'activo' : ''} onClick={() => setMasAbierto((v) => !v)} aria-label="Más">
          <IconoNav nombre="mas" />
          <span>Más</span>
        </button>
      </nav>

      {masAbierto && (
        <div className="mas-fondo" onClick={() => setMasAbierto(false)}>
          <div className="mas-hoja" onClick={(e) => e.stopPropagation()}>
            <NavLink to="/cobros" onClick={() => setMasAbierto(false)}>
              Cobros
            </NavLink>
            <NavLink to="/cambiar-contrasena" onClick={() => setMasAbierto(false)}>
              Cambiar contraseña
            </NavLink>
            <button
              onClick={() => {
                setMasAbierto(false)
                signOut()
              }}
            >
              Cerrar sesión
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
