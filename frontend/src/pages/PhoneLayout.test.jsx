// The phone layout (screen under 600 px): the menu, Tickets cards and filters panel, the
// Facilities drill-down, cards for engineers, full-screen popups and the date drop-down.
// Each test renders with renderWith(..., { phone: true }); the desktop tests are in the other files.
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import FacilitiesPage from './FacilitiesPage'
import TicketsPage from './TicketsPage'
import EngineerTable from '../components/EngineerTable'
import Layout from '../components/Layout'
import TicketDialog from '../components/TicketDialog'
import DateRangePicker from '../components/dashboard/DateRangePicker'
import { renderWith } from '../test/renderWith'
import { api } from '../services/api'

const auth = vi.hoisted(() => ({ user: null, logout: () => {} }))
vi.mock('../services/AuthContext', () => ({ useAuth: () => auth }))
vi.mock('../services/api', async (original) => ({ ...(await original()), api: vi.fn() }))

const TICKET = { id: 1, number: 'TKT-1001', title: 'Leaking tap', status: 'open', priority: 'high', category_name: 'Plumbing',
  building_name: 'Head Office', floor_name: 'Floor 1', seat_code: 'HQ-1-01', reporter_name: 'Mary Smith', assignee_name: null,
  created_at: '2026-10-20T09:00:00Z' }

beforeEach(() => {
  auth.user = { id: 1, role: 'admin', full_name: 'Ada Admin' }
  api.mockImplementation((service, path) => {
    if (service === 'tickets') return Promise.resolve({ tickets: [TICKET], total: 1 })
    if (path === '/buildings') return Promise.resolve([{ id: 1, code: 'HQ', name: 'Head Office', address: '1 Main St', floor_count: 1 }])
    if (path === '/buildings/1/floors') return Promise.resolve([{ id: 11, building_id: 1, level: 1, name: 'Floor 1', seat_count: 1 }])
    if (path === '/floors/11/seats') return Promise.resolve([{ id: 101, floor_id: 11, code: 'HQ-1-01' }])
    if (path === '/engineers/me') return Promise.resolve({ availability: 'busy' })
    return Promise.resolve([])
  })
})

describe('the menu', () => {
  it('is a ☰ button; the links only show once it is opened', async () => {
    const user = userEvent.setup()
    renderWith(<Layout>page</Layout>, { phone: true })
    expect(screen.queryByRole('link', { name: 'Tickets' })).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Open menu' }))
    const menu = screen.getByRole('navigation', { name: 'Menu' })
    expect(within(menu).getAllByRole('link').map((l) => l.textContent)).toEqual(['Dashboard', 'Tickets', 'Facilities', 'Users', 'My account'])
    expect(within(menu).getByText('Ada Admin')).toBeInTheDocument()
    expect(within(menu).getByRole('button', { name: /Log out/ })).toBeInTheDocument()
  })

  it('an engineer also gets their availability in the menu', async () => {
    auth.user = { id: 5, role: 'engineer', full_name: 'Pat Jones' }
    const user = userEvent.setup()
    renderWith(<Layout>page</Layout>, { phone: true })
    await user.click(screen.getByRole('button', { name: 'Open menu' }))
    const menu = screen.getByRole('navigation', { name: 'Menu' })
    expect(within(menu).getAllByRole('link').map((l) => l.textContent)).toEqual(['Dashboard', 'My account'])
    expect(await within(menu).findByRole('combobox')).toHaveTextContent('Busy')
  })

  it('dark mode can be switched from the menu', async () => {
    const user = userEvent.setup()
    renderWith(<Layout>page</Layout>, { phone: true })
    await user.click(screen.getByRole('button', { name: 'Open menu' }))
    await user.click(screen.getByRole('button', { name: /Dark mode/ }))
    expect(localStorage.getItem('colorMode')).toBe('dark')
  })
})

describe('Tickets on a phone', () => {
  it('shows each ticket as a card that links to it, with paging', async () => {
    renderWith(<TicketsPage />, { phone: true, route: '/tickets' })
    const card = (await screen.findByText('Leaking tap')).closest('a')
    expect(card).toHaveAttribute('href', '/tickets/1')
    expect(card).toHaveTextContent('High · Plumbing · Head Office · Floor 1 · HQ-1-01')
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
    expect(screen.getByText('1–1 of 1')).toBeInTheDocument()
  })

  it('keeps the filters in a panel, behind a button that counts them', async () => {
    const user = userEvent.setup()
    renderWith(<TicketsPage />, { phone: true, route: '/tickets?status=open&priority=high' })
    expect(screen.queryByRole('combobox', { name: 'Status' })).not.toBeInTheDocument()
    await user.click(await screen.findByRole('button', { name: 'Filters (2)' }))
    expect(screen.getByRole('combobox', { name: 'Status' })).toHaveTextContent('Open')
    await user.click(screen.getByRole('button', { name: 'Show 1 tickets' }))
    await waitFor(() => expect(screen.queryByRole('combobox', { name: 'Status' })).not.toBeInTheDocument())
  })
})

describe('Facilities on a phone', () => {
  it('shows one level at a time, with a link back up', async () => {
    const user = userEvent.setup()
    renderWith(<FacilitiesPage />, { phone: true })
    await user.click(await screen.findByText('Head Office (HQ)'))
    expect(await screen.findByRole('heading', { name: 'Floors in Head Office' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Buildings' })).not.toBeInTheDocument()

    await user.click(screen.getByText('Floor 1'))
    expect(await screen.findByText('HQ-1-01')).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Floors in Head Office' })).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Floors in Head Office' }))
    expect(await screen.findByRole('heading', { name: 'Floors in Head Office' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Buildings' }))
    expect(screen.getByRole('heading', { name: 'Buildings' })).toBeInTheDocument()
  })

  it('puts Edit and Delete in a ⋮ menu on each row', async () => {
    const user = userEvent.setup()
    renderWith(<FacilitiesPage />, { phone: true })
    await screen.findByText('Head Office (HQ)')
    expect(screen.queryByRole('button', { name: 'Edit' })).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'More actions' }))
    await user.click(screen.getByRole('menuitem', { name: 'Delete' }))
    expect(screen.getByRole('dialog', { name: 'Delete Head Office?' })).toBeInTheDocument()
  })
})

describe('other phone layouts', () => {
  it('engineers are cards', () => {
    const engineers = [{ id: 1, full_name: 'Pat Jones', category_name: 'Plumbing', specialty: 'facility',
      availability: 'available', open_tickets: 2, on_time_percent: 90, phone: '+15552011234' }]
    renderWith(<EngineerTable engineers={engineers} cap={5} onTime phone />, { phone: true })
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
    expect(screen.getByText('Plumbing (Facility) · +1 555 201 1234')).toBeInTheDocument()
    expect(screen.getByText('2 / 5')).toBeInTheDocument()
  })

  it('popups fill the screen and have a close button', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    renderWith(<TicketDialog onSaved={vi.fn()} onClose={onClose} />, { phone: true })
    expect(screen.getByRole('dialog').className).toMatch(/MuiDialog-paperFullScreen/)
    await user.click(screen.getByRole('button', { name: 'Close' }))
    expect(onClose).toHaveBeenCalled()
  })

  it('the date range is one drop-down, with From and To for custom dates', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    renderWith(<DateRangePicker value={{ preset: '30', from: '2026-09-22', to: '2026-10-21' }} onChange={onChange} />, { phone: true })
    expect(screen.queryByRole('button', { name: 'Last 7 days' })).not.toBeInTheDocument()
    expect(screen.queryByLabelText('From')).not.toBeInTheDocument()
    await user.click(screen.getByRole('combobox', { name: 'Date range' }))
    await user.click(screen.getByRole('option', { name: 'Last 7 days' }))
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ preset: '7' }))
  })

  it('custom dates show the From and To boxes', () => {
    renderWith(<DateRangePicker value={{ preset: 'custom', from: '2026-10-01', to: '' }} onChange={vi.fn()} />, { phone: true })
    expect(screen.getByLabelText('From')).toHaveValue('2026-10-01')
    expect(screen.getByLabelText('To')).toBeInTheDocument()
  })
})
