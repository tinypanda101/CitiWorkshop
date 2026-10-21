// The Facility Admin dashboard: status tiles for the chosen date range, what needs attention
// right now, the unfinished workload, and response times. The detail (each attention list,
// engineers, locations, categories) is on its own report page, behind a button.

import { useEffect, useState } from 'react'
import { Alert, Box, Typography } from '@mui/material'
import BarList from './BarList'
import DateRangePicker from './DateRangePicker'
import { CountTile, LinkTile, Pair, Section, StatTile } from './DashboardParts'
import { describeRange, formatHours, plural, presetRange } from './dashboardFormat'
import { api } from '../../services/api'

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
  { kind: 'locations', name: 'Locations', meaning: 'Buildings, floors and seats with the most tickets' },
  { kind: 'categories', name: 'Categories', meaning: 'The most common facility and technology issues' },
]

export default function AdminDashboard({ reloads }) {
  const [range, setRange] = useState(() => presetRange('30'))
  const [data, setData] = useState(null)
  const [error, setError] = useState('')

  // e.g. "from=2026-09-22&to=2026-10-21": sent to the API, and passed on to the pages the tiles open.
  const params = new URLSearchParams()
  if (range.from) params.set('from', range.from)
  if (range.to) params.set('to', range.to)
  const query = params.toString()

  useEffect(() => {
    api('dashboard', `/?${query}`).then(setData).catch((err) => setError(err.message))
  }, [query, reloads])

  if (!data) {
    return (
      <Box sx={{ display: 'grid', gap: 2 }}>
        <DateRangePicker value={range} onChange={setRange} />
        {error ? <Alert severity="error">{error}</Alert> : <Typography color="text.secondary">Loading…</Typography>}
      </Box>
    )
  }

  const pendingEscalations = data.escalations.filter((t) => t.escalation_status === 'pending').length
  const ticketsLink = (status) => `/tickets?${new URLSearchParams({ ...(status && { status }), ...Object.fromEntries(params) })}`
  const reportLink = (kind) => `/reports/${kind}?${query}`

  // One bar per engineer out of the cap, plus the tickets still waiting for one.
  const workload = [
    ...data.engineers.map((e) => ({
      label: e.full_name, value: e.open_tickets,
      text: `${e.open_tickets} / ${data.ticket_cap}${e.open_tickets >= data.ticket_cap ? ' Full' : ''}`,
    })),
    { label: 'Not assigned', value: data.waiting.length },
  ]

  return (
    <Box sx={{ display: 'grid', gap: 2 }}>
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

      <Section title="Needs attention" note="Right now, whatever the date range. Click one for the list.">
        <Box sx={{ display: 'grid', gap: 1.5, gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr', lg: 'repeat(4, 1fr)' } }}>
          <LinkTile to={reportLink('overdue')} count={data.overdue.length} name="Overdue" meaning="Past the 3-day deadline" edge="error.main" />
          <LinkTile to={reportLink('escalations')} count={pendingEscalations} name="Escalations" meaning="Waiting for your review" edge="warning.main" />
          <LinkTile to={reportLink('blocked')} count={data.blocked.length} name="Blocked" meaning="On hold, with the reason" edge="error.main" />
          <LinkTile to={reportLink('waiting')} count={data.waiting.length} name="Waiting for an engineer"
            meaning="Everyone matching is full or Off duty" edge="grey.500" />
        </Box>
      </Section>

      <Pair>
        <Section title="Unfinished by priority" note="Open, Assigned, In Progress and Blocked, right now">
          <BarList rows={data.by_priority} empty="No unfinished tickets." />
        </Section>
        <Section title="Unfinished by engineer" note={`Out of the ${data.ticket_cap}-ticket cap. Auto-assign skips anyone who is full.`}>
          <BarList rows={workload} max={data.ticket_cap} empty="No unfinished tickets." />
        </Section>
      </Pair>

      <Section title="Response times" note={`Tickets reported ${describeRange(range)}`}>
        <Box sx={{ display: 'grid', gap: 3, gridTemplateColumns: { xs: '1fr 1fr', md: 'repeat(4, 1fr)' } }}>
          <StatTile value={data.averages.percent_on_time === null ? '—' : `${data.averages.percent_on_time}%`}
            label="Resolved on time (within 3 days)" />
          <StatTile value={formatHours(data.averages.hours_to_resolve)} label="Average time to resolve" />
          <StatTile value={formatHours(data.averages.hours_to_assign)} label="Average time to assign an engineer" />
          <StatTile value={data.waiting_to_close} label="Resolved, waiting to be closed (right now)" />
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
