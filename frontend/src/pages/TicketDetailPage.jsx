// One ticket: its details, and the actions you're allowed (edit, delete).
// The workflow diagram, status, assigning and priority come in step 6; notes in step 7.

import { useEffect, useState } from 'react'
import { Link as RouterLink, useNavigate, useParams } from 'react-router-dom'
import {
  Alert, Box, Button, Dialog, DialogActions, DialogContent, DialogContentText, DialogTitle,
  Link, Paper, Snackbar, Stack, Typography,
} from '@mui/material'
import Layout from '../components/Layout'
import TicketDialog from '../components/TicketDialog'
import { PriorityChip, StatusChip } from '../components/TicketChips'
import { api } from '../services/api'
import { useAuth } from '../services/AuthContext'
import { formatDateTime, formatLocation } from '../ticketLabels'

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
  const [message, setMessage] = useState('')

  useEffect(() => {
    api('tickets', `/${id}`).then(setTicket).catch((err) => setError(err.message))
  }, [id])

  async function confirmDelete() {
    setDeleting(false)
    try {
      await api('tickets', `/${ticket.id}`, { method: 'DELETE' })
      navigate('/tickets', { state: { message: `${ticket.number} was deleted` } })
    } catch (err) {
      setError(err.message)
    }
  }

  const back = <Link component={RouterLink} to="/tickets">← Back to tickets</Link>

  if (!ticket) {
    return (
      <Layout>
        {back}
        {error ? <Alert severity="error" sx={{ mt: 2 }}>{error}</Alert> : <Typography sx={{ mt: 2 }}>Loading…</Typography>}
      </Layout>
    )
  }

  // Same rules as the API: the reporter while it's Open, or an admin.
  const isAdmin = user.role === 'admin'
  const canEdit = isAdmin || (ticket.reporter_id === user.id && ticket.status === 'open')

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
            {isAdmin && <Button variant="outlined" color="error" onClick={() => setDeleting(true)}>Delete</Button>}
          </Stack>
        </Box>

        <Typography sx={{ mt: 3, whiteSpace: 'pre-wrap' }}>{ticket.description}</Typography>

        <Box sx={{ mt: 3, display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr', md: '1fr 1fr 1fr' } }}>
          <Detail label="Category">{ticket.category_name}</Detail>
          <Detail label="Location">{formatLocation(ticket)}</Detail>
          <Detail label="Reported by">{ticket.reporter_name}</Detail>
          <Detail label="Assigned to">{ticket.assignee_name || 'Not assigned yet'}</Detail>
          <Detail label="Reported">{formatDateTime(ticket.created_at)}</Detail>
          <Detail label="Last updated">{formatDateTime(ticket.updated_at)}</Detail>
        </Box>
      </Paper>

      {editing && (
        <TicketDialog ticket={ticket} onClose={() => setEditing(false)}
          onSaved={(saved) => { setEditing(false); setTicket(saved); setMessage(`${saved.number} saved`) }} />
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
