// The engineers table: search, filters, sorting and paging all happen in the browser.
import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import EngineerTable from './EngineerTable'
import { renderWith } from '../test/renderWith'

const engineer = (id, full_name, category_name, availability, open_tickets, on_time_percent = null) => ({
  id, full_name, category_name, availability, open_tickets, on_time_percent,
  specialty: category_name === 'Network / Wi-Fi' ? 'technology' : 'facility', phone: '+15552011234',
})

const TEAM = [
  engineer(1, 'Patrick Jenkins', 'Plumbing', 'available', 5, 90),
  engineer(2, 'Amy Chen', 'Plumbing', 'off_duty', 0, 70),
  engineer(3, 'Raj Weaver', 'Network / Wi-Fi', 'busy', 2, null),
  engineer(4, 'Zoe Park', 'Cleaning', 'available', 3, 100),
]

const names = () => screen.getAllByRole('row').slice(1).map((row) => within(row).getAllByRole('cell')[0].textContent)

async function choose(user, label, option) {
  await user.click(screen.getByRole('combobox', { name: label }))
  await user.click(await screen.findByRole('option', { name: option }))
}

describe('EngineerTable', () => {
  it('lists everyone by name to start with', () => {
    renderWith(<EngineerTable engineers={TEAM} cap={5} onTime />)
    expect(names()).toEqual(['Amy Chen', 'Patrick Jenkins', 'Raj Weaver', 'Zoe Park'])
    expect(screen.getByText('5 / 5 (full)')).toBeInTheDocument()
  })

  it('searches by name', async () => {
    const user = userEvent.setup()
    renderWith(<EngineerTable engineers={TEAM} />)
    await user.type(screen.getByRole('textbox', { name: 'Search' }), 'pat')
    expect(names()).toEqual(['Patrick Jenkins'])
    await user.type(screen.getByRole('textbox', { name: 'Search' }), 'nobody')
    expect(screen.getByText('No engineers match.')).toBeInTheDocument()
  })

  it('filters by sub-specialty and availability together', async () => {
    const user = userEvent.setup()
    renderWith(<EngineerTable engineers={TEAM} />)
    await choose(user, 'Sub-specialty', 'Plumbing')
    expect(names()).toEqual(['Amy Chen', 'Patrick Jenkins'])
    await choose(user, 'Availability', 'Off duty')
    expect(names()).toEqual(['Amy Chen'])
  })

  it.each([
    ['Most unfinished', ['Patrick Jenkins', 'Zoe Park', 'Raj Weaver', 'Amy Chen']],
    ['Fewest unfinished', ['Amy Chen', 'Raj Weaver', 'Zoe Park', 'Patrick Jenkins']],
    ['Best on time', ['Zoe Park', 'Patrick Jenkins', 'Amy Chen', 'Raj Weaver']], // no data yet goes last
  ])('sorts by %s', async (sort, expected) => {
    const user = userEvent.setup()
    renderWith(<EngineerTable engineers={TEAM} onTime />)
    await choose(user, 'Sort', sort)
    expect(names()).toEqual(expected)
  })

  it('only offers the on-time sorts when there is on-time data', async () => {
    const user = userEvent.setup()
    renderWith(<EngineerTable engineers={TEAM} phone />)
    await user.click(screen.getByRole('combobox', { name: 'Sort' }))
    expect(screen.queryByRole('option', { name: 'Best on time' })).not.toBeInTheDocument()
    expect(screen.getAllByText('+1 555 201 1234')).toHaveLength(4) // the Phone column, formatted
  })

  it('with a fixed sub-specialty shows only those engineers and hides that filter', () => {
    renderWith(<EngineerTable engineers={TEAM} category="Plumbing" />)
    expect(names()).toEqual(['Amy Chen', 'Patrick Jenkins'])
    expect(screen.queryByRole('combobox', { name: 'Sub-specialty' })).not.toBeInTheDocument()
  })

  it('shows 25 a page', async () => {
    const user = userEvent.setup()
    const many = Array.from({ length: 30 }, (_, i) => engineer(i + 1, `Engineer ${String(i + 1).padStart(2, '0')}`, 'Plumbing', 'available', 0))
    renderWith(<EngineerTable engineers={many} />)
    expect(names()).toHaveLength(25)
    expect(screen.getByText('1–25 of 30')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Go to next page' }))
    expect(names()).toEqual(['Engineer 26', 'Engineer 27', 'Engineer 28', 'Engineer 29', 'Engineer 30'])
  })
})
