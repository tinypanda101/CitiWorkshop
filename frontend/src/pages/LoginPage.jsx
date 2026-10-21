import { useState } from 'react'
import { Link as RouterLink, Navigate, useNavigate } from 'react-router-dom'
import { Alert, Button, Link, Stack, TextField, Typography } from '@mui/material'
import AuthCard from '../components/AuthCard'
import { useAuth } from '../services/AuthContext'

export default function LoginPage() {
  const { user, login } = useAuth()
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  if (user) return <Navigate to="/" replace />

  async function handleSubmit(event) {
    event.preventDefault()
    setError('')
    setSaving(true)
    try {
      await login(email, password)
      navigate('/')
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <AuthCard title="Log in">
      <Stack component="form" spacing={2} onSubmit={handleSubmit} noValidate>
        {error && <Alert severity="error">{error}</Alert>}
        <TextField label="Email" type="email" autoComplete="email" value={email}
          onChange={(e) => setEmail(e.target.value)} required autoFocus />
        <TextField label="Password" type="password" autoComplete="current-password" value={password}
          onChange={(e) => setPassword(e.target.value)} required />
        <Button type="submit" variant="contained" size="large" disabled={saving}>
          {saving ? 'Logging in…' : 'Log in'}
        </Button>
        <Typography variant="body2" color="text.secondary">
          New here? <Link component={RouterLink} to="/register">Create an account</Link>
        </Typography>
      </Stack>
    </AuthCard>
  )
}
