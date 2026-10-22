// The popup an employee sees when they click one of their tickets: its stage (as a name,
// not the diagram), engineer, priority with Request higher priority, where it is, what's
// wrong, and the notes. They can't change anything else after submitting.

import { useEffect, useState } from 'react'
import { Alert, Box, DialogContent, DialogTitle, IconButton, Typography } from '@mui/material'
import CloseIcon from '@mui/icons-material/Close'
import Dialog from '../ResponsiveDialog' // full screen on phones
import EscalationRequest from '../EscalationRequest'
import TicketNotes from '../TicketNotes'
import { StageChip } from '../TicketChips'
import { api } from '../../services/api'
import { formatDateTime, formatLocation, PRIORITY_NAMES } from '../../ticketLabels'

function Detail({ label, children }) {
  return (
    <Box>
      <Typography variant="caption" color="text.secondary">{label}</Typography>
      <Box sx={{ mt: 0.25 }}>{children}</Box>
    </Box>
  )
}

export default function MyTicketDialog({ ticketId, user, onClose }) {
  const [ticket, setTicket] = useState(null)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')

  useEffect(() => {
    api('tickets', `/${ticketId}`).then(setTicket).catch((err) => setError(err.message))
  }, [ticketId])

  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="sm" scroll="body" closeButton={false}>
      <DialogTitle sx={{ display: 'flex', alignItems: 'flex-start', gap: 2, pr: 1 }}>
        <Box sx={{ flexGrow: 1 }}>
          <Typography variant="body2" color="text.secondary">{ticket?.number}</Typography>
          <Typography variant="h6" component="span">{ticket?.title || 'Loading…'}</Typography>
        </Box>
        <IconButton aria-label="Close" onClick={onClose}><CloseIcon /></IconButton>
      </DialogTitle>
      <DialogContent>
        {error && <Alert severity="error">{error}</Alert>}
        {ticket && (
          <>
            {message && <Alert severity="success" onClose={() => setMessage('')} sx={{ mb: 2 }}>{message}</Alert>}
            <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' } }}>
              <Detail label="Progress">
                <StageChip status={ticket.status} />
                {ticket.status === 'blocked' && (
                  <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>On hold: {ticket.blocked_reason}</Typography>
                )}
                {ticket.resolution_summary && ['resolved', 'closed'].includes(ticket.status) && (
                  <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>Fix: {ticket.resolution_summary}</Typography>
                )}
              </Detail>
              <Detail label="Engineer">
                <Typography>{ticket.assignee_name || 'Not assigned yet'}</Typography>
              </Detail>
              <Detail label="Priority">
                <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 1.5 }}>
                  <Typography>{PRIORITY_NAMES[ticket.priority]}</Typography>
                  <EscalationRequest ticket={ticket}
                    onChanged={(saved, changeMessage) => { setTicket(saved); setMessage(changeMessage) }} />
                </Box>
              </Detail>
              <Detail label="Where">
                <Typography>{formatLocation(ticket)}</Typography>
                <Typography variant="body2" color="text.secondary">{ticket.category_name}</Typography>
              </Detail>
            </Box>
            <Typography sx={{ mt: 2, whiteSpace: 'pre-wrap' }}>{ticket.description}</Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
              Submitted {formatDateTime(ticket.created_at)}
              {ticket.assigned_at && ` · Engineer assigned ${formatDateTime(ticket.assigned_at)}`}
            </Typography>
            <TicketNotes ticket={ticket} user={user} />
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
