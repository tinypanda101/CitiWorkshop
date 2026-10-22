// The ticket page: what each role can do, and deleting.
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import TicketDetailPage from './TicketDetailPage'
import { renderWith } from '../test/renderWith'
import { api } from '../services/api'

const auth = vi.hoisted(() => ({ user: null, logout: () => {} }))
vi.mock('../services/AuthContext', () => ({ useAuth: () => auth }))
vi.mock('../services/api', async (original) => ({ ...(await original()), api: vi.fn() }))

const TICKET = { id: 42, number: 'TKT-1042', title: 'Leaking tap', description: 'Drips all day', status: 'blocked',
  priority: 'medium', category_name: 'Plumbing', building_name: 'Head Office', floor_name: 'Floor 1', seat_code: 'HQ-1-01',
  reporter_id: 9, reporter_name: 'Mary Smith', reporter_email: 'mary@acme.inc', assignee_id: 5, assignee_name: 'Pat Jones',
  assigned_at: '2026-10-20T10:00:00Z', created_at: '2026-10-20T09:00:00Z', due_at: '2026-10-23T09:00:00Z',
  updated_at: '2026-10-20T11:00:00Z', blocked_reason: 'Waiting for a part', escalation_status: 'none' }

beforeEach(() => {
  api.mockImplementation((service, path, options) => {
    if (path === '/42' && !options) return Promise.resolve(TICKET)
    if (path === '/42/notes') return Promise.resolve([])
    return Promise.resolve(null)
  })
})

function open(user) {
  auth.user = user
  return renderWith(
    <Routes>
      <Route path="/tickets/:id" element={<TicketDetailPage />} />
      <Route path="/tickets" element={<p>The tickets list</p>} />
    </Routes>, { route: '/tickets/42' })
}

describe('TicketDetailPage', () => {
  it('shows the details, contact and why it is blocked, and counts as seen', async () => {
    open({ id: 5, role: 'engineer', full_name: 'Pat Jones' })
    expect(await screen.findByRole('heading', { name: 'Leaking tap' })).toBeInTheDocument()
    expect(screen.getByText('Mary Smith · mary@acme.inc')).toBeInTheDocument()
    expect(screen.getByText('Waiting for a part')).toBeInTheDocument()
    expect(screen.getByText('Deadline')).toBeInTheDocument()
    expect(api).toHaveBeenCalledWith('tickets', '/42/seen', { method: 'POST' })
  })

  it('engineers get no Edit, Assign or Delete, and go back to their dashboard', async () => {
    open({ id: 5, role: 'engineer', full_name: 'Pat Jones' })
    await screen.findByRole('heading', { name: 'Leaking tap' })
    for (const name of ['Edit', 'Assign']) expect(screen.queryByRole('button', { name })).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: '← Back to dashboard' })).toBeInTheDocument()
  })

  it('an admin deletes it after confirming, and goes back to the list', async () => {
    const user = userEvent.setup()
    open({ id: 1, role: 'admin', full_name: 'Ada Admin' })
    await user.click(await screen.findByRole('button', { name: 'Delete' }))
    expect(screen.getByRole('dialog', { name: 'Delete TKT-1042?' })).toBeInTheDocument()
    const buttons = screen.getAllByRole('button', { name: 'Delete' })
    await user.click(buttons.at(-1)) // the one in the popup
    await waitFor(() => expect(screen.getByText('The tickets list')).toBeInTheDocument())
    expect(api).toHaveBeenCalledWith('tickets', '/42', { method: 'DELETE' })
  })

  it('shows the error when the ticket can\'t be found', async () => {
    api.mockImplementation((service, path) => (path === '/42' ? Promise.reject(new Error('Ticket not found')) : Promise.resolve(null)))
    open({ id: 1, role: 'admin', full_name: 'Ada Admin' })
    expect(await screen.findByText('Ticket not found')).toBeInTheDocument()
  })
})
