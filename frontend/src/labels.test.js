// The small helpers that turn data into words: deadlines, stages, hours and date ranges.
import { afterEach, describe, expect, it, vi } from 'vitest'
import { dueLabel, employeeStage } from './ticketLabels'
import { describeRange, formatHours, plural, presetRange } from './components/dashboard/dashboardFormat'

afterEach(() => vi.useRealTimers())

describe('dueLabel (the fixed 3-day deadline)', () => {
  const at = (iso) => { vi.useFakeTimers(); vi.setSystemTime(new Date(iso)) }
  const ticket = (changes) => ({ status: 'in_progress', due_at: '2026-10-24T10:00:00', resolved_at: null, ...changes })

  it.each([
    ['2026-10-21T09:00:00', 'Due in 3 days', false],
    ['2026-10-23T09:00:00', 'Due tomorrow', false],
    ['2026-10-24T08:00:00', 'Due today', false],
    ['2026-10-24T11:00:00', 'Overdue today', true],
    ['2026-10-26T09:00:00', 'Overdue by 2 days', true],
  ])('at %s it says %s', (now, text, late) => {
    at(now)
    expect(dueLabel(ticket())).toEqual({ text, late })
  })

  it('says whether a finished ticket was on time', () => {
    at('2026-11-01T09:00:00') // long after: finished tickets are never "overdue"
    expect(dueLabel(ticket({ status: 'resolved', resolved_at: '2026-10-23T09:00:00' })).text).toBe('Resolved on time')
    expect(dueLabel(ticket({ status: 'closed', resolved_at: '2026-10-25T09:00:00' })).text).toBe('Resolved late')
  })
})

describe('employeeStage (six statuses shown to employees as three stages)', () => {
  it.each([['open', 'assigned'], ['assigned', 'assigned'], ['in_progress', 'in_progress'], ['blocked', 'in_progress'],
    ['resolved', 'resolved'], ['closed', 'resolved']])('%s counts as %s', (status, stage) => {
    expect(employeeStage(status)).toBe(stage)
  })
})

describe('formatHours', () => {
  it.each([[0.75, '45m'], [3.5, '3h 30m'], [52, '2d 4h'], [null, '—']])('%s hours -> %s', (hours, text) => {
    expect(formatHours(hours)).toBe(text)
  })
})

describe('date ranges', () => {
  it('"last 7 days" is today and the 6 days before it', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-10-21T15:00:00'))
    expect(presetRange('7')).toEqual({ preset: '7', from: '2026-10-15', to: '2026-10-21' })
    expect(presetRange('all')).toEqual({ preset: 'all', from: '', to: '' })
  })

  it.each([
    [{ preset: '30' }, 'in the last 30 days'],
    [{ preset: 'custom', from: '2026-10-01', to: '2026-10-21' }, 'from 2026-10-01 to 2026-10-21'],
    [{ preset: 'custom', from: '2026-10-01', to: '' }, 'since 2026-10-01'],
    [{ preset: 'custom', from: '', to: '2026-10-21' }, 'up to 2026-10-21'],
    [{ preset: 'all', from: '', to: '' }, 'in total'],
  ])('%o is described as "%s"', (range, words) => {
    expect(describeRange(range)).toBe(words)
  })

  it('plural', () => {
    expect([plural(1, 'ticket'), plural(2, 'ticket'), plural(0, 'ticket')]).toEqual(['1 ticket', '2 tickets', '0 tickets'])
  })
})
