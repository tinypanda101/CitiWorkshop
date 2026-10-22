// The phone box: a country code plus digits, saved as "+" code number.
import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import PhoneField from './PhoneField'
import { renderWith } from '../test/renderWith'

describe('PhoneField', () => {
  it('drops anything that isn\'t a digit and adds the country code', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    renderWith(<PhoneField value="" onChange={onChange} />)
    await user.click(screen.getByRole('combobox', { name: 'Country' }))
    await user.click(await screen.findByRole('option', { name: '+44 UK' }))
    await user.type(screen.getByRole('textbox', { name: 'Phone' }), '(555) 201-1234')
    expect(screen.getByRole('textbox', { name: 'Phone' })).toHaveValue('5552011234')
    expect(onChange).toHaveBeenLastCalledWith('+445552011234')
  })

  it('splits a saved number back into its country and number', () => {
    renderWith(<PhoneField value="+3531234567" onChange={vi.fn()} />)
    expect(screen.getByRole('combobox', { name: 'Country' })).toHaveTextContent('+353')
    expect(screen.getByRole('textbox', { name: 'Phone' })).toHaveValue('1234567')
  })

  it('an empty number means no phone', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    renderWith(<PhoneField value="+15552011234" onChange={onChange} />)
    await user.clear(screen.getByRole('textbox', { name: 'Phone' }))
    expect(onChange).toHaveBeenLastCalledWith('')
  })
})
