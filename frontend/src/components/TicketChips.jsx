// Small coloured labels for a ticket's status and priority.

import { Chip } from '@mui/material'
import { PRIORITY_COLORS, PRIORITY_NAMES, STATUS_COLORS, STATUS_NAMES } from '../ticketLabels'

export function StatusChip({ status }) {
  return <Chip size="small" label={STATUS_NAMES[status]} color={STATUS_COLORS[status]} />
}

export function PriorityChip({ priority }) {
  return <Chip size="small" variant="outlined" label={PRIORITY_NAMES[priority]} color={PRIORITY_COLORS[priority]} />
}
