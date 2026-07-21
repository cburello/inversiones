import { useState } from 'react'
import { NavLink, Outlet } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import './AppLayout.css'

const activo = ({ isActive }) => (isActive ? 'activo' : '')

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
        <button className="app-nav-salir" onClick={signOut}>
          Cerrar sesión ({user?.email})
        </button>
      </header>

      <main className="app-main">
        <Outlet />
      </main>

      <nav className="bottom-nav">
        <NavLink to="/" end className={activo}>
          Dashboard
        </NavLink>
        <NavLink to="/operaciones" className={activo}>
          Operaciones
        </NavLink>
        <NavLink to="/caja" className={activo}>
          Caja
        </NavLink>
        <button className={masAbierto ? 'activo' : ''} onClick={() => setMasAbierto((v) => !v)}>
          Más
        </button>
      </nav>

      {masAbierto && (
        <div className="mas-fondo" onClick={() => setMasAbierto(false)}>
          <div className="mas-hoja" onClick={(e) => e.stopPropagation()}>
            <NavLink to="/cobros" onClick={() => setMasAbierto(false)}>
              Cobros
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
