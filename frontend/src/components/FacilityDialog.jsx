// One add/edit dialog for buildings, floors and seats. The page passes in which fields
// to show; `onSave` sends them to the API and may throw an ApiError with field messages.

import { useState } from 'react'
import { Alert, Button, DialogActions, DialogContent, DialogTitle, Stack, TextField } from '@mui/material'
import Dialog from './ResponsiveDialog' // full screen on phones

export default function FacilityDialog({ title, fields, initial, onSave, onClose }) {
  const [values, setValues] = useState(initial)
  const [fieldErrors, setFieldErrors] = useState({})
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  async function handleSubmit(event) {
    event.preventDefault()
    setSaving(true)
    setError('')
    setFieldErrors({})
    try {
      await onSave(values)
      onClose()
    } catch (err) {
      setFieldErrors(err.details || {})
      if (!err.details || Object.keys(err.details).length === 0) setError(err.message)
      setSaving(false)
    }
  }

  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="xs">
      <form onSubmit={handleSubmit} noValidate>
        <DialogTitle>{title}</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ pt: 1 }}>
            {error && <Alert severity="error">{error}</Alert>}
            {fields.map((field, index) => (
              <TextField key={field.name} label={field.label} type={field.type || 'text'}
                value={values[field.name] ?? ''} autoFocus={index === 0} required={!field.optional}
                onChange={(e) => setValues({ ...values, [field.name]: e.target.value })}
                error={Boolean(fieldErrors[field.name])} helperText={fieldErrors[field.name] || field.hint} />
            ))}
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
