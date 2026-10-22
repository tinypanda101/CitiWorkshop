// The top bar: which menu links each role sees, and the dark mode switch.
import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import Layout from './Layout'
import { renderWith } from '../test/renderWith'

const auth = vi.hoisted(() => ({ user: null, logout: () => {} }))
vi.mock('../services/AuthContext', () => ({ useAuth: () => auth }))
vi.mock('../services/api', async (original) => ({
  ...(await original()), api: vi.fn().mockResolvedValue({ availability: 'available' }),
}))

const links = () => screen.getAllByRole('link').map((link) => link.textContent)

describe('Layout', () => {
  it.each([
    ['employee', ['Dashboard', 'My account']],
    ['engineer', ['Dashboard', 'My account']],
    ['admin', ['Dashboard', 'Tickets', 'Facilities', 'Users', 'My account']],
  ])('a %s sees %j', (role, expected) => {
    auth.user = { full_name: 'Mary Smith', role }
    renderWith(<Layout>page</Layout>)
    expect(links()).toEqual(expected)
  })

  it('shows the app name, your name and your role', () => {
    auth.user = { full_name: 'Mary Smith', role: 'admin' }
    renderWith(<Layout>page</Layout>)
    expect(screen.getByText('ACME Ticketing')).toBeInTheDocument()
    expect(screen.getByText('Mary Smith')).toBeInTheDocument()
    expect(screen.getByText('Facility Admin')).toBeInTheDocument()
  })

  it('engineers get the availability picker in the top bar', async () => {
    auth.user = { full_name: 'Pat Jones', role: 'engineer' }
    renderWith(<Layout>page</Layout>)
    expect(await screen.findByRole('combobox')).toHaveTextContent('Available')
  })

  it('the moon button switches to dark mode and is remembered', async () => {
    auth.user = { full_name: 'Mary Smith', role: 'employee' }
    const user = userEvent.setup()
    renderWith(<Layout>page</Layout>)
    await user.click(screen.getByRole('button', { name: 'Switch to dark mode' }))
    expect(screen.getByRole('button', { name: 'Switch to light mode' })).toBeInTheDocument()
    expect(localStorage.getItem('colorMode')).toBe('dark')
  })
})
