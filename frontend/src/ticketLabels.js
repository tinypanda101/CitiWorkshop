// How ticket statuses and priorities are shown on screen, and the colour of their chips.
// Open = waiting for an engineer; Assigned = an engineer has it but hasn't started.
export const STATUS_NAMES = {
  open: 'Open', assigned: 'Assigned', in_progress: 'In Progress', blocked: 'Blocked', resolved: 'Resolved', closed: 'Closed',
}
export const STATUS_COLORS = {
  open: 'default', assigned: 'info', in_progress: 'primary', blocked: 'error', resolved: 'success', closed: 'default',
}
export const PRIORITY_NAMES = { low: 'Low', medium: 'Medium', high: 'High', critical: 'Critical' }
export const PRIORITY_COLORS = { low: 'default', medium: 'info', high: 'warning', critical: 'error' }

// "21 Oct 2026, 08:44" in the viewer's own time zone.
export function formatDateTime(iso) {
  return new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
}

export function formatDate(iso) {
  return new Date(iso).toLocaleDateString(undefined, { dateStyle: 'medium' })
}

// "Headquarters · Floor 1 · HQ-1-01" (the seat is left out when there isn't one).
export function formatLocation(ticket) {
  return [ticket.building_name, ticket.floor_name, ticket.seat_code].filter(Boolean).join(' · ')
}

// The workflow for engineers (the same table as ENGINEER_MOVES in backend/tickets/router.py):
// from each status, where they can move it next. Open -> Assigned happens by assigning.
export const NEXT_STEPS = {
  open: [],
  assigned: [{ status: 'in_progress', label: 'Start work' }],
  in_progress: [{ status: 'blocked', label: 'Mark blocked' }, { status: 'resolved', label: 'Resolve' }],
  blocked: [{ status: 'in_progress', label: 'Unblock' }],
  resolved: [{ status: 'in_progress', label: 'Reopen' }, { status: 'closed', label: 'Close' }],
  closed: [],
}

// The priority levels this person may set (the same rule as allowed_priorities in the API).
// Reporters can't; they request a higher priority instead.
export function allowedPriorities(user, ticket) {
  if (user.role === 'admin' || (user.role === 'engineer' && ticket.assignee_id === user.id)) {
    return ['low', 'medium', 'high', 'critical']
  }
  return []
}

// Employees see three simple stages instead of the six statuses.
export const EMPLOYEE_STAGES = {
  assigned: { name: 'Assigned', color: 'info' }, // an engineer has it, or one is being found
  in_progress: { name: 'In Progress', color: 'warning' },
  resolved: { name: 'Resolved', color: 'success' },
}

// Which stage a status counts as: Open (still waiting for an engineer) is shown under
// Assigned, Blocked is still In Progress, Closed is Resolved.
export function employeeStage(status) {
  if (status === 'open') return 'assigned'
  if (status === 'blocked') return 'in_progress'
  if (status === 'closed') return 'resolved'
  return status
}

// The fixed 3-day deadline as words: "Due in 2 days", "Due today", "Overdue by 1 day",
// or for finished tickets "Resolved on time" / "Resolved late". `late` makes it red.
export function dueLabel(ticket) {
  const due = new Date(ticket.due_at)
  if (['resolved', 'closed'].includes(ticket.status)) {
    const onTime = ticket.resolved_at && new Date(ticket.resolved_at) <= due
    return { text: onTime ? 'Resolved on time' : 'Resolved late', late: false }
  }
  const startOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate())
  const days = Math.round((startOfDay(due) - startOfDay(new Date())) / 86400000) // whole calendar days
  const plural = (n) => `${n} ${n === 1 ? 'day' : 'days'}`
  if (due < new Date()) return { text: days === 0 ? 'Overdue today' : `Overdue by ${plural(-days)}`, late: true }
  if (days === 0) return { text: 'Due today', late: false }
  if (days === 1) return { text: 'Due tomorrow', late: false }
  return { text: `Due in ${plural(days)}`, late: false }
}
