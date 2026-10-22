// The employee's list of their tickets: stage filter, sorting and the "news" dot.
import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import MyTickets from './MyTickets'
import { renderWith } from '../../test/renderWith'
import { api } from '../../services/api'

vi.mock('../../services/api', async (original) => ({ ...(await original()), api: vi.fn() }))

const row = (id, title, status, created_at, news = null) => ({ id, number: `TKT-${1000 + id}`, title, status, created_at, news })
const ROWS = [
  row(1, 'Leaking tap', 'open', '2026-10-20T09:00:00Z', 'note'),
  row(2, 'Wi-Fi down', 'blocked', '2026-10-18T09:00:00Z'),
  row(3, 'Broken chair', 'closed', '2026-10-10T09:00:00Z'),
]
const titles = () => screen.getAllByRole('listitem').map((li) => within(li).getByText(/^(Leaking|Wi-Fi|Broken)/).textContent)
const dotOn = (title) => screen.getByText(title).closest('button').querySelector('[title="New note or update since you last looked"]')

beforeEach(() => {
  api.mockImplementation((service, path) => (path.endsWith('/seen') ? Promise.resolve() : new Promise(() => {})))
})

describe('MyTickets', () => {
  it('shows newest first, and filters by stage', async () => {
    const user = userEvent.setup()
    renderWith(<MyTickets rows={ROWS} user={{ id: 9 }} />)
    expect(titles()).toEqual(['Leaking tap', 'Wi-Fi down', 'Broken chair'])
    await user.click(screen.getByRole('button', { name: 'In Progress' }))
    expect(titles()).toEqual(['Wi-Fi down']) // Blocked counts as In Progress for employees
    await user.click(screen.getByRole('button', { name: 'Resolved' }))
    expect(titles()).toEqual(['Broken chair']) // so does Closed for Resolved
  })

  it('can sort oldest first', async () => {
    const user = userEvent.setup()
    renderWith(<MyTickets rows={ROWS} user={{ id: 9 }} />)
    await user.click(screen.getByRole('combobox', { name: 'Submitted' }))
    await user.click(await screen.findByRole('option', { name: 'Oldest first' }))
    expect(titles()).toEqual(['Broken chair', 'Wi-Fi down', 'Leaking tap'])
  })

  it('clears the dot once the ticket is opened, and tells the API it was seen', async () => {
    const user = userEvent.setup()
    renderWith(<MyTickets rows={ROWS} user={{ id: 9 }} />)
    expect(dotOn('Leaking tap')).not.toBeNull()
    expect(dotOn('Wi-Fi down')).toBeNull()
    await user.click(screen.getByText('Leaking tap'))
    expect(api).toHaveBeenCalledWith('tickets', '/1/seen', { method: 'POST' })
    expect(dotOn('Leaking tap')).toBeNull()
  })

  it('has a friendly message with no tickets', () => {
    renderWith(<MyTickets rows={[]} user={{ id: 9 }} />)
    expect(screen.getByText(/You haven't submitted any tickets yet/)).toBeInTheDocument()
  })
})
