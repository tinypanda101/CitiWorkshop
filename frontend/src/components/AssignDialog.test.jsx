// The admin's Assign popup: matching engineers first, assigning by hand, and Auto-assign.
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import AssignDialog from './AssignDialog'
import { renderWith } from '../test/renderWith'
import { api, ApiError } from '../services/api'

vi.mock('../services/api', async (original) => ({ ...(await original()), api: vi.fn() }))

const ENGINEERS = [
  { id: 1, full_name: 'Busy Plumber', category_name: 'Plumbing', availability: 'available', open_tickets: 4 },
  { id: 2, full_name: 'Cleo Clean', category_name: 'Cleaning', availability: 'available', open_tickets: 0 },
  { id: 3, full_name: 'Free Plumber', category_name: 'Plumbing', availability: 'busy', open_tickets: 1 },
]
const TICKET = { id: 42, number: 'TKT-1042', category_name: 'Plumbing', assignee_id: null }

function answer(other = () => Promise.resolve({ ...TICKET, assignee_name: 'Free Plumber' })) {
  api.mockImplementation((service, path, options) => (path === '/engineers' ? Promise.resolve(ENGINEERS) : other(path, options)))
}

beforeEach(() => answer())

describe('AssignDialog', () => {
  it('lists matching engineers first, least busy first, with what they are doing', async () => {
    const user = userEvent.setup()
    renderWith(<AssignDialog ticket={TICKET} onSaved={vi.fn()} onClose={vi.fn()} />)
    await waitFor(() => expect(api).toHaveBeenCalledWith('users', '/engineers'))
    await user.click(screen.getByRole('combobox', { name: 'Engineer' }))
    const items = [...(await screen.findByRole('listbox')).children].map((li) => li.textContent)
    expect(items.join(' | ')).toMatch(/Not assigned \| Matches this ticket \| Free Plumber.*\| Busy Plumber.*\| Other engineers \| Cleo Clean/)
    expect(screen.getByRole('option', { name: /Free Plumber/ })).toHaveTextContent('Plumbing · Busy · 1 unfinished')
  })

  it('assigns the engineer picked', async () => {
    const user = userEvent.setup()
    const onSaved = vi.fn()
    renderWith(<AssignDialog ticket={TICKET} onSaved={onSaved} onClose={vi.fn()} />)
    await user.click(screen.getByRole('combobox', { name: 'Engineer' }))
    await user.click(await screen.findByRole('option', { name: /Cleo Clean/ }))
    await user.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(onSaved).toHaveBeenCalled())
    expect(api).toHaveBeenCalledWith('tickets', '/42/assignee', { method: 'PUT', body: { assignee_id: 2 } })
  })

  it('Auto-assign asks the API to pick', async () => {
    const user = userEvent.setup()
    const onSaved = vi.fn()
    renderWith(<AssignDialog ticket={TICKET} onSaved={onSaved} onClose={vi.fn()} />)
    await user.click(screen.getByRole('button', { name: 'Auto-assign' }))
    await waitFor(() => expect(onSaved).toHaveBeenCalledWith(expect.objectContaining({ assignee_name: 'Free Plumber' })))
    expect(api).toHaveBeenCalledWith('tickets', '/42/auto-assign', { method: 'POST' })
  })

  it('Auto-assign explains when nobody is free, and the popup stays open', async () => {
    answer(() => Promise.reject(new ApiError(409, 'nobody_free',
      'Every Plumbing engineer is full or Off duty. Pick someone from the list to go over the cap.')))
    const user = userEvent.setup()
    const onSaved = vi.fn()
    renderWith(<AssignDialog ticket={TICKET} onSaved={onSaved} onClose={vi.fn()} />)
    await user.click(screen.getByRole('button', { name: 'Auto-assign' }))
    expect(await screen.findByText(/Every Plumbing engineer is full or Off duty/)).toBeInTheDocument()
    expect(onSaved).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: 'Save' })).toBeEnabled()
  })
})
