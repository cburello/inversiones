import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider } from './context/AuthContext'
import { ProtectedRoute } from './components/ProtectedRoute'
import { AppLayout } from './components/AppLayout'
import { Login } from './pages/Login'
import { OlvideContrasena } from './pages/OlvideContrasena'
import { RestablecerContrasena } from './pages/RestablecerContrasena'
import { CambiarContrasena } from './pages/CambiarContrasena'
import { Dashboard } from './pages/Dashboard'
import { Operaciones } from './pages/Operaciones'
import { Cobros } from './pages/Cobros'
import { Caja } from './pages/Caja'
import { EspecieDetalle } from './pages/EspecieDetalle'

function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/olvide-contrasena" element={<OlvideContrasena />} />
          <Route path="/restablecer-contrasena" element={<RestablecerContrasena />} />
          <Route
            element={
              <ProtectedRoute>
                <AppLayout />
              </ProtectedRoute>
            }
          >
            <Route path="/" element={<Dashboard />} />
            <Route path="/operaciones" element={<Operaciones />} />
            <Route path="/cobros" element={<Cobros />} />
            <Route path="/caja" element={<Caja />} />
            <Route path="/especies/:id" element={<EspecieDetalle />} />
            <Route path="/cambiar-contrasena" element={<CambiarContrasena />} />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  )
}

export default App
