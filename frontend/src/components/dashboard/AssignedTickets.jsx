// The engineer's assigned tickets, in working order (overdue first, then highest priority,
// then due soonest; the API sorts them). Filter by status. Each row: number, title (and why
// it's on hold), where, priority, status and when it's due. Click to open the full ticket,
// which has the status buttons and notes.

import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Box, ButtonBase, ToggleButton, ToggleButtonGroup, Typography } from '@mui/material'
import { PriorityChip, StatusChip } from '../TicketChips'
import { dueLabel, STATUS_NAMES } from '../../ticketLabels'

const FILTERS = ['assigned', 'in_progress', 'blocked', 'resolved']

export default function AssignedTickets({ rows }) {
  const navigate = useNavigate()
  const [status, setStatus] = useState('all')
  const shown = rows.filter((t) => status === 'all' || t.status === status)

  return (
    <>
      <ToggleButtonGroup exclusive size="small" color="primary" value={status} aria-label="Status"
        onChange={(e, value) => value && setStatus(value)} sx={{ mb: 1.5, flexWrap: 'wrap' }}>
        <ToggleButton value="all">All</ToggleButton>
        {FILTERS.map((s) => <ToggleButton key={s} value={s}>{STATUS_NAMES[s]}</ToggleButton>)}
      </ToggleButtonGroup>

      {shown.length === 0 ? (
        <Typography color="text.secondary">{rows.length === 0 ? 'Nothing is assigned to you right now.' : 'No tickets with this status.'}</Typography>
      ) : (
        <Box component="ul" sx={{ listStyle: 'none', m: 0, p: 0, borderTop: 1, borderColor: 'divider' }}>
          {shown.map((t) => {
            const due = dueLabel(t)
            return (
              <Box component="li" key={t.id} sx={{ borderBottom: 1, borderColor: 'divider' }}>
                <ButtonBase onClick={() => navigate(`/tickets/${t.id}`)} sx={{
                  width: '100%', textAlign: 'left', px: 1, py: 1.25, gap: 1.5, display: 'grid', alignItems: 'center',
                  gridTemplateColumns: { xs: '9px 1fr auto', md: '9px 84px 1fr 200px 80px 96px 130px' },
                  '&:hover': { bgcolor: 'action.hover' },
                }}>
                  <Box component="span" title={t.news ? 'New note or change since you last opened it' : undefined}
                    sx={{ width: 9, height: 9, borderRadius: '50%', bgcolor: t.news ? 'primary.main' : 'transparent' }} />
                  <Typography sx={{ fontWeight: 500, color: 'primary.main', display: { xs: 'none', md: 'block' } }}>{t.number}</Typography>
                  <Box sx={{ minWidth: 0 }}>
                    <Typography noWrap>{t.title}</Typography>
                    {t.status === 'blocked' && t.blocked_reason && (
                      <Typography variant="body2" color="text.secondary" noWrap>On hold: {t.blocked_reason}</Typography>
                    )}
                  </Box>
                  <Typography variant="body2" sx={{ display: { xs: 'none', md: 'block' } }}>{t.location}</Typography>
                  <Box sx={{ display: { xs: 'none', md: 'block' } }}><PriorityChip priority={t.priority} /></Box>
                  <Box sx={{ display: { xs: 'none', md: 'block' } }}><StatusChip status={t.status} /></Box>
                  <Typography variant="body2" sx={{ textAlign: 'right', color: due.late ? 'error.main' : 'text.secondary', fontWeight: due.late ? 500 : 400 }}>
                    {due.text}
                  </Typography>
                </ButtonBase>
              </Box>
            )
          })}
        </Box>
      )}
      <Typography variant="body2" color="text.secondary" sx={{ mt: 1.5 }}>
        A blue dot means a new note or change since you last opened it. Every ticket is due 3 days after it's submitted.
      </Typography>
    </>
  )
}
