// The admin's report pages: one sub-specialty's engineers, the locations drill-down, and acting on lists.
import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import AdminReportPage from './AdminReportPage'
import { renderWith } from '../test/renderWith'
import { api } from '../services/api'

vi.mock('../services/AuthContext', () => ({ useAuth: () => ({ user: { id: 1, role: 'admin', full_name: 'Ada Admin' }, logout: vi.fn() }) }))
vi.mock('../services/api', async (original) => ({ ...(await original()), api: vi.fn() }))

const row = (id, title, changes = {}) => ({ id, number: `TKT-${1000 + id}`, title, status: 'open', priority: 'medium',
  location: 'Head Office · Floor 1', category_name: 'Plumbing', category_type: 'facility', assignee_name: null,
  requested_priority: null, escalation_reason: null, created_at: '2026-10-20T09:00:00Z', updated_at: '2026-10-20T09:00:00Z',
  due_at: '2026-10-23T09:00:00Z', ...changes })
const engineer = (id, full_name, category_name) => ({ id, full_name, category_name, specialty: 'facility',
  availability: 'available', open_tickets: 1, on_time_percent: 80 })
const DASHBOARD = {
  ticket_cap: 5,
  engineers: [engineer(1, 'Pat Plumb', 'Plumbing'), engineer(2, 'Cleo Clean', 'Cleaning')],
  overdue: { total: 120, tickets: [row(1, 'Old leak')] },
  waiting: { total: 1, tickets: [row(2, 'Nobody free')] },
  blocked: { total: 0, tickets: [] },
  pending_escalations: { total: 1, tickets: [row(3, 'Flooding', { requested_priority: 'critical', escalation_reason: 'Water everywhere' })] },
  decided_escalations: { total: 0, tickets: [] },
  categories: [{ label: 'Plumbing', type: 'facility', value: 6 }, { label: 'Network / Wi-Fi', type: 'technology', value: 2 }],
}
const LEVELS = {
  '': { level: 'buildings', rows: [{ id: 5, label: 'Canary Wharf Office', value: 150 }] },
  'building_id=5': { level: 'floors', building_name: 'Canary Wharf Office', rows: [{ id: 54, label: 'Floor 5', value: 99 }] },
  'building_id=5&floor_id=54': { level: 'seats', building_name: 'Canary Wharf Office', floor_name: 'Floor 5',
    rows: [{ id: null, label: 'No seat given', value: 26 }, { id: 9, label: 'CW-5-18', value: 6 }] },
}

beforeEach(() => {
  api.mockImplementation((service, path) => {
    if (path.startsWith('/locations')) {
      // Which level was asked for, ignoring the date range: "building_id=5&floor_id=54".
      const params = new URLSearchParams(path.split('?')[1])
      params.delete('from')
      params.delete('to')
      return Promise.resolve(LEVELS[params.toString()])
    }
    if (service === 'dashboard') return Promise.resolve(DASHBOARD)
    if (path === '/engineers') return Promise.resolve(DASHBOARD.engineers)
    return Promise.resolve({ ...row(3, 'Flooding'), number: 'TKT-1003' })
  })
})

const open = (route) => renderWith(<Routes><Route path="/reports/:kind" element={<AdminReportPage />} /></Routes>, { route })

describe('AdminReportPage', () => {
  it('a sub-specialty\'s page is named after it and lists only its engineers', async () => {
    open('/reports/engineers?category=Plumbing')
    expect(await screen.findByRole('heading', { level: 1, name: 'Plumbing' })).toBeInTheDocument()
    expect(screen.getByText('Pat Plumb')).toBeInTheDocument()
    expect(screen.queryByText('Cleo Clean')).not.toBeInTheDocument()
  })

  it('all engineers without a sub-specialty in the link', async () => {
    open('/reports/engineers')
    expect(await screen.findByRole('heading', { level: 1, name: 'Engineers' })).toBeInTheDocument()
    expect(screen.getByText('Cleo Clean')).toBeInTheDocument()
  })

  it('locations: buildings, then a building\'s floors, then a floor\'s seats', async () => {
    const user = userEvent.setup()
    open('/reports/locations?from=2026-09-22&to=2026-10-21')
    await user.click(await screen.findByRole('button', { name: 'Canary Wharf Office' }))
    await user.click(await screen.findByRole('button', { name: 'Floor 5' }))
    expect(await screen.findByText('CW-5-18')).toBeInTheDocument()
    expect(screen.getByText('No seat given')).toBeInTheDocument()
    // The date range was kept at every level.
    expect(api).toHaveBeenLastCalledWith('dashboard', '/locations?from=2026-09-22&to=2026-10-21&building_id=5&floor_id=54')
    await user.click(screen.getByRole('button', { name: 'All buildings' }))
    expect(await screen.findByRole('button', { name: 'Canary Wharf Office' })).toBeInTheDocument()
  })

  it('a long list says how many more there are, with a link to all of them', async () => {
    open('/reports/overdue')
    expect(await screen.findByText(/Showing 1 of 120/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'See all on the Tickets page' })).toHaveAttribute('href', '/tickets?overdue=true&sort=oldest')
  })

  it('escalations can be approved from the list', async () => {
    const user = userEvent.setup()
    open('/reports/escalations')
    expect(await screen.findByText(/Water everywhere/)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Approve' }))
    expect(api).toHaveBeenCalledWith('tickets', '/3/escalation', { method: 'PUT', body: { decision: 'approve' } })
    expect(await screen.findByText('TKT-1003: escalation approved')).toBeInTheDocument()
  })

  it('waiting tickets have an Assign button', async () => {
    const user = userEvent.setup()
    open('/reports/waiting')
    await user.click(await screen.findByRole('button', { name: 'Assign' }))
    expect(await screen.findByRole('dialog', { name: 'Assign TKT-1002' })).toBeInTheDocument()
  })

  it('categories have a legend for facility and technology', async () => {
    open('/reports/categories')
    expect(await screen.findByText('Facility 6, technology 2')).toBeInTheDocument()
    expect(screen.getByText('Technology')).toBeInTheDocument()
  })

  it('an unknown report says so', async () => {
    open('/reports/nonsense')
    expect(await screen.findByText(/There's no report called/)).toBeInTheDocument()
  })
})
