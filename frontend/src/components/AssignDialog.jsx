// Admin popup to assign a ticket to an engineer, or unassign it. Each engineer shows their
// specialty, availability and how many unfinished tickets they already have.

import { useEffect, useState } from 'react'
import {
  Alert, Button, Dialog, DialogActions, DialogContent, DialogTitle, ListItemText, MenuItem, TextField,
} from '@mui/material'
import { api } from '../services/api'
import { AVAILABILITY_NAMES, SPECIALTY_NAMES } from '../roles'

export default function AssignDialog({ ticket, onSaved, onClose }) {
  const [engineers, setEngineers] = useState([])
  const [assigneeId, setAssigneeId] = useState(ticket.assignee_id ?? '')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    api('users', '/engineers').then(setEngineers).catch((err) => setError(err.message))
  }, [])

  async function handleSubmit(event) {
    event.preventDefault()
    setSaving(true)
    setError('')
    try {
      const saved = await api('tickets', `/${ticket.id}/assignee`, {
        method: 'PUT', body: { assignee_id: assigneeId === '' ? null : assigneeId },
      })
      onSaved(saved)
    } catch (err) {
      setError(err.details?.assignee_id || err.message)
      setSaving(false)
    }
  }

  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="xs">
      <form onSubmit={handleSubmit} noValidate>
        <DialogTitle>Assign {ticket.number}</DialogTitle>
        <DialogContent>
          {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
          <TextField select fullWidth label="Engineer" value={assigneeId} sx={{ mt: 1 }}
            onChange={(e) => setAssigneeId(e.target.value)}
            helperText={`This is a ${ticket.category_type} ticket (${ticket.category_name}).`}
            slotProps={{ select: { renderValue: (id) => engineers.find((e) => e.id === id)?.full_name || 'Not assigned' } }}>
            <MenuItem value="">Not assigned</MenuItem>
            {engineers.map((e) => (
              <MenuItem key={e.id} value={e.id}>
                <ListItemText primary={e.full_name}
                  secondary={`${SPECIALTY_NAMES[e.specialty]} · ${AVAILABILITY_NAMES[e.availability]} · ${e.open_tickets} unfinished`} />
              </MenuItem>
            ))}
          </TextField>
        </DialogContent>
        <DialogActions>
          <Button onClick={onClose}>Cancel</Button>
          <Button type="submit" variant="contained" disabled={saving}>{saving ? 'Saving…' : 'Save'}</Button>
        </DialogActions>
      </form>
    </Dialog>
  )
}
