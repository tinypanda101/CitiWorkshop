// Small coloured labels for a ticket's status, priority and (for employees) stage.

import { Chip } from '@mui/material'
import {
  EMPLOYEE_STAGES, employeeStage, PRIORITY_COLORS, PRIORITY_NAMES, STATUS_COLORS, STATUS_NAMES,
} from '../ticketLabels'

export function StatusChip({ status }) {
  return <Chip size="small" label={STATUS_NAMES[status]} color={STATUS_COLORS[status]} />
}

export function PriorityChip({ priority }) {
  return <Chip size="small" variant="outlined" label={PRIORITY_NAMES[priority]} color={PRIORITY_COLORS[priority]} />
}

// An employee's view of the status: Open, In Progress or Resolved.
// A ticket still waiting for an engineer says so instead.
export function StageChip({ status }) {
  const stage = EMPLOYEE_STAGES[employeeStage(status)]
  const label = status === 'open' ? 'Waiting for an engineer' : stage.name
  return <Chip size="small" label={label} color={stage.color} variant="outlined" />
}
