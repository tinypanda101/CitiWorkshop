// The reporter's side of an escalation: a "Request higher priority" button that opens a
// popup (pick a higher level + say why), and afterwards a line saying what happened to it.
// Reporters can't change the priority themselves; a Facility Admin approves or rejects.

import { useState } from 'react'
import { Box, Button, ToggleButton, ToggleButtonGroup, Typography } from '@mui/material'
import TextDialog from './TextDialog'
import { api } from '../services/api'
import { PRIORITY_NAMES } from '../ticketLabels'

export default function EscalationRequest({ ticket, onChanged }) {
  const [open, setOpen] = useState(false)
  // Only levels above the current priority can be asked for.
  const higher = ticket.priority === 'high' ? ['critical'] : ['high', 'critical']
  const [requested, setRequested] = useState(higher[0])

  const requestedName = PRIORITY_NAMES[ticket.requested_priority]
  const canRequest = ticket.priority !== 'critical' && ticket.status !== 'closed' && ticket.escalation_status !== 'pending'

  return (
    <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 1.5 }}>
      {ticket.escalation_status === 'pending' && (
        <Typography variant="body2" color="text.secondary">{requestedName} requested, waiting for a Facility Admin</Typography>
      )}
      {ticket.escalation_status === 'approved' && (
        <Typography variant="body2" color="text.secondary">Your request for {requestedName} was approved</Typography>
      )}
      {ticket.escalation_status === 'rejected' && (
        <Typography variant="body2" color="text.secondary">Your request for {requestedName} was rejected</Typography>
      )}
      {canRequest && (
        <Button size="small" variant="outlined" onClick={() => { setRequested(higher[0]); setOpen(true) }}>
          Request higher priority
        </Button>
      )}

      {open && (
        <TextDialog title="Request higher priority" label="Why does it need this priority?" saveLabel="Send request"
          onClose={() => setOpen(false)}
          onSave={async (reason) => {
            const saved = await api('tickets', `/${ticket.id}/escalation`, {
              method: 'POST', body: { requested_priority: requested, reason },
            })
            setOpen(false)
            onChanged(saved, 'Request sent to the Facility Admins')
          }}>
          <Typography variant="body2" color="text.secondary">
            {ticket.number} is {PRIORITY_NAMES[ticket.priority]} now. A Facility Admin will approve or reject your request.
          </Typography>
          <div>
            <Typography variant="caption" color="text.secondary" component="div" sx={{ mb: 0.5 }}>Change it to</Typography>
            <ToggleButtonGroup exclusive size="small" color="primary" value={requested}
              onChange={(e, value) => value && setRequested(value)}>
              {higher.map((p) => <ToggleButton key={p} value={p}>{PRIORITY_NAMES[p]}</ToggleButton>)}
            </ToggleButtonGroup>
          </div>
        </TextDialog>
      )}
    </Box>
  )
}
