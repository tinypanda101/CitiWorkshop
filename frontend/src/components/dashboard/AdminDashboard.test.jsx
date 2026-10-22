// The admin dashboard shows the API's numbers, links each tile to the right list, and has a
// tab for the admin's own tickets.
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import AdminDashboard from './AdminDashboard'
import { renderWith } from '../../test/renderWith'
import { api } from '../../services/api'

vi.mock('../../services/api', async (original) => ({ ...(await original()), api: vi.fn() }))

const list = (total) => ({ total, tickets: [] })
const DATA = {
  role: 'admin', total: 120,
  by_status: { open: 3, assigned: 4, in_progress: 10, blocked: 2, resolved: 6, closed: 95 },
  averages: { hours_to_assign: 0.05, hours_to_resolve: 30.5, percent_on_time: 91 },
  categories: [], ticket_cap: 5, engineers: [], waiting_to_close: 6,
  by_priority: [{ label: 'Critical', value: 1 }, { label: 'High', value: 4 }, { label: 'Medium', value: 8 }, { label: 'Low', value: 6 }],
  workload: [{ category_name: 'Plumbing', type: 'facility', on_duty: 2, used: 10, capacity: 10, waiting: 3 },
    { category_name: 'Network / Wi-Fi', type: 'technology', on_duty: 8, used: 11, capacity: 40, waiting: 0 }],
  overdue: list(7), waiting: list(3), blocked: list(2), pending_escalations: list(5), decided_escalations: list(0),
  submitted: { role: 'employee', by_status: { open: 0, assigned: 1, in_progress: 0, blocked: 0, resolved: 0, closed: 0 },
    tickets: [{ id: 9, number: 'TKT-1009', title: 'My own ticket', status: 'assigned', created_at: '2026-10-20T09:00:00Z', news: null }] },
}

beforeEach(() => api.mockResolvedValue(DATA))

describe('AdminDashboard', () => {
  it('links status tiles to the Tickets page with the date range', async () => {
    renderWith(<AdminDashboard user={{ id: 1, role: 'admin' }} />)
    await screen.findByText('91%')
    // "Blocked" is both a status tile (to the Tickets page) and a Needs attention link (to its report).
    const links = screen.getAllByText('Blocked').map((text) => text.closest('a').getAttribute('href'))
    expect(links.find((href) => href.startsWith('/reports'))).toMatch(/^\/reports\/blocked\?from=/)
    expect(links.find((href) => href.startsWith('/tickets'))).toMatch(/^\/tickets\?status=blocked&from=\d{4}-\d\d-\d\d&to=\d{4}-\d\d-\d\d$/)
  })

  it('shows the needs-attention counts, response times and workload tiles', async () => {
    renderWith(<AdminDashboard user={{ id: 1, role: 'admin' }} />)
    expect(await screen.findByText('91%')).toBeInTheDocument()
    expect(screen.getByText('1d 7h')).toBeInTheDocument() // 30.5 hours to resolve
    expect(screen.getByText('Overdue').closest('a')).toHaveTextContent('7')
    expect(screen.getByText('Plumbing').closest('a')).toHaveAttribute('href', expect.stringContaining('/reports/engineers?category=Plumbing'))
    expect(screen.getByText('3 tickets waiting')).toBeInTheDocument()
  })

  it('asks again when the date range changes', async () => {
    const user = userEvent.setup()
    renderWith(<AdminDashboard user={{ id: 1, role: 'admin' }} />)
    await screen.findByText('91%')
    await user.click(screen.getByRole('button', { name: 'All time' }))
    await waitFor(() => expect(api).toHaveBeenLastCalledWith('dashboard', '/?'))
  })

  it('the Submitted Tickets tab shows the admin\'s own tickets', async () => {
    const user = userEvent.setup()
    renderWith(<AdminDashboard user={{ id: 1, role: 'admin' }} />)
    await user.click(await screen.findByRole('tab', { name: 'Submitted Tickets' }))
    expect(screen.getByText('My own ticket')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Submit a ticket' })).toBeInTheDocument()
  })
})
