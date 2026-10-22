// Page access by role: signed-out people go to Log in, and a page for another role sends
// you back to your dashboard. (Cypress checks the same thing in a real browser: access.cy.js.)
import { screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import App from './App'
import { renderWith } from './test/renderWith'

const auth = vi.hoisted(() => ({ user: null, loading: false, logout: () => {} }))
vi.mock('./services/AuthContext', () => ({ useAuth: () => auth }))
vi.mock('./services/api', async (original) => ({
  ...(await original()),
  api: vi.fn().mockResolvedValue({ role: 'employee', by_status: { open: 0, assigned: 0, in_progress: 0, blocked: 0, resolved: 0, closed: 0 }, tickets: [] }),
}))

describe('App routes', () => {
  it('signed out: every page goes to Log in', async () => {
    auth.user = null
    renderWith(<App />, { route: '/tickets' })
    expect(await screen.findByRole('heading', { name: 'Log in' })).toBeInTheDocument()
  })

  it.each(['/users', '/facilities', '/tickets', '/reports/overdue', '/tickets/5'])(
    'an employee opening %s is sent to their dashboard', async (page) => {
      auth.user = { id: 9, role: 'employee', full_name: 'Mary Smith' }
      renderWith(<App />, { route: page })
      expect(await screen.findByRole('heading', { name: 'My tickets' })).toBeInTheDocument()
    })

  it('an unknown address goes to the dashboard', async () => {
    auth.user = { id: 9, role: 'employee', full_name: 'Mary Smith' }
    renderWith(<App />, { route: '/no-such-page' })
    expect(await screen.findByRole('heading', { name: 'My tickets' })).toBeInTheDocument()
  })
})
