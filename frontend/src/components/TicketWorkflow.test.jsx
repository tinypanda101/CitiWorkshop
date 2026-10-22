// The Status card on a ticket: each role only gets the moves it's allowed, and Blocked and
// Resolved need text first. (The API checks the same rules; see backend/tests/test_workflow.py.)
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import TicketWorkflow from './TicketWorkflow'
import { renderWith } from '../test/renderWith'
import { api, ApiError } from '../services/api'

vi.mock('../services/api', async (original) => ({ ...(await original()), api: vi.fn() }))

const ENGINEER = { id: 5, role: 'engineer' }
const ADMIN = { id: 1, role: 'admin' }
const REPORTER = { id: 9, role: 'employee' }
const ticket = (changes) => ({ id: 42, status: 'assigned', priority: 'medium', reporter_id: 9, assignee_id: 5,
  escalation_status: 'none', requested_priority: null, ...changes })

async function choices(user) {
  await user.click(screen.getByRole('combobox', { name: 'Change status to' }))
  const names = within(await screen.findByRole('listbox')).getAllByRole('option').map((o) => o.textContent)
  await user.keyboard('{Escape}')
  return names
}

beforeEach(() => api.mockResolvedValue(ticket({ status: 'in_progress' })))

describe('TicketWorkflow', () => {
  it.each([
    ['assigned', ['In Progress']],
    ['in_progress', ['Blocked', 'Resolved']],
    ['blocked', ['In Progress']],
    ['resolved', ['In Progress', 'Closed']],
  ])('the assigned engineer can only take the next step from %s', async (status, expected) => {
    const user = userEvent.setup()
    renderWith(<TicketWorkflow ticket={ticket({ status })} user={ENGINEER} onChanged={vi.fn()} />)
    expect(await choices(user)).toEqual(expected)
  })

  it('an admin can move it anywhere', async () => {
    const user = userEvent.setup()
    renderWith(<TicketWorkflow ticket={ticket({ status: 'assigned' })} user={ADMIN} onChanged={vi.fn()} />)
    expect(await choices(user)).toEqual(['In Progress', 'Blocked', 'Resolved', 'Closed'])
  })

  it.each([
    ['the reporter', REPORTER, {}],
    ['another engineer', { id: 6, role: 'engineer' }, {}],
  ])('%s gets no status control', (who, user) => {
    renderWith(<TicketWorkflow ticket={ticket()} user={user} onChanged={vi.fn()} />)
    expect(screen.queryByRole('combobox', { name: 'Change status to' })).not.toBeInTheDocument()
  })

  it('Resolved needs a summary, which is sent with it', async () => {
    const user = userEvent.setup()
    const onChanged = vi.fn()
    renderWith(<TicketWorkflow ticket={ticket({ status: 'in_progress' })} user={ENGINEER} onChanged={onChanged} />)
    await user.click(screen.getByRole('combobox', { name: 'Change status to' }))
    await user.click(await screen.findByRole('option', { name: 'Resolved' }))
    await user.type(screen.getByRole('textbox', { name: 'What was done to fix it?' }), 'Replaced the washer')
    await user.click(screen.getByRole('button', { name: 'Update status' }))
    await waitFor(() => expect(onChanged).toHaveBeenCalledWith(expect.anything(), 'Moved to Resolved'))
    expect(api).toHaveBeenCalledWith('tickets', '/42/status',
      { method: 'PUT', body: { status: 'resolved', resolution_summary: 'Replaced the washer' } })
  })

  it('shows the API\'s reason when a move is refused', async () => {
    // ...Once: with Vitest 5, a mock given a rejecting implementation after another one reports
    // the rejection as unhandled even though the page catches it.
    api.mockRejectedValueOnce(new ApiError(400, 'validation_error', 'Please check the highlighted fields',
      { blocked_reason: 'Please say what is blocking it' }))
    const user = userEvent.setup()
    renderWith(<TicketWorkflow ticket={ticket({ status: 'in_progress' })} user={ENGINEER} onChanged={vi.fn()} />)
    await user.click(screen.getByRole('combobox', { name: 'Change status to' }))
    await user.click(await screen.findByRole('option', { name: 'Blocked' }))
    await user.type(screen.getByRole('textbox', { name: 'What is blocking it?' }), ' ')
    await user.click(screen.getByRole('button', { name: 'Update status' }))
    expect(await screen.findByText('Please say what is blocking it')).toBeInTheDocument()
  })

  it('a closed ticket tells the engineer only an admin can reopen it', () => {
    renderWith(<TicketWorkflow ticket={ticket({ status: 'closed' })} user={ENGINEER} onChanged={vi.fn()} />)
    expect(screen.getByText('This ticket is closed. An admin can reopen it.')).toBeInTheDocument()
  })

  it('an admin can approve a pending escalation from the banner', async () => {
    const user = userEvent.setup()
    const pending = ticket({ escalation_status: 'pending', requested_priority: 'critical', escalation_reason: 'Flooding' })
    renderWith(<TicketWorkflow ticket={pending} user={ADMIN} onChanged={vi.fn()} />)
    expect(screen.getByText(/requested: “Flooding”/)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Approve' }))
    expect(api).toHaveBeenCalledWith('tickets', '/42/escalation', { method: 'PUT', body: { decision: 'approve' } })
  })

  it('the engineer sees a pending escalation but can\'t decide it', () => {
    const pending = ticket({ escalation_status: 'pending', requested_priority: 'high', escalation_reason: 'Urgent' })
    renderWith(<TicketWorkflow ticket={pending} user={ENGINEER} onChanged={vi.fn()} />)
    expect(screen.queryByRole('button', { name: 'Approve' })).not.toBeInTheDocument()
  })
})
