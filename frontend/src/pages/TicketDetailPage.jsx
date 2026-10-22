// One ticket (for engineers and admins): its details with the reporter's contact, the
// status card (status, priority, escalation), and the notes.
// Each part only shows the actions you're allowed; the API checks the same rules.

import { useEffect, useState } from 'react'
import { Link as RouterLink, useNavigate, useParams } from 'react-router-dom'
import {
  Alert, Box, Button, Dialog, DialogActions, DialogContent, DialogContentText, DialogTitle,
  Link, Paper, Snackbar, Stack, Typography,
} from '@mui/material'
import Layout from '../components/Layout'
import AssignDialog from '../components/AssignDialog'
import TicketDialog from '../components/TicketDialog'
import TicketNotes from '../components/TicketNotes'
import TicketWorkflow from '../components/TicketWorkflow'
import { PriorityChip, StatusChip } from '../components/TicketChips'
import { api } from '../services/api'
import { useAuth } from '../services/AuthContext'
import { dueLabel, formatDateTime, formatLocation } from '../ticketLabels'

function Detail({ label, children }) {
  return (
    <Box>
      <Typography variant="caption" color="text.secondary">{label}</Typography>
      <Typography>{children}</Typography>
    </Box>
  )
}

export default function TicketDetailPage() {
  const { id } = useParams()
  const { user } = useAuth()
  const navigate = useNavigate()
  const [ticket, setTicket] = useState(null)
  const [error, setError] = useState('')
  const [editing, setEditing] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [assigning, setAssigning] = useState(false)
  const [message, setMessage] = useState('')

  useEffect(() => {
    api('tickets', `/${id}`).then(setTicket).catch((err) => setError(err.message))
    // Opening the ticket counts as having looked at it (clears its New marker on the dashboard).
    api('tickets', `/${id}/seen`, { method: 'POST' }).catch(() => {})
  }, [id])

  // Your own changes aren't news to you either.
  function markSeen() {
    api('tickets', `/${id}/seen`, { method: 'POST' }).catch(() => {})
  }

  async function confirmDelete() {
    setDeleting(false)
    try {
      await api('tickets', `/${ticket.id}`, { method: 'DELETE' })
      navigate('/tickets', { state: { message: `${ticket.number} was deleted` } })
    } catch (err) {
      setError(err.message)
    }
  }

  // Only admins have the Tickets page; engineers work from their dashboard.
  const back = user.role === 'admin'
    ? <Link component={RouterLink} to="/tickets">← Back to tickets</Link>
    : <Link component={RouterLink} to="/">← Back to dashboard</Link>

  if (!ticket) {
    return (
      <Layout>
        {back}
        {error ? <Alert severity="error" sx={{ mt: 2 }}>{error}</Alert> : <Typography sx={{ mt: 2 }}>Loading…</Typography>}
      </Layout>
    )
  }

  // Same rule as the API: only admins edit a ticket after it's submitted.
  const isAdmin = user.role === 'admin'
  const canEdit = isAdmin

  return (
    <Layout>
      {back}
      {error && <Alert severity="error" onClose={() => setError('')} sx={{ mt: 2 }}>{error}</Alert>}

      <Paper variant="outlined" sx={{ p: 3, mt: 2 }}>
        <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap', alignItems: 'flex-start' }}>
          <Box sx={{ flexGrow: 1 }}>
            <Typography variant="overline" color="text.secondary">{ticket.number}</Typography>
            <Typography variant="h5" component="h1">{ticket.title}</Typography>
            <Stack direction="row" spacing={1} sx={{ mt: 1 }}>
              <StatusChip status={ticket.status} />
              <PriorityChip priority={ticket.priority} />
            </Stack>
          </Box>
          <Stack direction="row" spacing={1}>
            {canEdit && <Button variant="outlined" onClick={() => setEditing(true)}>Edit</Button>}
            {isAdmin && <Button variant="outlined" onClick={() => setAssigning(true)}>Assign</Button>}
            {isAdmin && <Button variant="outlined" color="error" onClick={() => setDeleting(true)}>Delete</Button>}
          </Stack>
        </Box>

        <Typography sx={{ mt: 3, whiteSpace: 'pre-wrap' }}>{ticket.description}</Typography>

        <Box sx={{ mt: 3, display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr', md: '1fr 1fr 1fr' } }}>
          <Detail label="Category">{ticket.category_name}</Detail>
          <Detail label="Location">{formatLocation(ticket)}</Detail>
          <Detail label="Contact">{ticket.reporter_name} · {ticket.reporter_email}</Detail>
          <Detail label="Assigned to">
            {ticket.assignee_name ? `${ticket.assignee_name} (since ${formatDateTime(ticket.assigned_at)})` : 'Not assigned yet'}
          </Detail>
          <Detail label="Reported">{formatDateTime(ticket.created_at)}</Detail>
          <Detail label="Deadline">
            {formatDateTime(ticket.due_at)}{' '}
            <Typography component="span" variant="body2" color={dueLabel(ticket).late ? 'error.main' : 'text.secondary'}>
              ({dueLabel(ticket).text})
            </Typography>
          </Detail>
          <Detail label="Last updated">{formatDateTime(ticket.updated_at)}</Detail>
          {ticket.blocked_reason && (
            <Detail label={ticket.status === 'blocked' ? 'Blocked because' : 'Was blocked because'}>{ticket.blocked_reason}</Detail>
          )}
          {ticket.resolution_summary && <Detail label="Resolution">{ticket.resolution_summary}</Detail>}
          {ticket.resolved_at && <Detail label="Resolved">{formatDateTime(ticket.resolved_at)}</Detail>}
        </Box>
      </Paper>

      <TicketWorkflow ticket={ticket} user={user}
        onChanged={(saved, changeMessage) => { setTicket(saved); setMessage(changeMessage); markSeen() }} />
      <TicketNotes ticket={ticket} user={user} />

      {editing && (
        <TicketDialog ticket={ticket} onClose={() => setEditing(false)}
          onSaved={(saved) => { setEditing(false); setTicket(saved); setMessage(`${saved.number} saved`) }} />
      )}

      {assigning && (
        <AssignDialog ticket={ticket} onClose={() => setAssigning(false)}
          onSaved={(saved) => {
            setAssigning(false)
            setTicket(saved)
            setMessage(saved.assignee_name ? `Assigned to ${saved.assignee_name}` : `${saved.number} unassigned`)
          }} />
      )}

      {deleting && (
        <Dialog open onClose={() => setDeleting(false)}>
          <DialogTitle>Delete {ticket.number}?</DialogTitle>
          <DialogContent>
            <DialogContentText>Its notes will be deleted too. This can't be undone.</DialogContentText>
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setDeleting(false)}>Cancel</Button>
            <Button color="error" variant="contained" onClick={confirmDelete}>Delete</Button>
          </DialogActions>
        </Dialog>
      )}

      <Snackbar open={!!message} message={message} autoHideDuration={4000} onClose={() => setMessage('')}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }} />
    </Layout>
  )
}
