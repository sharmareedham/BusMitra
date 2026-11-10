import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react'
import { API_URL } from './shared'

const TOKEN_KEY = 'busmitra_token'
const USER_KEY = 'busmitra_username'

function readStored(key: string): string | null {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

function writeStored(key: string, value: string | null) {
  try {
    if (value === null) localStorage.removeItem(key)
    else localStorage.setItem(key, value)
  } catch {
    // storage blocked: login works until the page is closed
  }
}

type AuthValue = {
  username: string | null
  token: string | null
  // these return an error message, or null when it worked
  login: (username: string, password: string) => Promise<string | null>
  register: (username: string, password: string) => Promise<string | null>
  logout: () => void
}

const AuthContext = createContext<AuthValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(() => readStored(TOKEN_KEY))
  const [username, setUsername] = useState<string | null>(() =>
    readStored(USER_KEY)
  )

  // on startup, check that the saved login is still valid
  useEffect(() => {
    if (!token) return
    fetch(`${API_URL}/api/auth/me`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((response) => {
        if (response.status === 401) {
          writeStored(TOKEN_KEY, null)
          writeStored(USER_KEY, null)
          setToken(null)
          setUsername(null)
        }
      })
      .catch(() => {})
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const send = async (
    path: 'login' | 'register',
    user: string,
    password: string
  ): Promise<string | null> => {
    try {
      const response = await fetch(`${API_URL}/api/auth/${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: user, password }),
      })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) {
        return typeof data.detail === 'string'
          ? data.detail
          : 'Something went wrong. Please try again.'
      }
      writeStored(TOKEN_KEY, data.token)
      writeStored(USER_KEY, data.username)
      setToken(data.token)
      setUsername(data.username)
      return null
    } catch {
      return 'Could not connect to the backend. Make sure it is running.'
    }
  }

  const logout = () => {
    if (token) {
      fetch(`${API_URL}/api/auth/logout`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      }).catch(() => {})
    }
    writeStored(TOKEN_KEY, null)
    writeStored(USER_KEY, null)
    setToken(null)
    setUsername(null)
  }

  return (
    <AuthContext.Provider
      value={{
        username,
        token,
        login: (u, p) => send('login', u, p),
        register: (u, p) => send('register', u, p),
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const value = useContext(AuthContext)
  if (!value) throw new Error('useAuth must be used inside AuthProvider')
  return value
}