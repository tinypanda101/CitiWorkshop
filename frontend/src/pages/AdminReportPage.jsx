// The admin's report pages, opened from the dashboard buttons: /reports/overdue, /reports/escalations,
// /reports/blocked, /reports/waiting, /reports/engineers, /reports/locations, /reports/categories.
// Each one shows one part of the same dashboard data (for the same date range, passed in the link).

import { useEffect, useState } from 'react'
import { Link as RouterLink, useLocation, useParams } from 'react-router-dom'
import {
  Alert, Box, Button, Chip, Link, Paper, Snackbar, Stack, Table, TableBody, TableCell, TableContainer,
  TableHead, TableRow, Typography,
} from '@mui/material'
import Layout from '../components/Layout'
import AssignDialog from '../components/AssignDialog'
import BarList from '../components/dashboard/BarList'
import { Section, TicketLine, TicketLines } from '../components/dashboard/DashboardParts'
import { plural } from '../components/dashboard/dashboardFormat'
import { api } from '../services/api'
import { AVAILABILITY_COLORS, AVAILABILITY_NAMES, SPECIALTY_NAMES } from '../roles'
import { dueLabel, formatDateTime, PRIORITY_NAMES, STATUS_NAMES } from '../ticketLabels'

const TITLES = {
  overdue: 'Overdue', escalations: 'Escalations', blocked: 'Blocked', waiting: 'Waiting for an engineer',
  engineers: 'Engineers', locations: 'Locations', categories: 'Categories',
}

// Facility vs technology categories: two colours checked for colour-blind readers
// (dataviz palette slots 1 and 2), always with a legend.
const TYPE_COLORS = { facility: '#2a78d6', technology: '#eb6834' }

function Legend() {
  return (
    <Box sx={{ display: 'flex', gap: 2, mb: 1.5 }}>
      {Object.entries(TYPE_COLORS).map(([type, color]) => (
        <Box key={type} sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
          <Box sx={{ width: 12, height: 12, borderRadius: '2px', bgcolor: color }} />
          <Typography variant="body2">{type === 'facility' ? 'Facility' : 'Technology'}</Typography>
        </Box>
      ))}
    </Box>
  )
}

// "High · In Progress · Lena Fischer"
function summary(t) {
  return `${PRIORITY_NAMES[t.priority]} · ${STATUS_NAMES[t.status]} · ${t.assignee_name || 'Not assigned'}`
}

export default function AdminReportPage() {
  const { kind } = useParams()
  const { search } = useLocation() // the dashboard's date range, e.g. "?from=2026-09-22&to=2026-10-21"
  const [data, setData] = useState(null)
  const [reloads, setReloads] = useState(0) // goes up after approving, rejecting or assigning
  const [assigning, setAssigning] = useState(null) // the ticket in the Assign popup
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')

  useEffect(() => {
    api('dashboard', `/${search}`).then(setData).catch((err) => setError(err.message))
  }, [search, reloads])

  async function review(ticket, decision) {
    try {
      await api('tickets', `/${ticket.id}/escalation`, { method: 'PUT', body: { decision } })
      setMessage(`${ticket.number}: escalation ${decision === 'approve' ? 'approved' : 'rejected'}`)
      setReloads(reloads + 1)
    } catch (err) {
      setError(err.message)
    }
  }

  function content() {
    if (kind === 'overdue') {
      return (
        <Section title="Overdue" note={`${plural(data.overdue.length, 'unfinished ticket')} past the 3-day deadline, most late first`}>
          <TicketLines empty="Nothing is overdue.">
            {data.overdue.map((t) => (
              <TicketLine key={t.id} ticket={t} detail={`${summary(t)} · ${t.location}`}
                action={<Typography color="error" sx={{ fontWeight: 500 }}>{dueLabel(t).text}</Typography>} />
            ))}
          </TicketLines>
        </Section>
      )
    }
    if (kind === 'escalations') {
      const pending = data.escalations.filter((t) => t.escalation_status === 'pending')
      const decided = data.escalations.filter((t) => t.escalation_status !== 'pending')
      const asked = (t) => `${PRIORITY_NAMES[t.priority]} → ${PRIORITY_NAMES[t.requested_priority]}`
      return (
        <Stack spacing={2}>
          <Section title="Waiting for your review" note={plural(pending.length, 'request')}>
            <TicketLines empty="No escalations waiting for review.">
              {pending.map((t) => (
                <TicketLine key={t.id} ticket={t} quote={t.escalation_reason}
                  detail={`Asked for ${asked(t)} · ${STATUS_NAMES[t.status]} · ${t.assignee_name || 'Not assigned'}`}
                  action={(
                    <Stack direction="row" spacing={1}>
                      <Button variant="outlined" size="small" onClick={() => review(t, 'approve')}>Approve</Button>
                      <Button variant="outlined" size="small" color="error" onClick={() => review(t, 'reject')}>Reject</Button>
                    </Stack>
                  )} />
              ))}
            </TicketLines>
          </Section>
          <Section title="Already decided" note="On tickets reported in the dashboard's date range">
            <TicketLines empty="None yet.">
              {decided.map((t) => (
                <TicketLine key={t.id} ticket={t} quote={t.escalation_reason}
                  detail={`Asked for ${PRIORITY_NAMES[t.requested_priority]} · ${t.escalation_status === 'approved' ? 'Approved' : 'Rejected'}`} />
              ))}
            </TicketLines>
          </Section>
        </Stack>
      )
    }
    if (kind === 'blocked') {
      return (
        <Section title="Blocked" note={`${plural(data.blocked.length, 'ticket')} on hold, longest first`}>
          <TicketLines empty="Nothing is blocked.">
            {data.blocked.map((t) => (
              <TicketLine key={t.id} ticket={t} quote={t.blocked_reason}
                detail={`${t.assignee_name || 'Not assigned'} · ${PRIORITY_NAMES[t.priority]} · since ${formatDateTime(t.updated_at)}`} />
            ))}
          </TicketLines>
        </Section>
      )
    }
    if (kind === 'waiting') {
      return (
        <Section title="Waiting for an engineer"
          note="Auto-assign couldn't place these: every matching engineer is full or Off duty. They're handed out as soon as a slot opens, highest priority first.">
          <TicketLines empty="Every ticket has an engineer.">
            {data.waiting.map((t) => (
              <TicketLine key={t.id} ticket={t}
                detail={`${t.category_name} (${t.category_type}) · ${PRIORITY_NAMES[t.priority]} · submitted ${formatDateTime(t.created_at)}`}
                action={<Button variant="outlined" size="small" onClick={() => setAssigning(t)}>Assign</Button>} />
            ))}
          </TicketLines>
        </Section>
      )
    }
    if (kind === 'engineers') {
      return (
        <Section title="Engineers" note={`Unfinished is right now, out of the ${data.ticket_cap}-ticket cap. On time = resolved within 3 days, for tickets in the date range.`}>
          {data.engineers.length === 0 ? <Typography color="text.secondary">No engineers yet. Add them on the Users page.</Typography> : (
            <TableContainer component={Paper} variant="outlined">
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>Engineer</TableCell>
                    <TableCell>Specialty</TableCell>
                    <TableCell>Availability</TableCell>
                    <TableCell align="right">Unfinished</TableCell>
                    <TableCell align="right">On time</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {data.engineers.map((e) => (
                    <TableRow key={e.id}>
                      <TableCell>{e.full_name}</TableCell>
                      <TableCell>{SPECIALTY_NAMES[e.specialty]}</TableCell>
                      <TableCell>
                        <Chip size="small" label={AVAILABILITY_NAMES[e.availability]} color={AVAILABILITY_COLORS[e.availability]} />
                      </TableCell>
                      <TableCell align="right">
                        {e.open_tickets} / {data.ticket_cap}{e.open_tickets >= data.ticket_cap && ' (full)'}
                      </TableCell>
                      <TableCell align="right">{e.on_time_percent === null ? '—' : `${e.on_time_percent}%`}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          )}
        </Section>
      )
    }
    if (kind === 'locations') {
      return (
        <Section title="Locations with the most tickets" note="Tickets reported in the date range">
          <Box sx={{ display: 'grid', gap: 3, gridTemplateColumns: { xs: '1fr', md: 'repeat(3, 1fr)' } }}>
            <div><Typography variant="subtitle2" gutterBottom>Buildings</Typography><BarList rows={data.top_buildings} /></div>
            <div><Typography variant="subtitle2" gutterBottom>Floors</Typography><BarList rows={data.top_floors} /></div>
            <div><Typography variant="subtitle2" gutterBottom>Seats</Typography><BarList rows={data.top_seats} empty="No seats given yet." /></div>
          </Box>
        </Section>
      )
    }
    if (kind === 'categories') {
      const count = (type) => data.categories.filter((c) => c.type === type).reduce((sum, c) => sum + c.value, 0)
      return (
        <Section title="Most common categories" note={`Facility ${count('facility')}, technology ${count('technology')}`}>
          <Legend />
          <BarList rows={data.categories.map((c) => ({ ...c, color: TYPE_COLORS[c.type] }))} />
        </Section>
      )
    }
    return <Alert severity="warning">There's no report called “{kind}”.</Alert>
  }

  return (
    <Layout>
      <Link component={RouterLink} to="/" underline="hover">← Back to dashboard</Link>
      <Typography variant="h4" component="h1" sx={{ mt: 1, mb: 2 }}>{TITLES[kind] || 'Report'}</Typography>
      {error && <Alert severity="error" onClose={() => setError('')} sx={{ mb: 2 }}>{error}</Alert>}
      {!data ? <Typography color="text.secondary">Loading…</Typography> : content()}

      {assigning && (
        <AssignDialog ticket={assigning} onClose={() => setAssigning(null)}
          onSaved={(saved) => {
            setAssigning(null)
            setMessage(`${saved.number} assigned to ${saved.assignee_name || 'nobody'}`)
            setReloads(reloads + 1)
          }} />
      )}
      <Snackbar open={Boolean(message)} autoHideDuration={4000} onClose={() => setMessage('')} message={message} />
    </Layout>
  )
}
