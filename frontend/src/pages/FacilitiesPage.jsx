// Admin page for buildings → floors → seats, in three linked columns.
// Pick a building to see its floors; pick a floor to see its seats. A new building comes with
// its floors and seats (BuildingDialog); a new floor can come with seats, and seats can be
// added to a floor several at a time.

import { useEffect, useState } from 'react'
import {
  Alert, Box, Button, Dialog, DialogActions, DialogContent, DialogContentText, DialogTitle,
  Link, List, ListItemButton, ListItemText, Paper, Snackbar, Stack, Typography,
} from '@mui/material'
import Layout from '../components/Layout'
import BuildingDialog from '../components/BuildingDialog'
import FacilityDialog from '../components/FacilityDialog'
import { formatPhone } from '../phone'
import { api } from '../services/api'

// Everything that differs between buildings, floors and seats.
const KINDS = {
  building: {
    noun: 'building',
    primary: (b) => `${b.name} (${b.code})`,
    secondary: (b) => `${b.address} · ${b.floor_count} ${b.floor_count === 1 ? 'floor' : 'floors'}`,
    label: (b) => b.name,
    deleteNote: 'Its floors and seats will be deleted too.',
  },
  floor: {
    noun: 'floor',
    fields: [
      { name: 'level', label: 'Level', type: 'number', hint: '0 = ground, negative = basement' },
      { name: 'name', label: 'Name', hint: 'Letters, numbers, spaces and hyphens, e.g. Floor 2' },
    ],
    addFields: [ // adding a floor also asks how many seats it has
      { name: 'level', label: 'Level', type: 'number', hint: '0 = ground, negative = basement' },
      { name: 'name', label: 'Name', hint: 'Letters, numbers, spaces and hyphens, e.g. Floor 2' },
      { name: 'seats', label: 'Number of seats', type: 'number', optional: true, hint: 'Numbered automatically, e.g. HQ-2-01, HQ-2-02… (0 to 500)' },
    ],
    primary: (f) => f.name,
    secondary: (f) => `Level ${f.level} · ${f.seat_count} ${f.seat_count === 1 ? 'seat' : 'seats'}`,
    label: (f) => f.name,
    deleteNote: 'Its seats will be deleted too.',
  },
  seat: {
    noun: 'seat',
    fields: [{ name: 'code', label: 'Seat code', hint: 'Letters, numbers and hyphens, e.g. HQ-2-01' }],
    primary: (s) => s.code,
    secondary: () => null,
    label: (s) => s.code,
    deleteNote: '',
  },
}

// Adding several seats to a floor at once.
const ADD_SEATS_FIELDS = [
  { name: 'count', label: 'How many seats?', type: 'number', hint: 'Numbered after the seats the floor already has' },
]

function FacilityColumn({ title, kind, items, selectedId, onSelect, onAdd, onAddMany, onEdit, onDelete, emptyText }) {
  const config = KINDS[kind]
  return (
    <Paper variant="outlined" sx={{ flex: 1, minWidth: 0 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, px: 2, py: 1.5, borderBottom: 1, borderColor: 'divider' }}>
        <Typography variant="subtitle1" component="h2" sx={{ flexGrow: 1, fontWeight: 500 }}>{title}</Typography>
        {onAddMany && <Button size="small" variant="outlined" onClick={onAddMany}>+ Add several</Button>}
        <Button size="small" variant="contained" onClick={onAdd} disabled={!onAdd}>+ Add</Button>
      </Box>
      {items === null ? (
        <Typography color="text.secondary" sx={{ p: 2 }}>{emptyText}</Typography>
      ) : items.length === 0 ? (
        <Typography color="text.secondary" sx={{ p: 2 }}>None yet.</Typography>
      ) : (
        <List disablePadding>
          {items.map((item) => (
            <ListItemButton key={item.id} selected={item.id === selectedId} divider
              onClick={onSelect ? () => onSelect(item) : undefined} disableRipple={!onSelect}
              sx={{ cursor: onSelect ? 'pointer' : 'default' }}>
              <ListItemText primary={config.primary(item)} secondary={config.secondary(item)} />
              <Stack direction="row" spacing={1.5} onClick={(e) => e.stopPropagation()}>
                <Link component="button" variant="body2" onClick={() => onEdit(item)}>Edit</Link>
                <Link component="button" variant="body2" color="error" onClick={() => onDelete(item)}>Delete</Link>
              </Stack>
            </ListItemButton>
          ))}
        </List>
      )}
    </Paper>
  )
}

export default function FacilitiesPage() {
  const [buildings, setBuildings] = useState([])
  const [floors, setFloors] = useState(null) // null = no building picked yet
  const [seats, setSeats] = useState(null) // null = no floor picked yet
  const [building, setBuilding] = useState(null)
  const [floor, setFloor] = useState(null)
  const [editing, setEditing] = useState(null) // { kind, item } — item is null when adding
  const [deleting, setDeleting] = useState(null) // { kind, item }
  const [error, setError] = useState('')
  const [message, setMessage] = useState('') // short pop-up, e.g. "Floor 2 was deleted"

  async function loadFloors(buildingId) {
    setFloors(await api('facilities', `/buildings/${buildingId}/floors`))
  }
  async function loadSeats(floorId) {
    setSeats(await api('facilities', `/floors/${floorId}/seats`))
  }

  useEffect(() => {
    api('facilities', '/buildings').then(setBuildings).catch((err) => setError(err.message))
  }, [])

  function pickBuilding(item) {
    setBuilding(item)
    setFloor(null)
    setSeats(null)
    loadFloors(item.id).catch((err) => setError(err.message))
  }

  function pickFloor(item) {
    setFloor(item)
    loadSeats(item.id).catch((err) => setError(err.message))
  }

  // Reload whatever a change could affect (lists, the counts shown in them, and the
  // picked building / floor, in case one of them was just renamed).
  async function refresh() {
    const newBuildings = await api('facilities', '/buildings')
    setBuildings(newBuildings)
    if (building) {
      setBuilding(newBuildings.find((b) => b.id === building.id) || null)
      const newFloors = await api('facilities', `/buildings/${building.id}/floors`)
      setFloors(newFloors)
      if (floor) setFloor(newFloors.find((f) => f.id === floor.id) || null)
    }
    if (floor) await loadSeats(floor.id)
  }

  // Editing: PUT /buildings/1, /floors/1 or /seats/1.
  // Adding: POST /buildings, or under the building / floor that is picked.
  function savePath(kind, item) {
    if (item) return `/${kind}s/${item.id}`
    if (kind === 'floor') return `/buildings/${building.id}/floors`
    if (kind === 'seat') return `/floors/${floor.id}/seats`
    if (kind === 'seats') return `/floors/${floor.id}/seats/bulk`
    return '/buildings'
  }

  async function save(kind, item, values) {
    const body = kind === 'floor' && !item ? { ...values, seats: Number(values.seats) || 0 } : values // empty box = no seats
    await api('facilities', savePath(kind, item), { method: item ? 'PUT' : 'POST', body })
    await refresh()
    if (kind === 'seats') setMessage(`${values.count} seats added to ${floor.name}`)
  }

  // After a delete, go back to nothing picked and reload the buildings.
  async function confirmDelete() {
    const { kind, item } = deleting
    setDeleting(null)
    setError('')
    try {
      await api('facilities', `/${kind}s/${item.id}`, { method: 'DELETE' })
      setBuilding(null); setFloors(null); setFloor(null); setSeats(null)
      setBuildings(await api('facilities', '/buildings'))
      setMessage(`${KINDS[kind].label(item)} was deleted`)
    } catch (err) {
      setError(err.message) // e.g. "Can't delete Floor 2. 3 tickets are linked to it."
    }
  }

  // Floors and seats use the simple FacilityDialog; buildings and "add several seats" have their own.
  const editingConfig = ['floor', 'seat'].includes(editing?.kind) && KINDS[editing.kind]

  return (
    <Layout>
      <Typography variant="h4" component="h1" sx={{ mb: 1 }}>Facilities</Typography>
      <Typography color="text.secondary" sx={{ mb: 2 }}>
        Pick a building to see its floors, then a floor to see its seats.
      </Typography>
      {error && <Alert severity="error" onClose={() => setError('')} sx={{ mb: 2 }}>{error}</Alert>}
      {building && (
        <Paper variant="outlined" sx={{ p: 2, mb: 2 }}>
          <Typography sx={{ fontWeight: 500 }}>{building.name} ({building.code})</Typography>
          <Typography variant="body2" color="text.secondary">{building.address}</Typography>
          <Typography variant="body2" sx={{ mt: 0.5 }}>
            Building manager: {[building.manager_name, building.manager_email, formatPhone(building.manager_phone)].filter(Boolean).join(' · ') || 'not set'}
          </Typography>
        </Paper>
      )}

      <Stack direction={{ xs: 'column', md: 'row' }} spacing={2} alignItems="flex-start">
        <FacilityColumn title="Buildings" kind="building" items={buildings} selectedId={building?.id}
          onSelect={pickBuilding} onAdd={() => setEditing({ kind: 'building', item: null })}
          onEdit={(item) => setEditing({ kind: 'building', item })}
          onDelete={(item) => setDeleting({ kind: 'building', item })} />
        <FacilityColumn title={building ? `Floors in ${building.name}` : 'Floors'} kind="floor" items={floors}
          selectedId={floor?.id} onSelect={pickFloor} emptyText="Pick a building first."
          onAdd={building ? () => setEditing({ kind: 'floor', item: null }) : null}
          onEdit={(item) => setEditing({ kind: 'floor', item })}
          onDelete={(item) => setDeleting({ kind: 'floor', item })} />
        <FacilityColumn title={floor ? `Seats on ${floor.name}` : 'Seats'} kind="seat" items={seats}
          emptyText="Pick a floor first."
          onAdd={floor ? () => setEditing({ kind: 'seat', item: null }) : null}
          onAddMany={floor ? () => setEditing({ kind: 'seats', item: null }) : null}
          onEdit={(item) => setEditing({ kind: 'seat', item })}
          onDelete={(item) => setDeleting({ kind: 'seat', item })} />
      </Stack>

      {editing?.kind === 'building' && (
        <BuildingDialog building={editing.item} onSave={(values) => save('building', editing.item, values)}
          onClose={() => setEditing(null)} />
      )}
      {editing?.kind === 'seats' && (
        <FacilityDialog title={`Add seats to ${floor.name}`} fields={ADD_SEATS_FIELDS} initial={{ count: 10 }}
          onSave={(values) => save('seats', null, values)} onClose={() => setEditing(null)} />
      )}
      {editingConfig && (
        <FacilityDialog
          title={`${editing.item ? 'Edit' : 'Add'} ${editingConfig.noun}`}
          fields={(!editing.item && editingConfig.addFields) || editingConfig.fields}
          initial={editing.item || {}}
          onSave={(values) => save(editing.kind, editing.item, values)}
          onClose={() => setEditing(null)} />
      )}

      <Snackbar open={!!message} message={message} autoHideDuration={4000}
        onClose={() => setMessage('')} anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }} />

      {deleting && (
        <Dialog open onClose={() => setDeleting(null)}>
          <DialogTitle>Delete {KINDS[deleting.kind].label(deleting.item)}?</DialogTitle>
          <DialogContent>
            <DialogContentText>
              {KINDS[deleting.kind].deleteNote} This can't be undone.
            </DialogContentText>
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setDeleting(null)}>Cancel</Button>
            <Button color="error" variant="contained" onClick={confirmDelete}>Delete</Button>
          </DialogActions>
        </Dialog>
      )}
    </Layout>
  )
}
