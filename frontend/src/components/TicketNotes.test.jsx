// Notes on a ticket: anyone who can see it adds them; only the author edits; author or admin deletes.
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import TicketNotes from './TicketNotes'
import { renderWith } from '../test/renderWith'
import { api } from '../services/api'

vi.mock('../services/api', async (original) => ({ ...(await original()), api: vi.fn() }))

const note = (id, author_id, author_name, author_role, body) => ({ id, author_id, author_name, author_role, body,
  created_at: '2026-10-20T09:00:00Z', updated_at: '2026-10-20T09:00:00Z' })
const NOTES = [note(1, 9, 'Mary Smith', 'employee', 'It drips at night'), note(2, 5, 'Pat Jones', 'engineer', 'On my way')]
const MARY = { id: 9, role: 'employee' }

beforeEach(() => {
  api.mockImplementation((service, path, options) => {
    if (!options) return Promise.resolve(NOTES)
    if (options.method === 'POST') return Promise.resolve(note(3, 9, 'Mary Smith', 'employee', options.body.body))
    if (options.method === 'PUT') return Promise.resolve({ ...NOTES[0], body: options.body.body, updated_at: '2026-10-20T10:00:00Z' })
    return Promise.resolve(null)
  })
})

describe('TicketNotes', () => {
  it('shows the conversation, with Edit only on your own notes', async () => {
    renderWith(<TicketNotes ticket={{ id: 42, status: 'in_progress' }} user={MARY} />)
    expect(await screen.findByText('On my way')).toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: 'Edit' })).toHaveLength(1)
    expect(screen.getAllByRole('button', { name: 'Delete' })).toHaveLength(1)
  })

  it('an admin can delete anyone\'s note but edit none', async () => {
    renderWith(<TicketNotes ticket={{ id: 42, status: 'in_progress' }} user={{ id: 1, role: 'admin' }} />)
    await screen.findByText('On my way')
    expect(screen.queryByRole('button', { name: 'Edit' })).not.toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: 'Delete' })).toHaveLength(2)
  })

  it('adds a note, and the button waits for some text', async () => {
    const user = userEvent.setup()
    renderWith(<TicketNotes ticket={{ id: 42, status: 'in_progress' }} user={MARY} />)
    expect(await screen.findByRole('button', { name: 'Add note' })).toBeDisabled()
    await user.type(screen.getByRole('textbox', { name: 'Add a note' }), 'Still dripping')
    await user.click(screen.getByRole('button', { name: 'Add note' }))
    expect(await screen.findByText('Still dripping')).toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: 'Add a note' })).toHaveValue('')
  })

  it('editing shows the change and marks it edited', async () => {
    const user = userEvent.setup()
    renderWith(<TicketNotes ticket={{ id: 42, status: 'in_progress' }} user={MARY} />)
    await user.click(await screen.findByRole('button', { name: 'Edit' }))
    const box = screen.getByDisplayValue('It drips at night')
    await user.clear(box)
    await user.type(box, 'It drips all day')
    await user.click(screen.getByRole('button', { name: 'Save' }))
    expect(await screen.findByText('It drips all day')).toBeInTheDocument()
    expect(screen.getByText(/· edited/)).toBeInTheDocument()
  })

  it('asks before deleting', async () => {
    const user = userEvent.setup()
    renderWith(<TicketNotes ticket={{ id: 42, status: 'in_progress' }} user={MARY} />)
    await user.click(await screen.findByRole('button', { name: 'Delete' }))
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Cancel' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(screen.getByText('It drips at night')).toBeInTheDocument()
    expect(api).not.toHaveBeenCalledWith('tickets', '/notes/1', { method: 'DELETE' })

    await user.click(screen.getByRole('button', { name: 'Delete' }))
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Delete' }))
    await waitFor(() => expect(screen.queryByText('It drips at night')).not.toBeInTheDocument())
    expect(api).toHaveBeenCalledWith('tickets', '/notes/1', { method: 'DELETE' })
  })

  it('no new notes on a closed ticket, except from admins', async () => {
    renderWith(<TicketNotes ticket={{ id: 42, status: 'closed' }} user={MARY} />)
    await screen.findByText('On my way')
    expect(screen.queryByRole('textbox', { name: 'Add a note' })).not.toBeInTheDocument()
  })
})
