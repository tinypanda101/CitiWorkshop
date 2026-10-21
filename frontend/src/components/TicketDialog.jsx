// The popup for submitting a ticket, also used to edit one (pass `ticket`).
// Building → Floor: the floor list loads once a building is picked. The seat is typed in
// (e.g. HQ-201) and the API checks it is a real seat on that floor.
// `onSaved` gets the saved ticket back from the API.

import { useEffect, useState } from 'react'
import {
  Alert, Button, Dialog, DialogActions, DialogContent, DialogTitle, ListSubheader, MenuItem,
  Stack, TextField, ToggleButton, ToggleButtonGroup, Typography,
} from '@mui/material'
import { api } from '../services/api'
import { useAuth } from '../services/AuthContext'
import { PRIORITY_NAMES } from '../ticketLabels'

const EMPTY = { title: '', description: '', category_id: '', building_id: '', floor_id: '', seat_code: '', priority: 'low' }

// The form keeps '' for "nothing picked"; the API wants null.
function toBody(values, showPriority) {
  const body = { ...values }
  for (const key of ['category_id', 'building_id', 'floor_id']) {
    body[key] = body[key] === '' ? null : body[key]
  }
  if (!showPriority) delete body.priority
  return body
}

export default function TicketDialog({ ticket, onSaved, onClose }) {
  const { user } = useAuth()
  const isNew = !ticket
  // Submitting: Low or Medium. Editing: only admins see priority, with all four levels.
  // (The other priority rules, like asking for High, come in step 6.)
  const priorities = isNew ? ['low', 'medium'] : user.role === 'admin' ? Object.keys(PRIORITY_NAMES) : []
  const showPriority = priorities.length > 0
  // Editing starts from the ticket's own values (only the fields this form has).
  const [values, setValues] = useState(() => (ticket
    ? Object.fromEntries(Object.keys(EMPTY).map((key) => [key, ticket[key] ?? '']))
    : EMPTY))
  const [categories, setCategories] = useState([])
  const [buildings, setBuildings] = useState([])
  const [floors, setFloors] = useState([])
  const [fieldErrors, setFieldErrors] = useState({})
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    Promise.all([api('facilities', '/categories'), api('facilities', '/buildings')])
      .then(([newCategories, newBuildings]) => { setCategories(newCategories); setBuildings(newBuildings) })
      .catch((err) => setError(err.message))
  }, [])

  useEffect(() => {
    if (!values.building_id) return
    api('facilities', `/buildings/${values.building_id}/floors`).then(setFloors).catch((err) => setError(err.message))
  }, [values.building_id])

  function change(field, value) {
    const next = { ...values, [field]: value }
    // Picking another building clears the floor, which belongs to the old one.
    if (field === 'building_id') { next.floor_id = ''; setFloors([]) }
    setValues(next)
  }

  async function handleSubmit(event) {
    event.preventDefault()
    setSaving(true)
    setError('')
    setFieldErrors({})
    try {
      const saved = await api('tickets', isNew ? '/' : `/${ticket.id}`, {
        method: isNew ? 'POST' : 'PUT', body: toBody(values, showPriority),
      })
      onSaved(saved)
    } catch (err) {
      setFieldErrors(err.details || {})
      if (!err.details || Object.keys(err.details).length === 0) setError(err.message)
      setSaving(false)
    }
  }

  // One field's props: its value, change handler and error message.
  function fieldProps(name, hint) {
    return {
      value: values[name],
      onChange: (e) => change(name, e.target.value),
      error: Boolean(fieldErrors[name]),
      helperText: fieldErrors[name] || hint,
    }
  }

  // Categories grouped under "Facility" and "Technology" headings.
  const categoryItems = ['facility', 'technology'].flatMap((type) => [
    <ListSubheader key={type}>{type === 'facility' ? 'Facility' : 'Technology'}</ListSubheader>,
    ...categories.filter((c) => c.type === type).map((c) => <MenuItem key={c.id} value={c.id}>{c.name}</MenuItem>),
  ])

  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="sm">
      <form onSubmit={handleSubmit} noValidate>
        <DialogTitle>{isNew ? 'Submit a ticket' : `Edit ${ticket.number}`}</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ pt: 1 }}>
            {error && <Alert severity="error">{error}</Alert>}
            <TextField label="Title" required autoFocus {...fieldProps('title', 'A short summary, e.g. "Wi-Fi keeps dropping"')} />
            <TextField label="Description" required multiline minRows={3}
              {...fieldProps('description', 'What is wrong, and since when?')} />
            <TextField select label="Category" required {...fieldProps('category_id')}>{categoryItems}</TextField>
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
              <TextField select label="Building" required fullWidth {...fieldProps('building_id')}>
                {buildings.map((b) => <MenuItem key={b.id} value={b.id}>{b.name}</MenuItem>)}
              </TextField>
              <TextField select label="Floor" required fullWidth disabled={!values.building_id} {...fieldProps('floor_id')}>
                {floors.map((f) => <MenuItem key={f.id} value={f.id}>{f.name}</MenuItem>)}
              </TextField>
              <TextField label="Seat" fullWidth disabled={!values.floor_id} {...fieldProps('seat_code', 'Optional, e.g. HQ-201')} />
            </Stack>
            {showPriority && (
              <div>
                <Typography variant="body2" color="text.secondary" gutterBottom>Priority</Typography>
                <ToggleButtonGroup exclusive size="small" color="primary" value={values.priority}
                  onChange={(e, value) => value && change('priority', value)}>
                  {priorities.map((p) => <ToggleButton key={p} value={p}>{PRIORITY_NAMES[p]}</ToggleButton>)}
                </ToggleButtonGroup>
                {isNew && (
                  <Typography variant="caption" color="text.secondary" display="block" sx={{ mt: 0.5 }}>
                    Need it treated as High or Critical? You can request that on the ticket once it's submitted.
                  </Typography>
                )}
              </div>
            )}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={onClose}>Cancel</Button>
          <Button type="submit" variant="contained" disabled={saving}>
            {saving ? 'Saving…' : isNew ? 'Submit' : 'Save'}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  )
}
