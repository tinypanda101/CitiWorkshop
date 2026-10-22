// Admin popup to set a new password for someone who forgot theirs (the app sends no emails).
// The admin types the account's email; nothing changes unless an account uses it. `onReset`
// gets the API's reply, which names whose password it was.

import { useState } from 'react'
import { Alert, Button, DialogActions, DialogContent, DialogTitle, Stack, TextField } from '@mui/material'
import Dialog from './ResponsiveDialog' // full screen on phones
import PasswordField from './PasswordField'
import { api } from '../services/api'

export default function PasswordResetDialog({ onReset, onClose }) {
  const [values, setValues] = useState({ email: '', new_password: '', confirm: '' })
  const [fieldErrors, setFieldErrors] = useState({})
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  async function handleSubmit(event) {
    event.preventDefault()
    setError('')
    setFieldErrors({})
    if (values.new_password !== values.confirm) {
      setFieldErrors({ confirm: "Doesn't match the new password" })
      return
    }
    setSaving(true)
    try {
      onReset(await api('users', '/password-reset', {
        method: 'PUT', body: { email: values.email, new_password: values.new_password },
      }))
    } catch (err) {
      setFieldErrors(err.details || {})
      if (!err.details || Object.keys(err.details).length === 0) setError(err.message)
      setSaving(false)
    }
  }

  function fieldProps(name, hint) {
    return {
      value: values[name],
      onChange: (e) => setValues({ ...values, [name]: e.target.value }),
      error: Boolean(fieldErrors[name]),
      helperText: fieldErrors[name] || hint,
    }
  }

  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="xs">
      <form onSubmit={handleSubmit} noValidate>
        <DialogTitle>Reset a password</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ pt: 1 }}>
            {error && <Alert severity="error">{error}</Alert>}
            <TextField label="Email" type="email" required autoFocus {...fieldProps('email', 'The email they log in with')} />
            <PasswordField label="New password" required autoComplete="new-password"
              {...fieldProps('new_password', 'At least 8 characters. Tell them, and they can change it on My account.')} />
            <PasswordField label="Confirm new password" required autoComplete="new-password" {...fieldProps('confirm')} />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={onClose}>Cancel</Button>
          <Button type="submit" variant="contained" disabled={saving}>{saving ? 'Saving…' : 'Reset password'}</Button>
        </DialogActions>
      </form>
    </Dialog>
  )
}
