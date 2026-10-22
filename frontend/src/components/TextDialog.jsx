// A small popup asking for one piece of text, e.g. why a ticket is blocked.
// `children` can add more fields above the text box (used by the escalation request).
// `onSave(text)` may throw an ApiError; its message is shown in the popup.

import { useState } from 'react'
import { Alert, Button, DialogActions, DialogContent, DialogTitle, Stack, TextField } from '@mui/material'
import Dialog from './ResponsiveDialog' // full screen on phones

export default function TextDialog({ title, label, saveLabel = 'Save', onSave, onClose, children }) {
  const [text, setText] = useState('')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  async function handleSubmit(event) {
    event.preventDefault()
    setSaving(true)
    setError('')
    try {
      await onSave(text)
    } catch (err) {
      setError(Object.values(err.details || {})[0] || err.message)
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
            {children}
            <TextField label={label} required multiline minRows={2} autoFocus value={text}
              onChange={(e) => setText(e.target.value)} />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={onClose}>Cancel</Button>
          <Button type="submit" variant="contained" disabled={saving}>{saving ? 'Saving…' : saveLabel}</Button>
        </DialogActions>
      </form>
    </Dialog>
  )
}
