// The Submit a ticket popup: which priorities each role sees, asking for a higher one,
// and the API's field errors showing under the right box.
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import TicketDialog from './TicketDialog'
import { renderWith } from '../test/renderWith'
import { api, ApiError } from '../services/api'

const auth = vi.hoisted(() => ({ user: { id: 1, role: 'employee', full_name: 'Mary Smith' } }))
vi.mock('../services/AuthContext', () => ({ useAuth: () => auth }))
vi.mock('../services/api', async (original) => ({ ...(await original()), api: vi.fn() }))

const CATEGORIES = [{ id: 3, name: 'Plumbing', type: 'facility' }]
const BUILDINGS = [{ id: 7, name: 'Head Office' }]
const FLOORS = [{ id: 11, name: 'Floor 1' }]

// The API answers the lookups; `submit` answers the POST.
function answer(submit = () => Promise.resolve({ id: 1, number: 'TKT-1001' })) {
  api.mockImplementation((service, path, options) => {
    if (path === '/categories') return Promise.resolve(CATEGORIES)
    if (path === '/buildings') return Promise.resolve(BUILDINGS)
    if (path.endsWith('/floors')) return Promise.resolve(FLOORS)
    return submit(service, path, options)
  })
}

// Picks an option from an MUI select by its label.
async function choose(user, label, option) {
  await user.click(screen.getByRole('combobox', { name: label }))
  await user.click(await screen.findByRole('option', { name: option }))
}

async function fillIn(user) {
  await user.type(screen.getByRole('textbox', { name: 'Title' }), 'Leaking tap')
  await user.type(screen.getByRole('textbox', { name: 'Description' }), 'Drips all day')
  await choose(user, 'Category', 'Plumbing')
  await choose(user, 'Building', 'Head Office')
  await choose(user, 'Floor', 'Floor 1')
}

function priorityButtons() {
  return within(screen.getByRole('group')).getAllByRole('button').map((b) => b.textContent)
}

beforeEach(() => {
  auth.user = { id: 1, role: 'employee', full_name: 'Mary Smith' }
  answer()
})

describe('TicketDialog', () => {
  it('lets an employee pick Low or Medium, or request High or Critical', async () => {
    renderWith(<TicketDialog onSaved={vi.fn()} onClose={vi.fn()} />)
    expect(priorityButtons()).toEqual(['Low', 'Medium', 'Request High', 'Request Critical'])
  })

  it.each(['admin', 'engineer'])('lets an %s pick any level directly', async (role) => {
    auth.user = { id: 2, role, full_name: 'Ada Admin' }
    renderWith(<TicketDialog onSaved={vi.fn()} onClose={vi.fn()} />)
    expect(priorityButtons()).toEqual(['Low', 'Medium', 'High', 'Critical'])
  })

  it('asks why when a higher priority is requested, and sends the request with the ticket', async () => {
    const user = userEvent.setup()
    const onSaved = vi.fn()
    renderWith(<TicketDialog onSaved={onSaved} onClose={vi.fn()} />)
    await fillIn(user)
    expect(screen.queryByRole('textbox', { name: /Why does it need/ })).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Request Critical' }))
    await user.type(screen.getByRole('textbox', { name: /Why does it need/ }), 'People are slipping')
    await user.click(screen.getByRole('button', { name: 'Submit' }))

    await waitFor(() => expect(onSaved).toHaveBeenCalled())
    const [, path, { method, body }] = api.mock.calls.find(([, , options]) => options?.method === 'POST')
    expect([path, method]).toEqual(['/', 'POST'])
    expect(body).toMatchObject({
      title: 'Leaking tap', category_id: 3, building_id: 7, floor_id: 11,
      priority: 'medium', requested_priority: 'critical', escalation_reason: 'People are slipping',
    })
  })

  it('shows the API\'s message under the field it is about', async () => {
    answer(() => Promise.reject(new ApiError(400, 'validation_error', 'Please check the highlighted fields',
      { seat_code: 'There is no seat HQ-1-99 on Floor 1' })))
    const user = userEvent.setup()
    const onSaved = vi.fn()
    renderWith(<TicketDialog onSaved={onSaved} onClose={vi.fn()} />)
    await fillIn(user)
    await user.type(screen.getByRole('textbox', { name: 'Seat' }), 'HQ-1-99')
    await user.click(screen.getByRole('button', { name: 'Submit' }))

    expect(await screen.findByText('There is no seat HQ-1-99 on Floor 1')).toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: 'Seat' })).toHaveAttribute('aria-invalid', 'true')
    expect(onSaved).not.toHaveBeenCalled()
  })

  it('keeps the floor box disabled until a building is picked', async () => {
    renderWith(<TicketDialog onSaved={vi.fn()} onClose={vi.fn()} />)
    expect(screen.getByRole('combobox', { name: 'Floor' })).toHaveAttribute('aria-disabled', 'true')
  })
})
