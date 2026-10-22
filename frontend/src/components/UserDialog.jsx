// Add or edit an account (pass `account` to edit). Sub-specialty and phone only show when
// the role is Engineer. The sub-specialty is a ticket category: auto-assign gives them those tickets. `onSaved` runs after the API accepts it.

import { useEffect, useState } from 'react'
import {
  Alert, Button, DialogActions, DialogContent, DialogTitle, FormControlLabel, ListSubheader, MenuItem, Stack, Switch, TextField,
} from '@mui/material'
import Dialog from './ResponsiveDialog' // full screen on phones
import PasswordField from './PasswordField'
import PhoneField from './PhoneField'
import { api } from '../services/api'
import { ROLE_NAMES, SPECIALTY_NAMES } from '../roles'

const EMPTY = { email: '', full_name: '', password: '', role: 'employee', is_active: true, category_id: '', phone: '' }

export default function UserDialog({ account, onSaved, onClose }) {
  const isNew = !account
  const [values, setValues] = useState(() => (account
    ? Object.fromEntries(Object.keys(EMPTY).map((key) => [key, account[key] ?? '']))
    : EMPTY))
  const [fieldErrors, setFieldErrors] = useState({})
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const [categories, setCategories] = useState([])

  useEffect(() => {
    api('facilities', '/categories').then(setCategories).catch((err) => setError(err.message))
  }, [])

  const isEngineer = values.role === 'engineer'
  // Warn before an engineer stops being one: their unfinished tickets lose their engineer.
  const losesEngineer = account?.role === 'engineer' && (!isEngineer || !values.is_active)

  function change(field, value) {
    setValues({ ...values, [field]: value })
  }

  async function handleSubmit(event) {
    event.preventDefault()
    setSaving(true)
    setError('')
    setFieldErrors({})
    const body = { ...values, category_id: isEngineer ? values.category_id || null : null }
    if (!isEngineer) body.phone = null
    if (!isNew) { delete body.email; delete body.password }
    try {
      await api('users', isNew ? '/' : `/${account.id}`, { method: isNew ? 'POST' : 'PUT', body })
      onSaved()
    } catch (err) {
      setFieldErrors(err.details || {})
      if (!err.details || Object.keys(err.details).length === 0) setError(err.message)
      setSaving(false)
    }
  }

  function fieldProps(name, hint) {
    return {
      value: values[name],
      onChange: (e) => change(name, e.target.value),
      error: Boolean(fieldErrors[name]),
      helperText: fieldErrors[name] || hint,
    }
  }

  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="xs">
      <form onSubmit={handleSubmit} noValidate>
        <DialogTitle>{isNew ? 'Add account' : `Edit ${account.full_name}`}</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ pt: 1 }}>
            {error && <Alert severity="error">{error}</Alert>}
            {isNew && <TextField label="Email" type="email" required autoFocus {...fieldProps('email', 'Must end in @acme.inc')} />}
            <TextField label="Full name" required autoFocus={!isNew} {...fieldProps('full_name')} />
            {isNew && (
              <PasswordField label="Starting password" required {...fieldProps('password', 'At least 8 characters. They can change it on My account.')} />
            )}
            <TextField select label="Role" required {...fieldProps('role')}>
              {Object.entries(ROLE_NAMES).map(([value, name]) => <MenuItem key={value} value={value}>{name}</MenuItem>)}
            </TextField>
            {isEngineer && (
              <>
                <TextField select label="Sub-specialty" required
                  {...fieldProps('category_id', 'They are auto-assigned tickets in this category')}>
                  {Object.entries(SPECIALTY_NAMES).flatMap(([type, name]) => [
                    <ListSubheader key={type}>{name}</ListSubheader>,
                    ...categories.filter((c) => c.type === type).map((c) => <MenuItem key={c.id} value={c.id}>{c.name}</MenuItem>),
                  ])}
                </TextField>
                <PhoneField value={values.phone || ''} onChange={(phone) => change('phone', phone)}
                  error={Boolean(fieldErrors.phone)} helperText={fieldErrors.phone || 'Optional'} />
              </>
            )}
            {!isNew && (
              <FormControlLabel label={values.is_active ? 'Active' : 'Deactivated (cannot log in)'}
                control={<Switch checked={values.is_active} onChange={(e) => change('is_active', e.target.checked)} />} />
            )}
            {losesEngineer && (
              <Alert severity="warning">
                Their unfinished tickets go back to Open, to be handed to another engineer.
                {isEngineer && ' Their sub-specialty and phone are kept for when they are reactivated.'}
              </Alert>
            )}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={onClose}>Cancel</Button>
          <Button type="submit" variant="contained" disabled={saving}>{saving ? 'Saving…' : 'Save'}</Button>
        </DialogActions>
      </form>
    </Dialog>
  )
}
