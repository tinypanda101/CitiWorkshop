// The admin's report pages, opened from the dashboard buttons: /reports/overdue, /reports/escalations,
// /reports/blocked, /reports/waiting, /reports/engineers, /reports/locations, /reports/categories.
// Each one shows one part of the same dashboard data (for the same date range, passed in the link).

import { useEffect, useState } from 'react'
import { Link as RouterLink, useLocation, useParams, useSearchParams } from 'react-router-dom'
import {
  Alert, Box, Breadcrumbs, Button, Link, Snackbar, Stack, Typography,
} from '@mui/material'
import Layout from '../components/Layout'
import AssignDialog from '../components/AssignDialog'
import EngineerTable from '../components/EngineerTable'
import BarList from '../components/dashboard/BarList'
import { Section, TicketLine, TicketLines } from '../components/dashboard/DashboardParts'
import { plural } from '../components/dashboard/dashboardFormat'
import { api } from '../services/api'
import { dueLabel, formatDateTime, PRIORITY_NAMES, STATUS_NAMES } from '../ticketLabels'

const TITLES = {
  overdue: 'Overdue', escalations: 'Escalations', blocked: 'Blocked', waiting: 'Waiting for an engineer',
  engineers: 'Engineers', locations: 'Locations', categories: 'Categories',
}

// Facility vs technology categories: the theme's two `category` colours (checked for
// colour-blind readers in light and dark mode), always with a legend.
function Legend() {
  return (
    <Box sx={{ display: 'flex', gap: 2, mb: 1.5 }}>
      {['facility', 'technology'].map((type) => (
        <Box key={type} sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
          <Box sx={{ width: 12, height: 12, borderRadius: '2px', bgcolor: `category.${type}` }} />
          <Typography variant="body2">{type === 'facility' ? 'Facility' : 'Technology'}</Typography>
        </Box>
      ))}
    </Box>
  )
}

// Under a list the API cut short: "Showing 50 of 312 · See all on the Tickets page".
function MoreNote({ list, to }) {
  if (list.total <= list.tickets.length) return null
  return (
    <Typography variant="body2" color="text.secondary" sx={{ mt: 1.5 }}>
      Showing {list.tickets.length} of {list.total.toLocaleString()}
      {to && <> · <Link component={RouterLink} to={to}>See all on the Tickets page</Link></>}
    </Typography>
  )
}

// The Locations report: every building's ticket count; click one for its floors, then a floor
// for its seats. Where you are is in the link (?building=5&floor=54, next to the date range),
// so the browser's Back button works.
function LocationsReport() {
  const [params, setParams] = useSearchParams()
  const [report, setReport] = useState(null)
  const [error, setError] = useState('')
  const buildingId = params.get('building')
  const floorId = params.get('floor')

  const apiParams = new URLSearchParams()
  for (const key of ['from', 'to']) if (params.get(key)) apiParams.set(key, params.get(key))
  if (buildingId) apiParams.set('building_id', buildingId)
  if (floorId) apiParams.set('floor_id', floorId)
  const query = apiParams.toString()

  useEffect(() => {
    api('dashboard', `/locations?${query}`).then(setReport).catch((err) => setError(err.message))
  }, [query])

  // Moves to another level, keeping the date range: go({ building: 5 }), go({}) for all buildings.
  function go(place) {
    const next = new URLSearchParams()
    for (const key of ['from', 'to']) if (params.get(key)) next.set(key, params.get(key))
    for (const [key, value] of Object.entries(place)) next.set(key, value)
    setParams(next)
  }

  if (error) return <Alert severity="error">{error}</Alert>
  if (!report) return <Typography color="text.secondary">Loading…</Typography>

  // Buildings and floors can be clicked; seats are the last level.
  const rows = report.rows.map((row) => ({
    ...row,
    onClick: report.level === 'buildings' ? () => go({ building: row.id })
      : report.level === 'floors' ? () => go({ building: buildingId, floor: row.id }) : undefined,
  }))
  const total = report.rows.reduce((sum, r) => sum + r.value, 0)
  const notes = {
    buildings: 'Click a building to see its floors.',
    floors: 'Click a floor to see its seats.',
    seats: 'Seats with at least one ticket. "No seat given" is tickets that only named the floor.',
  }

  return (
    <Section title={report.floor_name || report.building_name || 'All buildings'}
      note={`${plural(total, 'ticket')} reported in the date range. ${notes[report.level]}`}>
      <Breadcrumbs sx={{ mb: 2 }}>
        {report.level === 'buildings' ? <Typography color="text.primary">All buildings</Typography>
          : <Link component="button" variant="body2" onClick={() => go({})}>All buildings</Link>}
        {report.level === 'floors' && <Typography color="text.primary">{report.building_name}</Typography>}
        {report.level === 'seats' && (
          <Link component="button" variant="body2" onClick={() => go({ building: buildingId })}>{report.building_name}</Link>
        )}
        {report.level === 'seats' && <Typography color="text.primary">{report.floor_name}</Typography>}
      </Breadcrumbs>
      <BarList rows={rows} empty="No tickets here in this date range." />
    </Section>
  )
}

// "High · In Progress · Lena Fischer"
function summary(t) {
  return `${PRIORITY_NAMES[t.priority]} · ${STATUS_NAMES[t.status]} · ${t.assignee_name || 'Not assigned'}`
}

export default function AdminReportPage() {
  const { kind } = useParams()
  const { search } = useLocation() // the dashboard's date range, e.g. "?from=2026-09-22&to=2026-10-21"
  // From a workload tile: one sub-specialty's engineers, e.g. ?category=Plumbing. The page is named after it.
  const category = kind === 'engineers' ? new URLSearchParams(search).get('category') || '' : ''
  const [data, setData] = useState(null)
  const [reloads, setReloads] = useState(0) // goes up after approving, rejecting or assigning
  const [assigning, setAssigning] = useState(null) // the ticket in the Assign popup
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')

  useEffect(() => {
    if (kind === 'locations') return // it loads its own data, one level at a time
    api('dashboard', `/${search}`).then(setData).catch((err) => setError(err.message))
  }, [kind, search, reloads])

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
        <Section title="Overdue" note={`${plural(data.overdue.total, 'unfinished ticket')} past the 3-day deadline, most late first`}>
          <TicketLines empty="Nothing is overdue.">
            {data.overdue.tickets.map((t) => (
              <TicketLine key={t.id} ticket={t} detail={`${summary(t)} · ${t.location}`}
                action={<Typography color="error" sx={{ fontWeight: 500 }}>{dueLabel(t).text}</Typography>} />
            ))}
          </TicketLines>
          <MoreNote list={data.overdue} to="/tickets?overdue=true&sort=oldest" />
        </Section>
      )
    }
    if (kind === 'escalations') {
      const pending = data.pending_escalations
      const decided = data.decided_escalations
      const asked = (t) => `${PRIORITY_NAMES[t.priority]} → ${PRIORITY_NAMES[t.requested_priority]}`
      return (
        <Stack spacing={2}>
          <Section title="Waiting for your review" note={plural(pending.total, 'request')}>
            <TicketLines empty="No escalations waiting for review.">
              {pending.tickets.map((t) => (
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
            <MoreNote list={pending} to="/tickets?escalation=pending&sort=oldest" />
          </Section>
          <Section title="Already decided" note={`${plural(decided.total, 'request')} on tickets reported in the dashboard's date range, newest first`}>
            <TicketLines empty="None yet.">
              {decided.tickets.map((t) => (
                <TicketLine key={t.id} ticket={t} quote={t.escalation_reason}
                  detail={`Asked for ${PRIORITY_NAMES[t.requested_priority]} · ${t.escalation_status === 'approved' ? 'Approved' : 'Rejected'}`} />
              ))}
            </TicketLines>
            <MoreNote list={decided} />
          </Section>
        </Stack>
      )
    }
    if (kind === 'blocked') {
      return (
        <Section title="Blocked" note={`${plural(data.blocked.total, 'ticket')} on hold, longest first`}>
          <TicketLines empty="Nothing is blocked.">
            {data.blocked.tickets.map((t) => (
              <TicketLine key={t.id} ticket={t} quote={t.blocked_reason}
                detail={`${t.assignee_name || 'Not assigned'} · ${PRIORITY_NAMES[t.priority]} · since ${formatDateTime(t.updated_at)}`} />
            ))}
          </TicketLines>
          <MoreNote list={data.blocked} to="/tickets?status=blocked&sort=oldest" />
        </Section>
      )
    }
    if (kind === 'waiting') {
      return (
        <Section title="Waiting for an engineer"
          note="Auto-assign couldn't place these: every matching engineer is full or Off duty. They're handed out as soon as a slot opens, highest priority first.">
          <TicketLines empty="Every ticket has an engineer.">
            {data.waiting.tickets.map((t) => (
              <TicketLine key={t.id} ticket={t}
                detail={`${t.category_name} (${t.category_type}) · ${PRIORITY_NAMES[t.priority]} · submitted ${formatDateTime(t.created_at)}`}
                action={<Button variant="outlined" size="small" onClick={() => setAssigning(t)}>Assign</Button>} />
            ))}
          </TicketLines>
          <MoreNote list={data.waiting} to="/tickets?status=open&sort=priority" />
        </Section>
      )
    }
    if (kind === 'engineers') {
      return (
        <Section title="Engineers">
          <EngineerTable engineers={data.engineers} cap={data.ticket_cap} onTime category={category} />
        </Section>
      )
    }
    if (kind === 'categories') {
      const count = (type) => data.categories.filter((c) => c.type === type).reduce((sum, c) => sum + c.value, 0)
      return (
        <Section title="Most common categories" note={`Facility ${count('facility')}, technology ${count('technology')}`}>
          <Legend />
          <BarList rows={data.categories.map((c) => ({ ...c, color: `category.${c.type}` }))} />
        </Section>
      )
    }
    return <Alert severity="warning">There's no report called “{kind}”.</Alert>
  }

  return (
    <Layout>
      <Link component={RouterLink} to="/" underline="hover">← Back to dashboard</Link>
      <Typography variant="h4" component="h1" sx={{ mt: 1, mb: 2 }}>{category || TITLES[kind] || 'Report'}</Typography>
      {error && <Alert severity="error" onClose={() => setError('')} sx={{ mb: 2 }}>{error}</Alert>}
      {kind === 'locations' ? <LocationsReport />
        : !data ? <Typography color="text.secondary">Loading…</Typography> : content()}

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
