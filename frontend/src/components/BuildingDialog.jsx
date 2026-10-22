// Add or edit a building (pass `building` to edit). When adding, it also asks how many floors
// the building has and shows one row per floor: its name (pre-filled "Floor 1", "Floor 2"...)
// and how many seats it has. The API creates the floors and seats (HQ-1-01, HQ-1-02...) together.

import { useState } from 'react'
import {
  Alert, Box, Button, Dialog, DialogActions, DialogContent, DialogTitle, Divider, Stack, TextField, Typography,
} from '@mui/material'
import PhoneField from './PhoneField'

const MAX_FLOORS = 100 // the API's limit: every floor and its seats are made in one request

const FIELDS = [
  { name: 'code', label: 'Code', hint: '2 to 6 letters or numbers, e.g. HQ. Seat codes start with it.' },
  { name: 'name', label: 'Name', hint: 'Letters, numbers, spaces and hyphens, e.g. North Tower' },
  { name: 'address', label: 'Address', hint: "Letters, numbers, spaces and , . - # / '" },
  { name: 'manager_name', label: 'Building manager', optional: true, hint: 'Their full name, e.g. Mary Smith' },
  { name: 'manager_email', label: 'Manager email', optional: true, type: 'email', hint: 'Their @acme.inc email' },
]

// The floor rows for a new building: keeps rows already typed in and adds or drops the rest.
function resize(floors, count) {
  return Array.from({ length: count }, (_, i) => floors[i] || { name: `Floor ${i + 1}`, seats: 20 })
}

export default function BuildingDialog({ building, onSave, onClose }) {
  const isNew = !building
  const [values, setValues] = useState(() => Object.fromEntries(
    [...FIELDS.map((f) => f.name), 'manager_phone'].map((name) => [name, building?.[name] ?? '']),
  ))
  const [floorCount, setFloorCount] = useState(3)
  const [floors, setFloors] = useState(() => resize([], 3))
  const [fieldErrors, setFieldErrors] = useState({})
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  function changeFloorCount(text) {
    setFloorCount(text)
    const count = Number(text)
    if (Number.isInteger(count) && count >= 1 && count <= MAX_FLOORS) setFloors(resize(floors, count))
  }

  function changeFloor(index, field, value) {
    setFloors(floors.map((floor, i) => (i === index ? { ...floor, [field]: value } : floor)))
  }

  async function handleSubmit(event) {
    event.preventDefault()
    setSaving(true)
    setError('')
    setFieldErrors({})
    const body = { ...values }
    if (isNew) body.floors = floors.map((f) => ({ name: f.name, seats: Number(f.seats) || 0 }))
    try {
      await onSave(body)
      onClose()
    } catch (err) {
      setFieldErrors(err.details || {})
      if (!err.details || Object.keys(err.details).length === 0) setError(err.message)
      setSaving(false)
    }
  }

  // The number of floors must be a whole number from 1 to MAX_FLOORS before it can be saved.
  const count = Number(floorCount)
  const badFloorCount = !(Number.isInteger(count) && count >= 1 && count <= MAX_FLOORS)

  const totalSeats = floors.reduce((sum, f) => sum + (Number(f.seats) || 0), 0)

  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="sm">
      <form onSubmit={handleSubmit} noValidate>
        <DialogTitle>{isNew ? 'Add building' : `Edit ${building.name}`}</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ pt: 1 }}>
            {error && <Alert severity="error">{error}</Alert>}
            {FIELDS.map((field, index) => (
              <TextField key={field.name} label={field.label} type={field.type || 'text'} required={!field.optional}
                value={values[field.name]} autoFocus={index === 0}
                onChange={(e) => setValues({ ...values, [field.name]: e.target.value })}
                error={Boolean(fieldErrors[field.name])}
                helperText={fieldErrors[field.name] || [field.optional && 'Optional', field.hint].filter(Boolean).join('. ')} />
            ))}
            <PhoneField label="Manager phone" value={values.manager_phone}
              onChange={(phone) => setValues({ ...values, manager_phone: phone })}
              error={Boolean(fieldErrors.manager_phone)} helperText={fieldErrors.manager_phone || 'Optional'} />
            {!isNew && (
              <Typography variant="body2" color="text.secondary">
                Changing the code doesn't rename seats that already exist. Floors are edited in the Floors column.
              </Typography>
            )}

            {isNew && (
              <>
                <Divider />
                <TextField label="Number of floors" type="number" required value={floorCount}
                  onChange={(e) => changeFloorCount(e.target.value)} slotProps={{ htmlInput: { min: 1, max: MAX_FLOORS } }}
                  error={badFloorCount || Boolean(fieldErrors.floors)}
                  helperText={badFloorCount ? `1 to ${MAX_FLOORS} floors`
                    : fieldErrors.floors || `1 to ${MAX_FLOORS}. You can rename floors and change seats below.`} />
                <Typography variant="body2" color="text.secondary">
                  {floors.length} {floors.length === 1 ? 'floor' : 'floors'}, {totalSeats} seats. Seats are numbered
                  {values.code ? ` ${values.code.toUpperCase()}-1-01, ${values.code.toUpperCase()}-1-02…` : ' CODE-1-01, CODE-1-02…'}
                </Typography>
                <Box sx={{ display: 'grid', gap: 1.5, maxHeight: 320, overflowY: 'auto', pt: 1 }}>
                  {floors.map((floor, i) => (
                    <Box key={i} sx={{ display: 'grid', gridTemplateColumns: '1fr 110px', gap: 1.5 }}>
                      <TextField size="small" label={`Level ${i + 1} name`} value={floor.name}
                        onChange={(e) => changeFloor(i, 'name', e.target.value)}
                        error={Boolean(fieldErrors[`floors.${i}.name`])} helperText={fieldErrors[`floors.${i}.name`]} />
                      <TextField size="small" label="Seats" type="number" value={floor.seats}
                        onChange={(e) => changeFloor(i, 'seats', e.target.value)} slotProps={{ htmlInput: { min: 0, max: 500 } }}
                        error={Boolean(fieldErrors[`floors.${i}.seats`])} helperText={fieldErrors[`floors.${i}.seats`]} />
                    </Box>
                  ))}
                </Box>
              </>
            )}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={onClose}>Cancel</Button>
          <Button type="submit" variant="contained" disabled={saving || (isNew && badFloorCount)}>{saving ? 'Saving…' : 'Save'}</Button>
        </DialogActions>
      </form>
    </Dialog>
  )
}
