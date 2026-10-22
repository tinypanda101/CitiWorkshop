// The Facility Admin dashboard, in two tabs. Overview: status tiles for the chosen date range,
// what needs attention right now, the unfinished workload, and response times. The detail
// (each attention list, engineers, locations, categories) is on its own report page, behind a
// button. Submitted Tickets: the tickets the admin submitted themselves (the employee dashboard).

import { useEffect, useState } from 'react'
import { Alert, Box, Tab, Tabs, Typography } from '@mui/material'
import BarList from './BarList'
import DateRangePicker from './DateRangePicker'
import SubmittedTickets from './SubmittedTickets'
import { CountTile, LinkTile, Section, StatTile } from './DashboardParts'
import WorkloadTile from './WorkloadTile'
import { describeRange, formatHours, plural, presetRange } from './dashboardFormat'
import { api } from '../../services/api'
import { SPECIALTY_NAMES } from '../../roles'

const TILES = [
  { status: 'open', name: 'Open', meaning: 'Waiting for an engineer', edge: 'grey.500' },
  { status: 'assigned', name: 'Assigned', meaning: 'Not started yet', edge: 'info.main' },
  { status: 'in_progress', name: 'In Progress', meaning: 'Being worked on', edge: 'primary.main' },
  { status: 'blocked', name: 'Blocked', meaning: 'On hold', edge: 'error.main' },
  { status: 'resolved', name: 'Resolved', meaning: 'Waiting to be closed', edge: 'success.main' },
  { status: 'closed', name: 'Closed', meaning: 'Done', edge: 'grey.700' },
]

const REPORTS = [
  { kind: 'engineers', name: 'Engineers', meaning: 'Availability, workload and on-time % per engineer' },
  { kind: 'locations', name: 'Locations', meaning: 'Tickets per building' },
  { kind: 'categories', name: 'Categories', meaning: 'The most common facility and technology issues' },
]

export default function AdminDashboard({ user }) {
  const [tab, setTab] = useState('overview')
  const [range, setRange] = useState(() => presetRange('30'))
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  const [reloads, setReloads] = useState(0) // goes up after submitting a ticket

  // e.g. "from=2026-09-22&to=2026-10-21": sent to the API, and passed on to the pages the tiles open.
  const params = new URLSearchParams()
  if (range.from) params.set('from', range.from)
  if (range.to) params.set('to', range.to)
  const query = params.toString()

  useEffect(() => {
    api('dashboard', `/?${query}`).then(setData).catch((err) => setError(err.message))
  }, [query, reloads])

  const tabs = (
    <Tabs value={tab} onChange={(e, value) => setTab(value)} sx={{ borderBottom: 1, borderColor: 'divider' }}>
      <Tab value="overview" label="Overview" />
      <Tab value="submitted" label="Submitted Tickets" />
    </Tabs>
  )

  if (!data) {
    return (
      <Box sx={{ display: 'grid', gap: 2 }}>
        {tabs}
        {tab === 'overview' && <DateRangePicker value={range} onChange={setRange} />}
        {error ? <Alert severity="error">{error}</Alert> : <Typography color="text.secondary">Loading…</Typography>}
      </Box>
    )
  }

  if (tab === 'submitted') {
    return (
      <Box sx={{ display: 'grid', gap: 2 }}>
        {tabs}
        <SubmittedTickets data={data.submitted} user={user} onSubmitted={() => setReloads(reloads + 1)} />
      </Box>
    )
  }

  const ticketsLink = (status) => `/tickets?${new URLSearchParams({ ...(status && { status }), ...Object.fromEntries(params) })}`
  const reportLink = (kind) => `/reports/${kind}?${query}`

  return (
    <Box sx={{ display: 'grid', gap: 2 }}>
      {tabs}
      <DateRangePicker value={range} onChange={setRange} />
      {error && <Alert severity="error" onClose={() => setError('')}>{error}</Alert>}

      <div>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
          {plural(data.total, 'ticket')} reported {describeRange(range)}. Click a tile to see those tickets.
        </Typography>
        <Box sx={{ display: 'grid', gap: 1.5, gridTemplateColumns: { xs: '1fr 1fr', sm: 'repeat(4, 1fr)', lg: 'repeat(7, 1fr)' } }}>
          <CountTile count={data.total} name="Total" meaning="Reported in range" edge="secondary.main" to={ticketsLink()} />
          {TILES.map((t) => (
            <CountTile key={t.status} count={data.by_status[t.status]} name={t.name} meaning={t.meaning} edge={t.edge}
              to={ticketsLink(t.status)} />
          ))}
        </Box>
      </div>

      <Section title="Needs attention">
        <Box sx={{ display: 'grid', gap: 1.5, gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr', lg: 'repeat(4, 1fr)' } }}>
          <LinkTile to={reportLink('overdue')} count={data.overdue.total} name="Overdue" edge="error.main" />
          <LinkTile to={reportLink('escalations')} count={data.pending_escalations.total} name="Escalations" edge="warning.main" />
          <LinkTile to={reportLink('blocked')} count={data.blocked.total} name="Blocked" edge="error.main" />
          <LinkTile to={reportLink('waiting')} count={data.waiting.total} name="Waiting for an engineer" edge="grey.500" />
        </Box>
      </Section>

      <Section title="Unfinished by priority">
        <BarList rows={data.by_priority} empty="No unfinished tickets." />
      </Section>

      <Section title="Workload by sub-specialty">
        <Box sx={{ display: 'grid', gap: 2 }}>
          {Object.entries(SPECIALTY_NAMES).map(([type, typeName]) => (
            <div key={type}>
              <Typography variant="subtitle2" gutterBottom>{typeName}</Typography>
              <Box sx={{ display: 'grid', gap: 1.5, gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr', md: 'repeat(5, 1fr)' } }}>
                {data.workload.filter((w) => w.type === type).map((w) => (
                  <WorkloadTile key={w.category_name} workload={w}
                    to={`/reports/engineers?${new URLSearchParams({ category: w.category_name, ...Object.fromEntries(params) })}`} />
                ))}
              </Box>
            </div>
          ))}
        </Box>
      </Section>

      <Section title="Response times" note={`Tickets reported ${describeRange(range)}`}>
        <Box sx={{ display: 'grid', gap: 3, gridTemplateColumns: { xs: '1fr 1fr', md: 'repeat(4, 1fr)' } }}>
          <StatTile value={data.averages.percent_on_time === null ? '—' : `${data.averages.percent_on_time}%`}
            label="Resolved on time" />
          <StatTile value={formatHours(data.averages.hours_to_resolve)} label="Average time to resolve" />
          <StatTile value={formatHours(data.averages.hours_to_assign)} label="Average time to assign an engineer" />
          <StatTile value={data.waiting_to_close} label="Resolved" />
        </Box>
      </Section>

      <Section title="More reports">
        <Box sx={{ display: 'grid', gap: 1.5, gridTemplateColumns: { xs: '1fr', md: 'repeat(3, 1fr)' } }}>
          {REPORTS.map((r) => <LinkTile key={r.kind} to={reportLink(r.kind)} name={r.name} meaning={r.meaning} />)}
        </Box>
      </Section>
    </Box>
  )
}
