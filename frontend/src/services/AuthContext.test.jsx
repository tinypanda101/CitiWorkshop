// Who is signed in: logging in keeps the token, a saved token is checked on start, logging out forgets it.
import { useEffect } from 'react'
import { act, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AuthProvider, useAuth } from './AuthContext'
import { api, getToken, setToken } from './api'

vi.mock('./api', async (original) => ({ ...(await original()), api: vi.fn(), warmUp: vi.fn() }))

// Shows who is signed in, and hands the test what useAuth() returned (as `latest.auth`).
const latest = {}
function Probe() {
  const auth = useAuth()
  useEffect(() => { latest.auth = auth })
  return <p>{auth.loading ? 'loading' : auth.user?.full_name || 'signed out'}</p>
}

beforeEach(() => api.mockReset())

describe('AuthProvider', () => {
  it('logging in saves the token and the user', async () => {
    api.mockResolvedValue({ token: 'tok123', user: { full_name: 'Mary Smith', role: 'employee' } })
    render(<AuthProvider><Probe /></AuthProvider>)
    expect(screen.getByText('signed out')).toBeInTheDocument()
    await act(() => latest.auth.login('mary@acme.inc', 'password1'))
    expect(screen.getByText('Mary Smith')).toBeInTheDocument()
    expect(getToken()).toBe('tok123')
    expect(api).toHaveBeenCalledWith('auth', '/login', { method: 'POST', body: { email: 'mary@acme.inc', password: 'password1' } })
  })

  it('a saved token is checked with the API when the app opens', async () => {
    setToken('saved')
    api.mockResolvedValue({ full_name: 'Pat Jones', role: 'engineer' })
    render(<AuthProvider><Probe /></AuthProvider>)
    expect(screen.getByText('loading')).toBeInTheDocument()
    expect(await screen.findByText('Pat Jones')).toBeInTheDocument()
    expect(api).toHaveBeenCalledWith('auth', '/me')
  })

  it('a saved token the API refuses is forgotten', async () => {
    setToken('expired')
    api.mockRejectedValueOnce(new Error('Please log in')) // ...Once: see TicketWorkflow.test.jsx
    render(<AuthProvider><Probe /></AuthProvider>)
    expect(await screen.findByText('signed out')).toBeInTheDocument()
    expect(getToken()).toBeNull()
  })

  it('registering signs you in, and logging out forgets you', async () => {
    api.mockResolvedValue({ token: 'new', user: { full_name: 'Eve Smith', role: 'employee' } })
    render(<AuthProvider><Probe /></AuthProvider>)
    await act(() => latest.auth.register('Eve Smith', 'eve@acme.inc', 'password1'))
    expect(screen.getByText('Eve Smith')).toBeInTheDocument()
    act(() => latest.auth.logout())
    await waitFor(() => expect(screen.getByText('signed out')).toBeInTheDocument())
    expect(getToken()).toBeNull()
  })
})
