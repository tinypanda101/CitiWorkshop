// The Add building popup: one row per floor, the 1–100 floor limit, and per-row errors.
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import BuildingDialog from './BuildingDialog'
import { renderWith } from '../test/renderWith'
import { ApiError } from '../services/api'

const floorRows = () => screen.getAllByRole('textbox', { name: /^Level \d+ name$/ })

async function setFloors(user, count) {
  const box = screen.getByRole('spinbutton', { name: 'Number of floors' })
  await user.clear(box)
  await user.type(box, String(count))
}

describe('BuildingDialog', () => {
  it('shows one named row per floor', async () => {
    const user = userEvent.setup()
    renderWith(<BuildingDialog onSave={vi.fn()} onClose={vi.fn()} />)
    expect(floorRows()).toHaveLength(3)
    await setFloors(user, 5)
    expect(floorRows().map((box) => box.value)).toEqual(['Floor 1', 'Floor 2', 'Floor 3', 'Floor 4', 'Floor 5'])
  })

  it('says 1 to 100 floors and won\'t save when 102 is typed', async () => {
    const user = userEvent.setup()
    renderWith(<BuildingDialog onSave={vi.fn()} onClose={vi.fn()} />)
    await setFloors(user, 102)
    expect(screen.getByText('1 to 100 floors')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled()
    await setFloors(user, 0)
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled()
    await setFloors(user, 4)
    expect(screen.getByRole('button', { name: 'Save' })).toBeEnabled()
  })

  it('keeps names already typed when the floor count changes', async () => {
    const user = userEvent.setup()
    renderWith(<BuildingDialog onSave={vi.fn()} onClose={vi.fn()} />)
    await user.clear(floorRows()[0])
    await user.type(floorRows()[0], 'Lobby')
    await setFloors(user, 4)
    expect(floorRows()[0].value).toBe('Lobby')
  })

  it('sends the building with its floors, and puts a floor\'s error on its own row', async () => {
    const user = userEvent.setup()
    const onSave = vi.fn().mockRejectedValue(new ApiError(400, 'validation_error', 'Please check the highlighted fields',
      { 'floors.1.name': 'Only letters, numbers, spaces and hyphens (-)' }))
    renderWith(<BuildingDialog onSave={onSave} onClose={vi.fn()} />)
    await user.type(screen.getByRole('textbox', { name: 'Code' }), 'HQ')
    await user.type(screen.getByRole('textbox', { name: 'Name' }), 'Head Office')
    await user.type(screen.getByRole('textbox', { name: 'Address' }), '1 Main St')
    await setFloors(user, 2)
    await user.click(screen.getByRole('button', { name: 'Save' }))

    await waitFor(() => expect(onSave).toHaveBeenCalled())
    expect(onSave.mock.calls[0][0]).toMatchObject({
      code: 'HQ', name: 'Head Office', address: '1 Main St',
      floors: [{ name: 'Floor 1', seats: 20 }, { name: 'Floor 2', seats: 20 }],
    })
    expect(await screen.findByText('Only letters, numbers, spaces and hyphens (-)')).toBeInTheDocument()
    expect(floorRows()[1]).toHaveAttribute('aria-invalid', 'true')
    expect(floorRows()[0]).toHaveAttribute('aria-invalid', 'false')
  })

  it('editing a building has no floor rows', () => {
    const building = { id: 1, code: 'HQ', name: 'Head Office', address: '1 Main St', manager_phone: '+15552011234' }
    renderWith(<BuildingDialog building={building} onSave={vi.fn()} onClose={vi.fn()} />)
    expect(screen.queryByRole('spinbutton', { name: 'Number of floors' })).not.toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: 'Name' })).toHaveValue('Head Office')
    expect(screen.getByRole('textbox', { name: 'Manager phone' })).toHaveValue('5552011234')
  })
})
