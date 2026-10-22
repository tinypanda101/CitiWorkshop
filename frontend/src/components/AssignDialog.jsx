// Admin popup to assign a ticket to an engineer, or unassign it. Engineers whose sub-specialty
// matches the ticket's category come first (least busy first); each shows their sub-specialty,
// availability and how many unfinished tickets they already have.
// Auto-assign hands it to whoever automatic assigning would pick (least busy matching engineer).

import { useEffect, useState } from 'react'
import {
  Alert, Button, Dialog, DialogActions, DialogContent, DialogTitle, ListItemText, ListSubheader, MenuItem, TextField,
} from '@mui/material'
import { api } from '../services/api'
import { AVAILABILITY_NAMES } from '../roles'

export default function AssignDialog({ ticket, onSaved, onClose }) {
  const [engineers, setEngineers] = useState([])
  const [assigneeId, setAssigneeId] = useState(ticket.assignee_id ?? '')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    api('users', '/engineers').then(setEngineers).catch((err) => setError(err.message))
  }, [])

  const byLoad = (a, b) => a.open_tickets - b.open_tickets
  const matching = engineers.filter((e) => e.category_name === ticket.category_name).sort(byLoad)
  const others = engineers.filter((e) => e.category_name !== ticket.category_name)

  function option(e) {
    return (
      <MenuItem key={e.id} value={e.id}>
        <ListItemText primary={e.full_name}
          secondary={`${e.category_name} · ${AVAILABILITY_NAMES[e.availability]} · ${e.open_tickets} unfinished`} />
      </MenuItem>
    )
  }

  async function autoAssign() {
    setSaving(true)
    setError('')
    try {
      onSaved(await api('tickets', `/${ticket.id}/auto-assign`, { method: 'POST' }))
    } catch (err) {
      setError(err.message)
      setSaving(false)
    }
  }

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
            helperText={`This is a ${ticket.category_name} ticket. Auto-assign picks the least busy ${ticket.category_name} engineer.`}
            slotProps={{ select: { renderValue: (id) => engineers.find((e) => e.id === id)?.full_name || 'Not assigned' } }}>
            <MenuItem value="">Not assigned</MenuItem>
            <ListSubheader>Matches this ticket</ListSubheader>
            {matching.map(option)}
            <ListSubheader>Other engineers</ListSubheader>
            {others.map(option)}
          </TextField>
        </DialogContent>
        <DialogActions>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="outlined" onClick={autoAssign} disabled={saving}>Auto-assign</Button>
          <Button type="submit" variant="contained" disabled={saving}>{saving ? 'Saving…' : 'Save'}</Button>
        </DialogActions>
      </form>
    </Dialog>
  )
}
