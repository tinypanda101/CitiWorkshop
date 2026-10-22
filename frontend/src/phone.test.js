// Phone numbers: splitting a saved number into country code + number, and showing it.
import { describe, expect, it } from 'vitest'
import { formatPhone, splitPhone } from './phone'

describe('splitPhone', () => {
  it.each([
    ['+15552011234', '1', '5552011234'],
    ['+447946095800', '44', '7946095800'],
    ['+3531234567', '353', '1234567'], // +353 (Ireland), not +35
    ['', '1', ''],
  ])('%s -> +%s %s', (value, code, number) => {
    expect(splitPhone(value)).toEqual({ code, number })
  })
})

describe('formatPhone', () => {
  it('groups US / Canada numbers as 3-3-4', () => {
    expect(formatPhone('+15552011234')).toBe('+1 555 201 1234')
  })
  it('groups other countries in fours', () => {
    expect(formatPhone('+447946095800')).toBe('+44 7946 0958 00')
  })
  it('shows nothing for no phone', () => {
    expect(formatPhone(null)).toBe('')
  })
})
