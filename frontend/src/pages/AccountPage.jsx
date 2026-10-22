// My account: who you are and changing your password. (Engineers set their availability in the top bar.)

import { useState } from 'react'
import { Alert, Button, Paper, Snackbar, Stack, Typography } from '@mui/material'
import Layout from '../components/Layout'
import PasswordField from '../components/PasswordField'
import { api } from '../services/api'
import { useAuth } from '../services/AuthContext'
import { ROLE_NAMES } from '../roles'

const NO_PASSWORDS = { current_password: '', new_password: '', confirm: '' }

export default function AccountPage() {
  const { user } = useAuth()
  const [passwords, setPasswords] = useState(NO_PASSWORDS)
  const [fieldErrors, setFieldErrors] = useState({})
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')

  async function changePassword(event) {
    event.preventDefault()
    setError('')
    setFieldErrors({})
    if (passwords.new_password !== passwords.confirm) {
      setFieldErrors({ confirm: "Doesn't match the new password" })
      return
    }
    setSaving(true)
    try {
      await api('auth', '/password', {
        method: 'PUT',
        body: { current_password: passwords.current_password, new_password: passwords.new_password },
      })
      setPasswords(NO_PASSWORDS)
      setMessage('Password changed')
    } catch (err) {
      setFieldErrors(err.details || {})
      if (!err.details || Object.keys(err.details).length === 0) setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  function passwordProps(name, label, hint) {
    return {
      label, required: true, value: passwords[name],
      onChange: (e) => setPasswords({ ...passwords, [name]: e.target.value }),
      error: Boolean(fieldErrors[name]), helperText: fieldErrors[name] || hint,
    }
  }

  return (
    <Layout>
      <Typography variant="h4" component="h1" sx={{ mb: 2 }}>My account</Typography>
      <Stack spacing={2} sx={{ maxWidth: 560 }}>
        <Paper variant="outlined" sx={{ p: 3 }}>
          <Typography variant="h6" component="h2">{user.full_name}</Typography>
          <Typography color="text.secondary">{user.email} · {ROLE_NAMES[user.role]}</Typography>
        </Paper>

        <Paper variant="outlined" sx={{ p: 3 }}>
          <Typography variant="h6" component="h2" gutterBottom>Change password</Typography>
          <Stack component="form" spacing={2} onSubmit={changePassword} noValidate>
            {error && <Alert severity="error">{error}</Alert>}
            <PasswordField autoComplete="current-password" {...passwordProps('current_password', 'Current password')} />
            <PasswordField autoComplete="new-password" {...passwordProps('new_password', 'New password', 'At least 8 characters')} />
            <PasswordField autoComplete="new-password" {...passwordProps('confirm', 'Confirm new password')} />
            <Button type="submit" variant="contained" disabled={saving} sx={{ alignSelf: 'flex-start' }}>
              {saving ? 'Saving…' : 'Change password'}
            </Button>
          </Stack>
        </Paper>
      </Stack>

      <Snackbar open={!!message} message={message} autoHideDuration={4000} onClose={() => setMessage('')}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }} />
    </Layout>
  )
}
