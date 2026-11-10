import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../AuthContext'

type Mode = 'login' | 'register'

function LoginPage() {
  const { username: current, login, register, logout } = useAuth()
  const navigate = useNavigate()

  const [mode, setMode] = useState<Mode>('login')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)

   if (current) {
    return (
      <section className="routes-section">
        <div className="auth-card">
          <p className="eyebrow">ACCOUNT</p>
          <h2>{current}</h2>
          <p>You are logged in.</p>
          <div className="ticket-actions">
            <Link to="/tickets" className="ticket-btn">My tickets</Link>
            <button
              type="button"
              className="ticket-btn ticket-btn-danger"
              onClick={logout}
            >
              Log out
            </button>
          </div>
        </div>
      </section>
    )
  }

  const switchMode = (next: Mode) => {
    setMode(next)
    setMessage('')
    setPassword('')
    setConfirm('')
  }

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault()
    const name = username.trim().toLowerCase()

    if (!/^[a-z0-9_]{3,20}$/.test(name)) {
      setMessage('Username must be 3-20 characters: letters, numbers or _ only.')
      return
    }
    if (password.length < 6) {
      setMessage('Password must be at least 6 characters.')
      return
    }
    if (mode === 'register' && password !== confirm) {
      setMessage('The two passwords do not match.')
      return
    }

    setBusy(true)
    setMessage('')
    const error =
      mode === 'login'
        ? await login(name, password)
        : await register(name, password)
    setBusy(false)

    if (error) setMessage(error)
    else navigate('/')
  }

  return (
    <section className="routes-section">
      <div className="auth-card">
        <p className="eyebrow">ACCOUNT</p>
        <h2>{mode === 'login' ? 'Log in' : 'Create account'}</h2>

        <div className="auth-tabs">
          <button
            type="button"
            className={mode === 'login' ? 'auth-tab active' : 'auth-tab'}
            onClick={() => switchMode('login')}
          >
            Log in
          </button>
          <button
            type="button"
            className={mode === 'register' ? 'auth-tab active' : 'auth-tab'}
            onClick={() => switchMode('register')}
          >
            Create account
          </button>
        </div>

        <form className="booking-form" onSubmit={handleSubmit}>
          <label>
            Username
            <input
              value={username}
              autoComplete="username"
              autoCapitalize="none"
              onChange={(e) => setUsername(e.target.value)}
            />
          </label>

          <label>
            Password
            <input
              type={showPassword ? 'text' : 'password'}
              value={password}
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
              onChange={(e) => setPassword(e.target.value)}
            />
          </label>

          {mode === 'register' && (
            <label>
              Confirm password
              <input
                type={showPassword ? 'text' : 'password'}
                value={confirm}
                autoComplete="new-password"
                onChange={(e) => setConfirm(e.target.value)}
              />
            </label>
          )}

          <label className="auth-show">
            <input
              type="checkbox"
              checked={showPassword}
              onChange={(e) => setShowPassword(e.target.checked)}
            />
            Show password
          </label>

          {message && <p className="error">{message}</p>}

          <button type="submit" className="pay-method" disabled={busy}>
            {busy ? 'Please wait…' : mode === 'login' ? 'Log in' : 'Create account'}
          </button>

          {mode === 'register' && (
            <p className="notice">
              Remember your password. Without an email or phone number, we
              can't reset it for you.
            </p>
          )}
        </form>
      </div>
    </section>
  )
}

export default LoginPage