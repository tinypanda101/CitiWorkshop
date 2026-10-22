// The engineers table on the Engineers report and the Users page's Engineers tab: search by
// name, filter by sub-specialty and availability, sort by the numbers, 25 a page.
// There are only about 80 engineers and the page already has them all, so the filtering,
// sorting and paging happen here in the browser.
// `cap` (the ticket cap) shows Unfinished as "3 / 5"; `onTime` adds the On time column and
// sorts; `phone` adds the Phone column; `category` shows only that sub-specialty's engineers
// (and hides the Sub-specialty filter).

import { useState } from 'react'
import {
  Box, Chip, ListSubheader, MenuItem, Paper, Table, TableBody, TableCell, TableContainer, TableHead,
  TablePagination, TableRow, TextField,
} from '@mui/material'
import { formatPhone } from '../phone'
import { AVAILABILITY_COLORS, AVAILABILITY_NAMES, SPECIALTY_NAMES } from '../roles'

// Each sort is a compare function; ties go by name.
const byName = (a, b) => a.full_name.localeCompare(b.full_name)
const onTime = (e) => e.on_time_percent ?? -1 // no resolved tickets yet sorts last in "best"
const SORTS = {
  name: { label: 'Name A–Z', compare: byName },
  most: { label: 'Most unfinished', compare: (a, b) => b.open_tickets - a.open_tickets || byName(a, b) },
  fewest: { label: 'Fewest unfinished', compare: (a, b) => a.open_tickets - b.open_tickets || byName(a, b) },
  best: { label: 'Best on time', compare: (a, b) => onTime(b) - onTime(a) || byName(a, b), onTime: true },
  worst: { label: 'Worst on time', compare: (a, b) => onTime(a) - onTime(b) || byName(a, b), onTime: true },
}

export default function EngineerTable({ engineers, cap, onTime: showOnTime = false, phone = false, category: onlyCategory = '' }) {
  const [search, setSearch] = useState('')
  const [chosenCategory, setCategory] = useState('')
  const category = onlyCategory || chosenCategory
  const [availability, setAvailability] = useState('')
  const [sort, setSort] = useState('name')
  const [page, setPage] = useState(0)
  const [perPage, setPerPage] = useState(25)

  // Changing a filter goes back to the first page.
  function filterWith(setter) {
    return (e) => { setter(e.target.value); setPage(0) }
  }

  const text = search.trim().toLowerCase()
  const shown = engineers
    .filter((e) => !text || e.full_name.toLowerCase().includes(text))
    .filter((e) => !category || e.category_name === category)
    .filter((e) => !availability || e.availability === availability)
    .sort(SORTS[sort].compare)
  const pageRows = shown.slice(page * perPage, (page + 1) * perPage)

  // The sub-specialties the engineers have, under Facility and Technology headings.
  const categoryItems = Object.entries(SPECIALTY_NAMES).flatMap(([type, typeName]) => [
    <ListSubheader key={type}>{typeName}</ListSubheader>,
    ...[...new Set(engineers.filter((e) => e.specialty === type).map((e) => e.category_name))].sort()
      .map((name) => <MenuItem key={name} value={name}>{name}</MenuItem>),
  ])

  const columns = 4 + (phone ? 1 : 0) + (showOnTime ? 1 : 0)

  return (
    <>
      <Box sx={{ display: 'flex', gap: 2, mb: 2, flexWrap: 'wrap' }}>
        <TextField size="small" label="Search" placeholder="Name" value={search} onChange={filterWith(setSearch)}
          sx={{ flexGrow: 1, minWidth: 180 }} />
        {!onlyCategory && (
          <TextField select size="small" label="Sub-specialty" value={category} onChange={filterWith(setCategory)}
            sx={{ minWidth: 200 }}>
            <MenuItem value="">Any</MenuItem>
            {categoryItems}
          </TextField>
        )}
        <TextField select size="small" label="Availability" value={availability} onChange={filterWith(setAvailability)}
          sx={{ minWidth: 150 }}>
          <MenuItem value="">Any</MenuItem>
          {Object.entries(AVAILABILITY_NAMES).map(([value, name]) => <MenuItem key={value} value={value}>{name}</MenuItem>)}
        </TextField>
        <TextField select size="small" label="Sort" value={sort} onChange={filterWith(setSort)} sx={{ minWidth: 180 }}>
          {Object.entries(SORTS).filter(([, s]) => showOnTime || !s.onTime)
            .map(([value, s]) => <MenuItem key={value} value={value}>{s.label}</MenuItem>)}
        </TextField>
      </Box>

      <TableContainer component={Paper} variant="outlined">
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>Name</TableCell>
              <TableCell>Sub-specialty</TableCell>
              {phone && <TableCell>Phone</TableCell>}
              <TableCell>Availability</TableCell>
              <TableCell align="right">Unfinished</TableCell>
              {showOnTime && <TableCell align="right">On time</TableCell>}
            </TableRow>
          </TableHead>
          <TableBody>
            {pageRows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={columns}>
                  {engineers.length === 0 ? 'No engineers yet. Add them on the Users page.' : 'No engineers match.'}
                </TableCell>
              </TableRow>
            ) : pageRows.map((e) => (
              <TableRow key={e.id}>
                <TableCell>{e.full_name}</TableCell>
                <TableCell>{e.category_name} ({SPECIALTY_NAMES[e.specialty]})</TableCell>
                {phone && <TableCell>{formatPhone(e.phone) || '—'}</TableCell>}
                <TableCell>
                  <Chip size="small" label={AVAILABILITY_NAMES[e.availability]} color={AVAILABILITY_COLORS[e.availability]} />
                </TableCell>
                <TableCell align="right">
                  {cap ? `${e.open_tickets} / ${cap}${e.open_tickets >= cap ? ' (full)' : ''}` : e.open_tickets}
                </TableCell>
                {showOnTime && <TableCell align="right">{e.on_time_percent === null ? '—' : `${e.on_time_percent}%`}</TableCell>}
              </TableRow>
            ))}
          </TableBody>
        </Table>
        <TablePagination component="div" count={shown.length} page={page} rowsPerPage={perPage}
          rowsPerPageOptions={[25, 50, 100]} onPageChange={(e, next) => setPage(next)}
          onRowsPerPageChange={(e) => { setPerPage(Number(e.target.value)); setPage(0) }} />
      </TableContainer>
    </>
  )
}
