// The ticket list: search, filters and sort over the tickets you're allowed to see.
// Every filter goes to the API as a query parameter, e.g. /api/tickets/?q=wifi&status=open
// The API sends one page at a time (25 by default) and the total, for the pager under the table.

import { useEffect, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import {
  Alert, Autocomplete, Box, Chip, Link, MenuItem, Paper, Snackbar, Stack, Table, TableBody, TableCell,
  TableContainer, TableHead, TablePagination, TableRow, TextField, Typography,
} from '@mui/material'
import Layout from '../components/Layout'
import { PriorityChip, StatusChip } from '../components/TicketChips'
import { api } from '../services/api'
import { useAuth } from '../services/AuthContext'
import { formatDate, formatLocation, PRIORITY_NAMES, STATUS_NAMES } from '../ticketLabels'

const NO_FILTERS = {
  status: '', priority: '', category_id: '', building_id: '', floor_id: '', assigned_to: '', escalation: '',
  overdue: '', from: '', to: '',
}

const ESCALATION_NAMES = { pending: 'Waiting for review', approved: 'Approved', rejected: 'Rejected' }

const SORTS = { newest: 'Newest first', oldest: 'Oldest first', priority: 'Highest priority first' }

export default function TicketsPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const { user } = useAuth()
  const isAdmin = user.role === 'admin'
  const [search, setSearch] = useState('') // what is typed in the search box
  const [q, setQ] = useState('') // the search sent to the API, a moment after typing stops
  // Filters can come in the link, e.g. /tickets?status=blocked from a dashboard tile.
  const [filters, setFilters] = useState(() => {
    const fromLink = Object.fromEntries(new URLSearchParams(location.search))
    return Object.fromEntries(Object.entries(NO_FILTERS).map(([key, value]) => [key, fromLink[key] ?? value]))
  })
  const [sort, setSort] = useState(() => new URLSearchParams(location.search).get('sort') || 'newest')
  const [page, setPage] = useState(0) // TablePagination counts pages from 0; the API from 1
  const [perPage, setPerPage] = useState(25)
  const [result, setResult] = useState(null) // { tickets, total }; null = still loading
  const [categories, setCategories] = useState([])
  const [buildings, setBuildings] = useState([])
  const [floors, setFloors] = useState([])
  const [engineers, setEngineers] = useState([]) // admins only, for the Assigned to filter
  const [error, setError] = useState('')
  // A message passed from another page, e.g. "TKT-1005 was deleted".
  const [message, setMessage] = useState(location.state?.message || '')

  useEffect(() => {
    Promise.all([api('facilities', '/categories'), api('facilities', '/buildings')])
      .then(([newCategories, newBuildings]) => { setCategories(newCategories); setBuildings(newBuildings) })
      .catch((err) => setError(err.message))
    if (isAdmin) api('users', '/engineers').then(setEngineers).catch((err) => setError(err.message))
  }, [isAdmin])

  useEffect(() => {
    if (!filters.building_id) return
    api('facilities', `/buildings/${filters.building_id}/floors`).then(setFloors).catch((err) => setError(err.message))
  }, [filters.building_id])

  // Wait until typing stops for 300 ms before searching, instead of one request per key.
  useEffect(() => {
    const timer = setTimeout(() => {
      setQ(search.trim())
      setPage(0)
    }, 300)
    return () => clearTimeout(timer)
  }, [search])

  // The query string for the API, e.g. "sort=newest&q=wifi&status=open".
  const params = new URLSearchParams({ sort, page: page + 1, per_page: perPage })
  if (q) params.set('q', q)
  for (const [key, value] of Object.entries(filters)) {
    if (value !== '') params.set(key, value)
  }
  const query = params.toString()

  // Reload whenever the query changes.
  useEffect(() => {
    api('tickets', `/?${query}`).then(setResult).catch((err) => setError(err.message))
  }, [query])
  const tickets = result?.tickets ?? null

  function setFilter(key, value) {
    const next = { ...filters, [key]: value }
    if (key === 'building_id') { next.floor_id = ''; setFloors([]) } // floors belong to one building
    setFilters(next)
    setPage(0)
  }

  function clearAll() {
    setSearch(''); setQ(''); setFilters(NO_FILTERS); setFloors([]); setPage(0)
  }

  // The chips above the table, one per active filter. Each can be removed on its own.
  const nameOf = (list, id, field = 'name') => list.find((item) => item.id === id)?.[field] ?? ''
  const chips = [
    q && { key: 'q', label: `Search: ${q}`, clear: () => { setSearch(''); setQ('') } },
    filters.status && { key: 'status', label: `Status: ${STATUS_NAMES[filters.status]}` },
    filters.priority && { key: 'priority', label: `Priority: ${PRIORITY_NAMES[filters.priority]}` },
    filters.category_id && { key: 'category_id', label: `Category: ${nameOf(categories, filters.category_id)}` },
    filters.building_id && { key: 'building_id', label: `Building: ${nameOf(buildings, filters.building_id)}` },
    filters.floor_id && { key: 'floor_id', label: `Floor: ${nameOf(floors, filters.floor_id)}` },
    filters.assigned_to && {
      key: 'assigned_to',
      label: `Assigned to: ${filters.assigned_to === 'none' ? 'Nobody' : nameOf(engineers, Number(filters.assigned_to), 'full_name')}`,
    },
    filters.escalation && { key: 'escalation', label: `Escalation: ${ESCALATION_NAMES[filters.escalation]}` },
    filters.overdue && { key: 'overdue', label: 'Overdue only' },
    filters.from && { key: 'from', label: `From: ${filters.from}` },
    filters.to && { key: 'to', label: `To: ${filters.to}` },
  ].filter(Boolean)

  // The Assigned to choices: "Nobody yet", then every engineer with their sub-specialty.
  const assigneeOptions = [
    { id: 'none', label: 'Nobody yet' },
    ...engineers.map((e) => ({ id: e.id, label: `${e.full_name} · ${e.category_name}` })),
  ]

  function selectProps(key, label) {
    return {
      select: true, size: 'small', label, value: filters[key], sx: { minWidth: 150 },
      onChange: (e) => setFilter(key, e.target.value),
    }
  }

  return (
    <Layout>
      <Typography variant="h4" component="h1" sx={{ mb: 2 }}>Tickets</Typography>
      {error && <Alert severity="error" onClose={() => setError('')} sx={{ mb: 2 }}>{error}</Alert>}

      <Paper variant="outlined" sx={{ p: 2, mb: 2 }}>
        <Stack spacing={2}>
          <TextField size="small" label="Search" placeholder="Ticket number (TKT-1001), title or description"
            value={search} onChange={(e) => setSearch(e.target.value)} fullWidth />
          <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
            <TextField {...selectProps('status', 'Status')}>
              <MenuItem value="">Any</MenuItem>
              {Object.entries(STATUS_NAMES).map(([value, name]) => <MenuItem key={value} value={value}>{name}</MenuItem>)}
            </TextField>
            <TextField {...selectProps('priority', 'Priority')}>
              <MenuItem value="">Any</MenuItem>
              {Object.entries(PRIORITY_NAMES).map(([value, name]) => <MenuItem key={value} value={value}>{name}</MenuItem>)}
            </TextField>
            <TextField {...selectProps('category_id', 'Category')}>
              <MenuItem value="">Any</MenuItem>
              {categories.map((c) => <MenuItem key={c.id} value={c.id}>{c.name}</MenuItem>)}
            </TextField>
            <TextField {...selectProps('building_id', 'Building')}>
              <MenuItem value="">Any</MenuItem>
              {buildings.map((b) => <MenuItem key={b.id} value={b.id}>{b.name}</MenuItem>)}
            </TextField>
            <TextField {...selectProps('floor_id', 'Floor')} disabled={!filters.building_id}>
              <MenuItem value="">Any</MenuItem>
              {floors.map((f) => <MenuItem key={f.id} value={f.id}>{f.name}</MenuItem>)}
            </TextField>
            {isAdmin && (
              // Type part of a name to narrow the list. Empty = anyone.
              <Autocomplete size="small" sx={{ minWidth: 240 }} options={assigneeOptions}
                value={assigneeOptions.find((o) => String(o.id) === String(filters.assigned_to)) ?? null}
                onChange={(e, option) => setFilter('assigned_to', option ? option.id : '')}
                getOptionLabel={(o) => o.label} isOptionEqualToValue={(o, v) => o.id === v.id}
                renderInput={(inputProps) => <TextField {...inputProps} label="Assigned to" placeholder="Type a name" />} />
            )}
            <TextField {...selectProps('escalation', 'Escalation')}>
              <MenuItem value="">Any</MenuItem>
              {Object.entries(ESCALATION_NAMES).map(([value, name]) => <MenuItem key={value} value={value}>{name}</MenuItem>)}
            </TextField>
            <TextField size="small" type="date" label="Reported from" value={filters.from}
              onChange={(e) => setFilter('from', e.target.value)} slotProps={{ inputLabel: { shrink: true } }} />
            <TextField size="small" type="date" label="Reported to" value={filters.to}
              onChange={(e) => setFilter('to', e.target.value)} slotProps={{ inputLabel: { shrink: true } }} />
            <TextField select size="small" label="Sort" value={sort} onChange={(e) => { setSort(e.target.value); setPage(0) }}
              sx={{ minWidth: 200 }}>
              {Object.entries(SORTS).map(([value, name]) => <MenuItem key={value} value={value}>{name}</MenuItem>)}
            </TextField>
          </Box>
          {chips.length > 0 && (
            <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', alignItems: 'center' }}>
              {chips.map((chip) => (
                <Chip key={chip.key} label={chip.label} size="small"
                  onDelete={chip.clear || (() => setFilter(chip.key, ''))} />
              ))}
              <Link component="button" variant="body2" onClick={clearAll}>Clear all</Link>
            </Box>
          )}
        </Stack>
      </Paper>

      <TableContainer component={Paper} variant="outlined">
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>Ticket</TableCell>
              <TableCell>Title</TableCell>
              <TableCell>Status</TableCell>
              <TableCell>Priority</TableCell>
              <TableCell>Category</TableCell>
              <TableCell>Location</TableCell>
              <TableCell>Reported by</TableCell>
              <TableCell>Assigned to</TableCell>
              <TableCell>Reported</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {tickets === null ? (
              <TableRow><TableCell colSpan={9}>Loading…</TableCell></TableRow>
            ) : tickets.length === 0 ? (
              <TableRow><TableCell colSpan={9}>No tickets match.</TableCell></TableRow>
            ) : tickets.map((t) => (
              <TableRow key={t.id} hover onClick={() => navigate(`/tickets/${t.id}`)} sx={{ cursor: 'pointer' }}>
                <TableCell sx={{ whiteSpace: 'nowrap' }}>{t.number}</TableCell>
                <TableCell>{t.title}</TableCell>
                <TableCell><StatusChip status={t.status} /></TableCell>
                <TableCell><PriorityChip priority={t.priority} /></TableCell>
                <TableCell>{t.category_name}</TableCell>
                <TableCell>{formatLocation(t)}</TableCell>
                <TableCell>{t.reporter_name}</TableCell>
                <TableCell>{t.assignee_name || '—'}</TableCell>
                <TableCell sx={{ whiteSpace: 'nowrap' }}>{formatDate(t.created_at)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        <TablePagination component="div" count={result?.total ?? 0} page={page} rowsPerPage={perPage}
          rowsPerPageOptions={[25, 50, 100]} onPageChange={(e, next) => setPage(next)}
          onRowsPerPageChange={(e) => { setPerPage(Number(e.target.value)); setPage(0) }} />
      </TableContainer>

      <Snackbar open={!!message} message={message} autoHideDuration={4000} onClose={() => setMessage('')}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }} />
    </Layout>
  )
}
