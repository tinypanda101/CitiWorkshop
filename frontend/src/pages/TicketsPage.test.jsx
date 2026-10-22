// The admin's Tickets page: filters from the link, search, chips and paging all turn into
// the query the API is asked for.
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import TicketsPage from './TicketsPage'
import { renderWith } from '../test/renderWith'
import { api } from '../services/api'

vi.mock('../services/AuthContext', () => ({ useAuth: () => ({ user: { id: 1, role: 'admin', full_name: 'Ada Admin' }, logout: vi.fn() }) }))
vi.mock('../services/api', async (original) => ({ ...(await original()), api: vi.fn() }))

const TICKET = { id: 1, number: 'TKT-1001', title: 'Leaking tap', status: 'open', priority: 'low', category_name: 'Plumbing',
  building_name: 'Head Office', floor_name: 'Floor 1', seat_code: null, reporter_name: 'Mary Smith', assignee_name: null,
  created_at: '2026-10-20T09:00:00Z' }

beforeEach(() => {
  api.mockImplementation((service, path) => {
    if (service === 'tickets') return Promise.resolve({ tickets: [TICKET], total: 60 })
    if (path === '/engineers') return Promise.resolve([{ id: 5, full_name: 'Patrick Jenkins', category_name: 'Plumbing' }])
    return Promise.resolve([])
  })
})

// The query string of the most recent tickets request, as an object.
function lastQuery() {
  const paths = api.mock.calls.filter(([service]) => service === 'tickets').map(([, path]) => path)
  return Object.fromEntries(new URLSearchParams(paths.at(-1).slice(2)))
}

describe('TicketsPage', () => {
  it('asks for the first 25, newest first', async () => {
    renderWith(<TicketsPage />, { route: '/tickets' })
    expect(await screen.findByText('Leaking tap')).toBeInTheDocument()
    expect(lastQuery()).toEqual({ sort: 'newest', page: '1', per_page: '25' })
    expect(screen.getByText('1–25 of 60')).toBeInTheDocument()
  })

  it('starts with the filters in the link (from a dashboard tile) and shows them as chips', async () => {
    renderWith(<TicketsPage />, { route: '/tickets?overdue=true&sort=oldest&status=blocked' })
    await waitFor(() => expect(lastQuery()).toMatchObject({ overdue: 'true', sort: 'oldest', status: 'blocked' }))
    expect(screen.getByText('Overdue only')).toBeInTheDocument()
    expect(screen.getByText('Status: Blocked')).toBeInTheDocument()
  })

  it('searches a moment after typing stops, from page 1', async () => {
    const user = userEvent.setup()
    renderWith(<TicketsPage />, { route: '/tickets' })
    await user.click(await screen.findByRole('button', { name: 'Go to next page' }))
    await waitFor(() => expect(lastQuery().page).toBe('2'))
    await user.type(screen.getByRole('textbox', { name: 'Search' }), 'leak')
    await waitFor(() => expect(lastQuery()).toMatchObject({ q: 'leak', page: '1' }))
  })

  it('finds an engineer by typing part of their name', async () => {
    const user = userEvent.setup()
    renderWith(<TicketsPage />, { route: '/tickets' })
    await user.type(await screen.findByRole('combobox', { name: 'Assigned to' }), 'pat')
    await user.click(await screen.findByRole('option', { name: 'Patrick Jenkins · Plumbing' }))
    await waitFor(() => expect(lastQuery().assigned_to).toBe('5'))
    expect(screen.getByText('Assigned to: Patrick Jenkins')).toBeInTheDocument()
  })

  it('Clear all removes every filter', async () => {
    const user = userEvent.setup()
    renderWith(<TicketsPage />, { route: '/tickets?status=open&priority=high' })
    await user.click(await screen.findByRole('button', { name: 'Clear all' }))
    await waitFor(() => expect(lastQuery()).toEqual({ sort: 'newest', page: '1', per_page: '25' }))
  })
})
