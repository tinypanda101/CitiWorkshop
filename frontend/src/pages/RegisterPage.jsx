import { useState } from 'react'
import { Link as RouterLink, Navigate, useNavigate } from 'react-router-dom'
import { Alert, Button, Link, Stack, TextField, Typography } from '@mui/material'
import AuthCard from '../components/AuthCard'
import PasswordField from '../components/PasswordField'
import { useAuth } from '../services/AuthContext'

export default function RegisterPage() {
  const { user, register } = useAuth()
  const navigate = useNavigate()
  const [form, setForm] = useState({ fullName: '', email: '', password: '', confirm: '' })
  const [fieldErrors, setFieldErrors] = useState({})
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  if (user) return <Navigate to="/" replace />

  function update(field) {
    return (e) => setForm({ ...form, [field]: e.target.value })
  }

  async function handleSubmit(event) {
    event.preventDefault()
    setError('')
    setFieldErrors({})
    if (form.password !== form.confirm) {
      setFieldErrors({ confirm: 'Passwords do not match' })
      return
    }
    setSaving(true)
    try {
      await register(form.fullName, form.email, form.password)
      navigate('/')
    } catch (err) {
      // The API names the field for each problem, e.g. { email: 'Must be an @acme.inc email, e.g. …' }.
      setFieldErrors({ ...err.details, fullName: err.details.full_name })
      if (Object.keys(err.details).length === 0) setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <AuthCard title="Create an account">
      <Stack component="form" spacing={2} onSubmit={handleSubmit} noValidate>
        {error && <Alert severity="error">{error}</Alert>}
        <TextField label="Full name" autoComplete="name" value={form.fullName} onChange={update('fullName')}
          error={Boolean(fieldErrors.fullName)} helperText={fieldErrors.fullName} required autoFocus />
        <TextField label="Email" type="email" autoComplete="email" value={form.email} onChange={update('email')}
          error={Boolean(fieldErrors.email)} helperText={fieldErrors.email || 'Use your @acme.inc address'} required />
        <PasswordField label="Password" autoComplete="new-password" value={form.password} onChange={update('password')}
          error={Boolean(fieldErrors.password)} helperText={fieldErrors.password || 'At least 8 characters'} required />
        <PasswordField label="Confirm password" autoComplete="new-password" value={form.confirm} onChange={update('confirm')}
          error={Boolean(fieldErrors.confirm)} helperText={fieldErrors.confirm} required />
        <Button type="submit" variant="contained" size="large" disabled={saving}>
          {saving ? 'Creating account…' : 'Create account'}
        </Button>
        <Typography variant="body2" color="text.secondary">
          Already have an account? <Link component={RouterLink} to="/login">Log in</Link>
        </Typography>
      </Stack>
    </AuthCard>
  )
}
