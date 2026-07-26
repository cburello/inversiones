import { useState } from 'react'
import './CampoPassword.css'

// Input de contraseña con botón para mostrar/ocultar el texto, reutilizado en
// login, alta de cuenta, cambio y recuperación de contraseña.
export function CampoPassword({ id, value, onChange, placeholder = '••••••••', autoComplete, required, minLength, className = '' }) {
  const [visible, setVisible] = useState(false)

  return (
    <div className="campo-password">
      <input
        id={id}
        type={visible ? 'text' : 'password'}
        className={className}
        placeholder={placeholder}
        value={value}
        onChange={onChange}
        autoComplete={autoComplete}
        required={required}
        minLength={minLength}
      />
      <button type="button" className="campo-password-toggle" onClick={() => setVisible((v) => !v)} tabIndex={-1}>
        {visible ? 'Ocultar' : 'Mostrar'}
      </button>
    </div>
  )
}
