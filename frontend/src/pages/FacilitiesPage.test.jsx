// The Facilities page: picking a building and floor, deleting, and refused deletes.
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import FacilitiesPage from './FacilitiesPage'
import { renderWith } from '../test/renderWith'
import { api, ApiError } from '../services/api'

vi.mock('../services/AuthContext', () => ({ useAuth: () => ({ user: { id: 1, role: 'admin', full_name: 'Ada Admin' }, logout: vi.fn() }) }))
vi.mock('../services/api', async (original) => ({ ...(await original()), api: vi.fn() }))

const BUILDING = { id: 1, code: 'HQ', name: 'Head Office', address: '1 Main St', manager_name: 'Mary Smith',
  manager_email: 'mary@acme.inc', manager_phone: '+15552011234', floor_count: 1 }

let deleteResult // what DELETE answers
beforeEach(() => {
  deleteResult = () => Promise.resolve(null)
  api.mockImplementation((service, path, options) => {
    if (options?.method === 'DELETE') return deleteResult()
    if (path === '/buildings') return Promise.resolve([BUILDING])
    if (path === '/buildings/1/floors') return Promise.resolve([{ id: 11, building_id: 1, level: 1, name: 'Floor 1', seat_count: 2 }])
    if (path === '/floors/11/seats') return Promise.resolve([{ id: 101, floor_id: 11, code: 'HQ-101' }, { id: 102, floor_id: 11, code: 'HQ-102' }])
    return Promise.resolve({})
  })
})

async function pickBuildingAndFloor(user) {
  await user.click(await screen.findByText('Head Office (HQ)'))
  await user.click(await screen.findByText('Floor 1'))
  await screen.findByText('HQ-101')
}

describe('FacilitiesPage', () => {
  it('picking a building shows its manager and floors; picking a floor shows its seats', async () => {
    const user = userEvent.setup()
    renderWith(<FacilitiesPage />)
    await pickBuildingAndFloor(user)
    expect(screen.getByText(/Building manager: Mary Smith · mary@acme.inc · \+1 555 201 1234/)).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Seats on Floor 1' })).toBeInTheDocument()
  })

  it('a refused delete shows why, and keeps what was picked', async () => {
    deleteResult = () => Promise.reject(new ApiError(409, 'in_use', "Can't delete Floor 1. 3 tickets are linked to it."))
    const user = userEvent.setup()
    renderWith(<FacilitiesPage />)
    await pickBuildingAndFloor(user)
    await user.click(screen.getAllByRole('button', { name: /Delete/ })[1]) // the floor's delete button
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Delete' }))
    expect(await screen.findByText("Can't delete Floor 1. 3 tickets are linked to it.")).toBeInTheDocument()
    expect(screen.getByText('HQ-101')).toBeInTheDocument()
  })

  it('after a delete it says so and goes back to nothing picked', async () => {
    const user = userEvent.setup()
    renderWith(<FacilitiesPage />)
    await pickBuildingAndFloor(user)
    await user.click(screen.getAllByRole('button', { name: /Delete/ }).at(-1)) // the last seat's delete button
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Delete' }))
    expect(await screen.findByText('HQ-102 was deleted')).toBeInTheDocument()
    await waitFor(() => expect(screen.queryByText('HQ-101')).not.toBeInTheDocument())
  })

  it('+ Add several adds seats to the picked floor', async () => {
    const user = userEvent.setup()
    renderWith(<FacilitiesPage />)
    await pickBuildingAndFloor(user)
    await user.click(screen.getByRole('button', { name: '+ Add several' }))
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: /Save|Add/ }))
    await waitFor(() => expect(api).toHaveBeenCalledWith('facilities', '/floors/11/seats/bulk', expect.objectContaining({ method: 'POST' })))
    expect(await screen.findByText('10 seats added to Floor 1')).toBeInTheDocument()
  })
})
