// How ticket statuses and priorities are shown on screen, and the colour of their chips.
export const STATUS_NAMES = {
  open: 'Open', in_progress: 'In Progress', blocked: 'Blocked', resolved: 'Resolved', closed: 'Closed',
}
export const STATUS_COLORS = {
  open: 'info', in_progress: 'primary', blocked: 'error', resolved: 'success', closed: 'default',
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

// "Headquarters · Floor 1 · HQ-101" (the seat is left out when there isn't one).
export function formatLocation(ticket) {
  return [ticket.building_name, ticket.floor_name, ticket.seat_code].filter(Boolean).join(' · ')
}
