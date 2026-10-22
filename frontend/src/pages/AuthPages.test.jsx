// The Log in and Create an account pages.
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import LoginPage from './LoginPage'
import RegisterPage from './RegisterPage'
import { renderWith } from '../test/renderWith'
import { ApiError } from '../services/api'

const auth = vi.hoisted(() => ({ user: null, login: null, register: null }))
vi.mock('../services/AuthContext', () => ({ useAuth: () => auth }))

beforeEach(() => {
  auth.user = null
  auth.login = vi.fn()
  auth.register = vi.fn()
})

describe('LoginPage', () => {
  it('shows the API\'s message for a wrong password', async () => {
    auth.login.mockRejectedValue(new ApiError(401, 'invalid_credentials', 'Wrong email or password'))
    const user = userEvent.setup()
    renderWith(<LoginPage />, { route: '/login' })
    await user.type(screen.getByRole('textbox', { name: 'Email' }), 'mary@acme.inc')
    await user.type(screen.getByLabelText(/^Password/), 'wrongpass')
    await user.click(screen.getByRole('button', { name: 'Log in' }))
    expect(await screen.findByText('Wrong email or password')).toBeInTheDocument()
    expect(auth.login).toHaveBeenCalledWith('mary@acme.inc', 'wrongpass')
  })

  it('disables the button while logging in', async () => {
    auth.login.mockReturnValue(new Promise(() => {})) // never answers
    const user = userEvent.setup()
    renderWith(<LoginPage />, { route: '/login' })
    await user.click(screen.getByRole('button', { name: 'Log in' }))
    expect(screen.getByRole('button', { name: 'Logging in…' })).toBeDisabled()
  })

  it('tells people who forgot their password to ask an admin', () => {
    renderWith(<LoginPage />, { route: '/login' })
    expect(screen.getByText('Forgot your password? Ask a Facility Admin to reset it.')).toBeInTheDocument()
  })
})

describe('RegisterPage', () => {
  async function fill(user, { password = 'password1', confirm = 'password1' } = {}) {
    await user.type(screen.getByRole('textbox', { name: 'Full name' }), 'Mary Smith')
    await user.type(screen.getByRole('textbox', { name: 'Email' }), 'mary@acme.inc')
    await user.type(screen.getByLabelText(/^Password/), password)
    await user.type(screen.getByLabelText(/^Confirm password/), confirm)
    await user.click(screen.getByRole('button', { name: 'Create account' }))
  }

  it('checks the two passwords match before asking the API', async () => {
    const user = userEvent.setup()
    renderWith(<RegisterPage />, { route: '/register' })
    await fill(user, { confirm: 'password2' })
    expect(screen.getByText('Passwords do not match')).toBeInTheDocument()
    expect(auth.register).not.toHaveBeenCalled()
  })

  it('shows each of the API\'s messages under its own box', async () => {
    auth.register.mockRejectedValue(new ApiError(400, 'validation_error', 'Please check the highlighted fields', {
      email: 'Must be an @acme.inc email, e.g. mary.smith@acme.inc',
      full_name: 'Letters only, with spaces, hyphens or apostrophes between words',
    }))
    const user = userEvent.setup()
    renderWith(<RegisterPage />, { route: '/register' })
    await fill(user)
    expect(await screen.findByText('Must be an @acme.inc email, e.g. mary.smith@acme.inc')).toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: 'Full name' })).toHaveAttribute('aria-invalid', 'true')
  })

  it('creates the account when everything is fine', async () => {
    auth.register.mockResolvedValue()
    const user = userEvent.setup()
    renderWith(<RegisterPage />, { route: '/register' })
    await fill(user)
    await waitFor(() => expect(auth.register).toHaveBeenCalledWith('Mary Smith', 'mary@acme.inc', 'password1'))
  })
})
