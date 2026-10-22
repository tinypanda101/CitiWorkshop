// The admin's popups for accounts: Add / Edit account, and Reset a password.
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import PasswordResetDialog from './PasswordResetDialog'
import UserDialog from './UserDialog'
import { renderWith } from '../test/renderWith'
import { api, ApiError } from '../services/api'

vi.mock('../services/api', async (original) => ({ ...(await original()), api: vi.fn() }))

const CATEGORIES = [{ id: 3, name: 'Plumbing', type: 'facility' }, { id: 6, name: 'Network / Wi-Fi', type: 'technology' }]

beforeEach(() => {
  api.mockImplementation((service, path) => (path === '/categories' ? Promise.resolve(CATEGORIES) : Promise.resolve({})))
})

async function choose(user, label, option) {
  await user.click(screen.getByRole('combobox', { name: label }))
  await user.click(await screen.findByRole('option', { name: option }))
}

describe('UserDialog', () => {
  it('asks for a sub-specialty and phone only for engineers', async () => {
    const user = userEvent.setup()
    renderWith(<UserDialog onSaved={vi.fn()} onClose={vi.fn()} />)
    expect(screen.queryByRole('combobox', { name: 'Sub-specialty' })).not.toBeInTheDocument()
    await choose(user, 'Role', 'Engineer')
    expect(screen.getByRole('combobox', { name: 'Sub-specialty' })).toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: 'Phone' })).toBeInTheDocument()
  })

  it('sends a new engineer with their sub-specialty and phone', async () => {
    const user = userEvent.setup()
    const onSaved = vi.fn()
    renderWith(<UserDialog onSaved={onSaved} onClose={vi.fn()} />)
    await user.type(screen.getByRole('textbox', { name: 'Email' }), 'pat@acme.inc')
    await user.type(screen.getByRole('textbox', { name: 'Full name' }), 'Pat Jones')
    await user.type(screen.getByLabelText(/^Starting password/), 'password1')
    await choose(user, 'Role', 'Engineer')
    await choose(user, 'Sub-specialty', 'Plumbing')
    await user.type(screen.getByRole('textbox', { name: 'Phone' }), '555 201 1234')
    await user.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(onSaved).toHaveBeenCalled())
    const [, path, { method, body }] = api.mock.calls.find(([, , options]) => options?.method)
    expect([path, method]).toEqual(['/', 'POST'])
    expect(body).toMatchObject({ email: 'pat@acme.inc', role: 'engineer', category_id: 3, phone: '+15552011234' })
  })

  it('warns before deactivating an engineer, and says their sub-specialty is kept', async () => {
    const user = userEvent.setup()
    const account = { id: 9, email: 'pat@acme.inc', full_name: 'Pat Jones', role: 'engineer', is_active: true, category_id: 3, phone: null }
    renderWith(<UserDialog account={account} onSaved={vi.fn()} onClose={vi.fn()} />)
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    await user.click(screen.getByRole('switch'))
    expect(screen.getByRole('alert')).toHaveTextContent('Their sub-specialty and phone are kept')
  })

  it('editing never sends the email or a password', async () => {
    const user = userEvent.setup()
    const account = { id: 9, email: 'mary@acme.inc', full_name: 'Mary Smith', role: 'employee', is_active: true }
    renderWith(<UserDialog account={account} onSaved={vi.fn()} onClose={vi.fn()} />)
    await user.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(api).toHaveBeenCalledWith('users', '/9', expect.anything()))
    const { body } = api.mock.calls.find(([, path]) => path === '/9')[2]
    expect(body).not.toHaveProperty('email')
    expect(body).not.toHaveProperty('password')
    expect(body.category_id).toBeNull()
  })
})

describe('PasswordResetDialog', () => {
  async function fill(user, confirm = 'newpass123') {
    await user.type(screen.getByRole('textbox', { name: 'Email' }), 'mary@acme.inc')
    await user.type(screen.getByLabelText(/^New password/), 'newpass123')
    await user.type(screen.getByLabelText(/^Confirm new password/), confirm)
    await user.click(screen.getByRole('button', { name: 'Reset password' }))
  }

  it('checks the two passwords match first', async () => {
    const user = userEvent.setup()
    renderWith(<PasswordResetDialog onReset={vi.fn()} onClose={vi.fn()} />)
    await fill(user, 'different1')
    expect(screen.getByText("Doesn't match the new password")).toBeInTheDocument()
    expect(api).not.toHaveBeenCalled()
  })

  it('shows "No account uses this email" under the email box', async () => {
    api.mockRejectedValue(new ApiError(400, 'not_found', 'No account uses this email', { email: 'No account uses this email' }))
    const user = userEvent.setup()
    const onReset = vi.fn()
    renderWith(<PasswordResetDialog onReset={onReset} onClose={vi.fn()} />)
    await fill(user)
    expect(await screen.findByText('No account uses this email')).toBeInTheDocument()
    expect(onReset).not.toHaveBeenCalled()
  })

  it('reports whose password it reset', async () => {
    api.mockResolvedValue({ full_name: 'Mary Smith', email: 'mary@acme.inc' })
    const user = userEvent.setup()
    const onReset = vi.fn()
    renderWith(<PasswordResetDialog onReset={onReset} onClose={vi.fn()} />)
    await fill(user)
    await waitFor(() => expect(onReset).toHaveBeenCalledWith({ full_name: 'Mary Smith', email: 'mary@acme.inc' }))
    expect(api).toHaveBeenCalledWith('users', '/password-reset', { method: 'PUT', body: { email: 'mary@acme.inc', new_password: 'newpass123' } })
  })
})
