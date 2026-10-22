// Remembers who is logged in. Any component can call useAuth() to get
// { user, login, register, logout }. The token is kept in localStorage so a page
// refresh keeps you signed in until it expires (8 hours).

import { createContext, useContext, useEffect, useState } from 'react'
import { api, getToken, setToken, warmUp } from './api'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  // True until we know whether a saved token is still valid.
  const [loading, setLoading] = useState(() => Boolean(getToken()))

  useEffect(() => {
    warmUp() // start the backend services while the first page loads (see api.js)
    if (!getToken()) return
    api('auth', '/me')
      .then(setUser)
      .catch(() => setToken(null))
      .finally(() => setLoading(false))
  }, [])

  async function login(email, password) {
    const result = await api('auth', '/login', { method: 'POST', body: { email, password } })
    setToken(result.token)
    setUser(result.user)
  }

  async function register(fullName, email, password) {
    const result = await api('auth', '/register', {
      method: 'POST',
      body: { full_name: fullName, email, password },
    })
    setToken(result.token)
    setUser(result.user)
  }

  function logout() {
    setToken(null)
    setUser(null)
  }

  return (
    <AuthContext.Provider value={{ user, loading, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  )
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth() {
  return useContext(AuthContext)
}
