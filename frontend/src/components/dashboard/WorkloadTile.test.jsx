// A sub-specialty's workload tile: free slots, its state as a word, and waiting tickets.
import { screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import WorkloadTile from './WorkloadTile'
import { renderWith } from '../../test/renderWith'

const tile = (changes) => ({ category_name: 'Plumbing', type: 'facility', on_duty: 2, used: 4, capacity: 10, waiting: 0, ...changes })

describe('WorkloadTile', () => {
  it.each([
    [{}, 'OK', '6'],
    [{ used: 8 }, 'Nearly full', '2'],
    [{ used: 10 }, 'Full', '0'],
    [{ used: 3, waiting: 1 }, 'Full', '7'], // anything waiting means more people are needed
    [{ on_duty: 0, capacity: 0, used: 2 }, 'No one on duty', '0'],
  ])('%o reads %s with %s free', (changes, word, free) => {
    renderWith(<WorkloadTile workload={tile(changes)} to="/reports/engineers" />)
    expect(screen.getByText(word)).toBeInTheDocument()
    expect(screen.getByText(free)).toBeInTheDocument()
  })

  it('puts waiting tickets on their own line', () => {
    renderWith(<WorkloadTile workload={tile({ used: 10, waiting: 6 })} to="/reports/engineers" />)
    expect(screen.getByText('6 tickets waiting')).toBeInTheDocument()
    expect(screen.getByText('10 / 10 used · 2 on duty')).toBeInTheDocument()
  })

  it('says 1 ticket, not 1 tickets', () => {
    renderWith(<WorkloadTile workload={tile({ waiting: 1 })} to="/reports/engineers" />)
    expect(screen.getByText('1 ticket waiting')).toBeInTheDocument()
  })

  it('links to the sub-specialty\'s engineers', () => {
    renderWith(<WorkloadTile workload={tile()} to="/reports/engineers?category=Plumbing" />)
    expect(screen.getByRole('link')).toHaveAttribute('href', '/reports/engineers?category=Plumbing')
  })
})
