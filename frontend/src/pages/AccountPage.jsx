// My account: who you are, change your password, and (for engineers) your availability.

import { useEffect, useState } from 'react'
import {
  Alert, Button, Paper, Snackbar, Stack, TextField, ToggleButton, ToggleButtonGroup, Typography,
} from '@mui/material'
import Layout from '../components/Layout'
import { api } from '../services/api'
import { useAuth } from '../services/AuthContext'
import { AVAILABILITY_NAMES, ROLE_NAMES } from '../roles'

const NO_PASSWORDS = { current_password: '', new_password: '', confirm: '' }

function AvailabilityCard({ onMessage }) {
  const [availability, setAvailability] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    api('users', '/engineers/me').then((me) => setAvailability(me.availability)).catch((err) => setError(err.message))
  }, [])

  async function change(value) {
    if (!value) return // clicking the selected button again
    try {
      const me = await api('users', '/engineers/me/availability', { method: 'PUT', body: { availability: value } })
      setAvailability(me.availability)
      onMessage(`You are now ${AVAILABILITY_NAMES[me.availability].toLowerCase()}`)
    } catch (err) {
      setError(err.message)
    }
  }

  return (
    <Paper variant="outlined" sx={{ p: 3 }}>
      <Typography variant="h6" component="h2" gutterBottom>Availability</Typography>
      <Typography color="text.secondary" sx={{ mb: 2 }}>Admins see this when they assign tickets.</Typography>
      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
      <ToggleButtonGroup exclusive color="primary" value={availability} onChange={(e, value) => change(value)}>
        {Object.entries(AVAILABILITY_NAMES).map(([value, name]) => <ToggleButton key={value} value={value}>{name}</ToggleButton>)}
      </ToggleButtonGroup>
    </Paper>
  )
}

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
      label, type: 'password', required: true, value: passwords[name],
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

        {user.role === 'engineer' && <AvailabilityCard onMessage={setMessage} />}

        <Paper variant="outlined" sx={{ p: 3 }}>
          <Typography variant="h6" component="h2" gutterBottom>Change password</Typography>
          <Stack component="form" spacing={2} onSubmit={changePassword} noValidate>
            {error && <Alert severity="error">{error}</Alert>}
            <TextField autoComplete="current-password" {...passwordProps('current_password', 'Current password')} />
            <TextField autoComplete="new-password" {...passwordProps('new_password', 'New password', 'At least 8 characters')} />
            <TextField autoComplete="new-password" {...passwordProps('confirm', 'Confirm new password')} />
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
