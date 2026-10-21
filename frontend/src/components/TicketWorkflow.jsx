// The Status card on the ticket page: the current status, a "Change status to" dropdown
// with only the moves you're allowed (plus a box for the reason when Blocking or Resolving),
// the priority, and escalation requests. Every change goes to the API, which checks the same
// rules; `onChanged(ticket, message)` gives the page the updated ticket.

import { useState } from 'react'
import { Alert, Box, Button, MenuItem, Paper, Stack, TextField, Typography } from '@mui/material'
import EscalationRequest from './EscalationRequest'
import { StatusChip } from './TicketChips'
import { api } from '../services/api'
import { allowedPriorities, NEXT_STEPS, PRIORITY_NAMES, STATUS_NAMES } from '../ticketLabels'

// Moving to these statuses needs some text first.
const NEEDS_TEXT = {
  blocked: { field: 'blocked_reason', label: 'What is blocking it?' },
  resolved: { field: 'resolution_summary', label: 'What was done to fix it?' },
}

// Admins can move a ticket to any of these. Open and Assigned come from (un)assigning.
const ADMIN_STATUSES = ['in_progress', 'blocked', 'resolved', 'closed']

// What staff see about an escalation request; admins can approve or reject it here.
function EscalationBanner({ ticket, isAdmin, onReview }) {
  const requested = PRIORITY_NAMES[ticket.requested_priority]
  if (ticket.escalation_status === 'pending') {
    return (
      <Alert severity="info" action={isAdmin && (
        <Stack direction="row" spacing={1}>
          <Button color="inherit" size="small" onClick={() => onReview('approve')}>Approve</Button>
          <Button color="inherit" size="small" onClick={() => onReview('reject')}>Reject</Button>
        </Stack>
      )}>
        Escalation to <b>{requested}</b> requested: “{ticket.escalation_reason}”
      </Alert>
    )
  }
  if (ticket.escalation_status === 'approved') return <Alert severity="success">Escalation to {requested} was approved.</Alert>
  if (ticket.escalation_status === 'rejected') return <Alert severity="warning">Escalation to {requested} was rejected.</Alert>
  return null
}

export default function TicketWorkflow({ ticket, user, onChanged }) {
  const [next, setNext] = useState('') // the status picked in the dropdown
  const [text, setText] = useState('') // the reason / summary, when the picked status needs one
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  const isAdmin = user.role === 'admin'
  const isReporter = ticket.reporter_id === user.id
  const canMove = isAdmin || (user.role === 'engineer' && ticket.assignee_id === user.id)
  const priorities = allowedPriorities(user, ticket)
  // The reporter asks for a higher priority instead (admins set it directly).
  const showRequest = isReporter && priorities.length === 0

  // The statuses this person can pick from here.
  const choices = isAdmin
    ? ADMIN_STATUSES.filter((s) => s !== ticket.status)
    : NEXT_STEPS[ticket.status].map((step) => step.status)

  // e.g. send('PUT', 'status', { status: 'closed' }, 'Moved to Closed')
  async function send(method, path, body, message) {
    setError('')
    const saved = await api('tickets', `/${ticket.id}/${path}`, { method, body })
    onChanged(saved, message)
  }

  async function updateStatus(event) {
    event.preventDefault()
    setSaving(true)
    try {
      const body = { status: next }
      if (NEEDS_TEXT[next]) body[NEEDS_TEXT[next].field] = text
      await send('PUT', 'status', body, `Moved to ${STATUS_NAMES[next]}`)
      setNext('')
      setText('')
    } catch (err) {
      setError(Object.values(err.details || {})[0] || err.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Paper variant="outlined" sx={{ p: 3, mt: 2 }}>
      <Typography variant="h6" component="h2" gutterBottom>Status</Typography>
      <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
        <Typography>Current status:</Typography>
        <StatusChip status={ticket.status} />
      </Box>
      {error && <Alert severity="error" onClose={() => setError('')} sx={{ mt: 2 }}>{error}</Alert>}

      {canMove && choices.length > 0 && (
        <Stack component="form" spacing={1.5} onSubmit={updateStatus} sx={{ mt: 2, maxWidth: 480 }}>
          <Box sx={{ display: 'flex', gap: 1.5, flexWrap: 'wrap', alignItems: 'center' }}>
            <TextField select size="small" label="Change status to" value={next} sx={{ minWidth: 200 }}
              onChange={(e) => { setNext(e.target.value); setText('') }}>
              {choices.map((s) => <MenuItem key={s} value={s}>{STATUS_NAMES[s]}</MenuItem>)}
            </TextField>
            <Button type="submit" variant="contained" disabled={!next || saving}>{saving ? 'Saving…' : 'Update status'}</Button>
          </Box>
          {NEEDS_TEXT[next] && (
            <TextField label={NEEDS_TEXT[next].label} required multiline minRows={2} value={text}
              onChange={(e) => setText(e.target.value)} autoFocus />
          )}
        </Stack>
      )}
      {canMove && choices.length === 0 && (
        <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>This ticket is closed. An admin can reopen it.</Typography>
      )}

      <Box sx={{ display: 'flex', gap: 2, mt: 2, flexWrap: 'wrap', alignItems: 'center' }}>
        {priorities.length > 0 && (
          <TextField select size="small" label="Priority" value={ticket.priority} sx={{ minWidth: 140 }}
            onChange={(e) => send('PUT', 'priority', { priority: e.target.value }, `Priority set to ${PRIORITY_NAMES[e.target.value]}`)
              .catch((err) => setError(err.message))}>
            {Object.entries(PRIORITY_NAMES).map(([value, name]) => <MenuItem key={value} value={value}>{name}</MenuItem>)}
          </TextField>
        )}
        {showRequest && (
          <>
            <Typography>Priority: {PRIORITY_NAMES[ticket.priority]}</Typography>
            <EscalationRequest ticket={ticket} onChanged={onChanged} />
          </>
        )}
      </Box>

      {!showRequest && (
        <Box sx={{ mt: 2 }}>
          <EscalationBanner ticket={ticket} isAdmin={isAdmin}
            onReview={(decision) => send('PUT', 'escalation', { decision }, decision === 'approve' ? 'Escalation approved' : 'Escalation rejected')
              .catch((err) => setError(err.message))} />
        </Box>
      )}
    </Paper>
  )
}
