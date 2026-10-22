// The tickets someone submitted: three stage tiles, then the list with Submit a ticket
// beside it. It's the whole employee dashboard, and the engineer's Submitted Tickets tab.

import { useState } from 'react'
import { Box } from '@mui/material'
import MyTicketDialog from './MyTicketDialog'
import MyTickets from './MyTickets'
import { CountTile, Section } from './DashboardParts'
import { plural } from './dashboardFormat'
import SubmitTicketButton from '../SubmitTicketButton'
import { EMPLOYEE_STAGES, employeeStage } from '../../ticketLabels'
import { useIsPhone } from '../../services/useIsPhone'

// The top edge colour of each stage tile (the same colours as the stage chips).
const STAGE_EDGES = { assigned: 'info.main', in_progress: 'warning.main', resolved: 'success.main' }

export default function SubmittedTickets({ data, user, onSubmitted }) {
  const [viewingId, setViewingId] = useState(null) // the ticket opened from View after submitting
  const isPhone = useIsPhone()

  // Six statuses folded into three stages (see employeeStage in ticketLabels.js).
  const counts = { assigned: 0, in_progress: 0, resolved: 0 }
  for (const [status, count] of Object.entries(data.by_status)) counts[employeeStage(status)] += count
  const withNews = data.tickets.filter((t) => t.news).length

  return (
    <Box sx={{ display: 'grid', gap: 2 }}>
      <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: { xs: 1, sm: 2 } }}>
        {Object.entries(EMPLOYEE_STAGES).map(([stage, s]) => (
          <CountTile key={stage} count={counts[stage]} name={s.name} edge={STAGE_EDGES[stage]} />
        ))}
      </Box>

      {/* On a phone the button is full width above the list; otherwise it sits beside the heading. */}
      {isPhone && <SubmitTicketButton onSubmitted={onSubmitted} onView={(ticket) => setViewingId(ticket.id)} fullWidth size="large" />}
      <Section title="Submitted Tickets"
        note={withNews ? `${plural(withNews, 'ticket')} with news since you last looked` : 'Click a ticket to see its progress and notes'}
        action={!isPhone && <SubmitTicketButton onSubmitted={onSubmitted} onView={(ticket) => setViewingId(ticket.id)} />}>
        <MyTickets rows={data.tickets} user={user} />
      </Section>

      {viewingId && <MyTicketDialog ticketId={viewingId} user={user} onClose={() => setViewingId(null)} />}
    </Box>
  )
}
