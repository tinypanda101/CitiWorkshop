// The engineer dashboard, in two tabs: the tickets assigned to them (with a count per status
// and the list in working order), and the tickets they submitted themselves (exactly the
// employee dashboard).

import { useEffect, useState } from 'react'
import { Alert, Box, Tab, Tabs, Typography } from '@mui/material'
import AssignedTickets from './AssignedTickets'
import SubmittedTickets from './SubmittedTickets'
import { CountTile, Section } from './DashboardParts'
import { api } from '../../services/api'

const TILES = [
  { status: 'assigned', name: 'Assigned', edge: 'info.main' },
  { status: 'in_progress', name: 'In Progress', edge: 'primary.main' },
  { status: 'blocked', name: 'Blocked', edge: 'error.main' },
  { status: 'resolved', name: 'Resolved', edge: 'success.main' },
]

export default function EngineerDashboard({ user }) {
  const [tab, setTab] = useState('assigned')
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  const [reloads, setReloads] = useState(0) // goes up after submitting a ticket

  useEffect(() => {
    api('dashboard', '/').then(setData).catch((err) => setError(err.message))
  }, [reloads])

  if (error) return <Alert severity="error">{error}</Alert>
  if (!data) return <Typography color="text.secondary">Loading…</Typography>

  const total = Object.values(data.by_status).reduce((sum, n) => sum + n, 0)

  return (
    <Box sx={{ display: 'grid', gap: 2 }}>
      <Tabs value={tab} onChange={(e, value) => setTab(value)} sx={{ borderBottom: 1, borderColor: 'divider' }}>
        <Tab value="assigned" label="My assigned tickets" />
        <Tab value="submitted" label="Submitted Tickets" />
      </Tabs>

      {tab === 'assigned' ? (
        <>
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'repeat(5, 1fr)' }, gap: { xs: 1, sm: 2 } }}>
            <CountTile count={total} name="Total" edge="secondary.main" />
            {TILES.map((t) => <CountTile key={t.status} count={data.by_status[t.status]} name={t.name} edge={t.edge} />)}
          </Box>
          <Section title="My assigned tickets">
            <AssignedTickets rows={data.assigned} />
          </Section>
        </>
      ) : (
        <SubmittedTickets data={data.submitted} user={user} onSubmitted={() => setReloads(reloads + 1)} />
      )}
    </Box>
  )
}
