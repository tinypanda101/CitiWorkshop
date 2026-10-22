// The eye button shows and hides the password.
import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import PasswordField from './PasswordField'
import { renderWith } from '../test/renderWith'

describe('PasswordField', () => {
  it('is hidden until the eye button is pressed, then hides again', async () => {
    const user = userEvent.setup()
    renderWith(<PasswordField label="Password" defaultValue="secret12" />)
    const box = screen.getByLabelText('Password')
    expect(box).toHaveAttribute('type', 'password')
    await user.click(screen.getByRole('button', { name: 'Show password' }))
    expect(box).toHaveAttribute('type', 'text')
    await user.click(screen.getByRole('button', { name: 'Hide password' }))
    expect(box).toHaveAttribute('type', 'password')
  })
})
