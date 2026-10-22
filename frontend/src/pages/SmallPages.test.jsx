// My account, the Users page and the engineer dashboard.
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import AccountPage from './AccountPage'
import UsersPage from './UsersPage'
import EngineerDashboard from '../components/dashboard/EngineerDashboard'
import { renderWith } from '../test/renderWith'
import { api, ApiError } from '../services/api'

const auth = vi.hoisted(() => ({ user: { id: 1, role: 'admin', full_name: 'Ada Admin', email: 'ada@acme.inc' }, logout: () => {} }))
vi.mock('../services/AuthContext', () => ({ useAuth: () => auth }))
vi.mock('../services/api', async (original) => ({ ...(await original()), api: vi.fn() }))

beforeEach(() => api.mockResolvedValue({}))

describe('AccountPage', () => {
  async function change(user, { current = 'password1', next = 'newpass123', confirm = 'newpass123' } = {}) {
    await user.type(screen.getByLabelText(/^Current password/), current)
    await user.type(screen.getByLabelText(/^New password/), next)
    await user.type(screen.getByLabelText(/^Confirm new password/), confirm)
    await user.click(screen.getByRole('button', { name: 'Change password' }))
  }

  it('checks the new password is typed the same twice', async () => {
    const user = userEvent.setup()
    renderWith(<AccountPage />)
    await change(user, { confirm: 'different1' })
    expect(screen.getByText("Doesn't match the new password")).toBeInTheDocument()
    expect(api).not.toHaveBeenCalled()
  })

  it('a wrong current password shows under that box', async () => {
    api.mockRejectedValueOnce(new ApiError(400, 'wrong_password', 'Current password is wrong', { current_password: 'Current password is wrong' }))
    const user = userEvent.setup()
    renderWith(<AccountPage />)
    await change(user)
    expect(await screen.findByText('Current password is wrong')).toBeInTheDocument()
  })

  it('says when it worked and empties the boxes', async () => {
    const user = userEvent.setup()
    renderWith(<AccountPage />)
    await change(user)
    expect(await screen.findByText('Password changed')).toBeInTheDocument()
    expect(screen.getByLabelText(/^New password/)).toHaveValue('')
  })
})

describe('UsersPage', () => {
  beforeEach(() => {
    api.mockImplementation((service, path) => {
      if (path === '/engineers') return Promise.resolve([{ id: 5, full_name: 'Pat Jones', category_name: 'Plumbing',
        specialty: 'facility', availability: 'busy', open_tickets: 2, phone: '+15552011234' }])
      if (path === '/categories') return Promise.resolve([])
      return Promise.resolve({ accounts: [{ id: 9, full_name: 'Mary Smith', email: 'mary@acme.inc', role: 'employee', is_active: false }], total: 1 })
    })
  })

  it('lists accounts 25 at a time, and searches after typing stops', async () => {
    const user = userEvent.setup()
    renderWith(<UsersPage />)
    expect(await screen.findByText('Mary Smith')).toBeInTheDocument()
    expect(screen.getByText('Deactivated')).toBeInTheDocument()
    expect(api).toHaveBeenCalledWith('users', '/?page=1&per_page=25')
    await user.type(screen.getByRole('textbox', { name: 'Search' }), 'mary')
    await waitFor(() => expect(api).toHaveBeenCalledWith('users', '/?page=1&per_page=25&q=mary'))
  })

  it('the Engineers tab uses the engineers table with phones', async () => {
    const user = userEvent.setup()
    renderWith(<UsersPage />)
    await user.click(screen.getByRole('tab', { name: 'Engineers' }))
    expect(await screen.findByText('Pat Jones')).toBeInTheDocument()
    expect(screen.getByText('+1 555 201 1234')).toBeInTheDocument()
  })

  it('Reset a password and + Add account open their popups', async () => {
    const user = userEvent.setup()
    renderWith(<UsersPage />)
    await user.click(screen.getByRole('button', { name: 'Reset a password' }))
    expect(screen.getByRole('dialog', { name: 'Reset a password' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Cancel' }))
    await user.click(screen.getByRole('button', { name: '+ Add account' }))
    expect(await screen.findByRole('dialog', { name: 'Add account' })).toBeInTheDocument()
  })

  it('clicking an account opens it for editing', async () => {
    const user = userEvent.setup()
    renderWith(<UsersPage />)
    await user.click(await screen.findByText('Mary Smith'))
    expect(await screen.findByRole('dialog', { name: 'Edit Mary Smith' })).toBeInTheDocument()
  })
})

describe('EngineerDashboard', () => {
  const mine = (id, title, status) => ({ id, number: `TKT-${1000 + id}`, title, status, priority: 'medium', location: 'Head Office',
    category_name: 'Plumbing', category_type: 'facility', created_at: '2026-10-20T09:00:00Z', due_at: '2099-10-23T09:00:00Z',
    updated_at: '2026-10-20T09:00:00Z', news: null })

  it('shows the assigned tickets and the counts, with Submitted Tickets on the other tab', async () => {
    api.mockResolvedValue({
      role: 'engineer', by_status: { open: 0, assigned: 1, in_progress: 1, blocked: 0, resolved: 0 },
      assigned: [mine(1, 'Leaking tap', 'assigned'), mine(2, 'Blocked drain', 'in_progress')],
      submitted: { role: 'employee', by_status: { open: 0, assigned: 0, in_progress: 0, blocked: 0, resolved: 0, closed: 1 },
        tickets: [mine(3, 'My broken chair', 'closed')] },
    })
    const user = userEvent.setup()
    renderWith(<EngineerDashboard user={{ id: 5, role: 'engineer' }} />)
    expect(await screen.findByText('Leaking tap')).toBeInTheDocument()
    expect(screen.getByText('Total').previousSibling).toHaveTextContent('2')
    await user.click(screen.getByRole('tab', { name: 'Submitted Tickets' }))
    expect(screen.getByText('My broken chair')).toBeInTheDocument()
  })
})
