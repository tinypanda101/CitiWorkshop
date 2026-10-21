// Small building blocks shared by the three dashboards.

import { Link as RouterLink } from 'react-router-dom'
import { Box, Link, Paper, Typography } from '@mui/material'

// A titled section. `note` is a short line under the title, e.g. "3 blocked";
// `action` sits on the right of the title (e.g. a button).
export function Section({ title, note, action, children, sx }) {
  return (
    <Paper variant="outlined" component="section" sx={{ p: { xs: 2, sm: 3 }, ...sx }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, flexWrap: 'wrap' }}>
        <Box sx={{ flexGrow: 1 }}>
          <Typography variant="h6" component="h2">{title}</Typography>
          {note && <Typography variant="body2" color="text.secondary">{note}</Typography>}
        </Box>
        {action}
      </Box>
      <Box sx={{ mt: 2 }}>{children}</Box>
    </Paper>
  )
}

// Two sections side by side on wide screens, stacked on narrow ones.
export function Pair({ children }) {
  return (
    <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, alignItems: 'start' }}>
      {children}
    </Box>
  )
}

// A count with a coloured top edge, e.g. "3 / In Progress / An engineer is working on it".
// With `to`, the tile is a link to that page.
export function CountTile({ count, name, meaning, edge, to }) {
  const link = to ? { component: RouterLink, to } : {}
  return (
    <Paper variant="outlined" {...link} sx={{
      p: 2, borderTop: 4, borderTopColor: edge, textDecoration: 'none', color: 'inherit',
      ...(to && { '&:hover': { bgcolor: 'action.hover' } }),
    }}>
      <Typography variant="h3" component="p" sx={{ fontWeight: 400, fontVariantNumeric: 'tabular-nums' }}>{count}</Typography>
      <Typography variant="subtitle1" sx={{ fontWeight: 500 }}>{name}</Typography>
      <Typography variant="body2" color="text.secondary">{meaning}</Typography>
    </Paper>
  )
}

// A button-like link to another page, e.g. "4 / Overdue / Past the 3-day deadline  ›".
// `count` is optional.
export function LinkTile({ to, count, name, meaning, edge = 'divider' }) {
  return (
    <Paper variant="outlined" component={RouterLink} to={to} sx={{
      p: 1.5, display: 'flex', alignItems: 'center', gap: 1.5, borderLeft: 4, borderLeftColor: edge,
      textDecoration: 'none', color: 'inherit', '&:hover': { bgcolor: 'action.hover' },
    }}>
      {count !== undefined && (
        <Typography variant="h4" component="span" sx={{ minWidth: 32, fontVariantNumeric: 'tabular-nums' }}>{count}</Typography>
      )}
      <Box sx={{ flexGrow: 1 }}>
        <Typography sx={{ fontWeight: 500 }}>{name}</Typography>
        <Typography variant="body2" color="text.secondary">{meaning}</Typography>
      </Box>
      <Typography color="primary" sx={{ fontSize: 22 }} aria-hidden>›</Typography>
    </Paper>
  )
}

// One number with what it means, e.g. "1h 20m / Average time to assign".
export function StatTile({ value, label }) {
  return (
    <Box>
      <Typography variant="h4" component="p" sx={{ fontWeight: 500, fontVariantNumeric: 'tabular-nums' }}>{value}</Typography>
      <Typography variant="body2" color="text.secondary">{label}</Typography>
    </Box>
  )
}

// A ticket in a list: number and title link to it, then one line of detail and an
// optional quoted reason. `action` (e.g. buttons) sits on the right.
export function TicketLine({ ticket, detail, quote, action }) {
  return (
    <Box component="li" sx={{
      py: 1.25, borderBottom: 1, borderColor: 'divider', '&:last-child': { borderBottom: 0 },
      display: 'flex', alignItems: 'center', gap: 2, flexWrap: 'wrap',
    }}>
      <Box sx={{ flexGrow: 1, minWidth: 0 }}>
        <Link component={RouterLink} to={`/tickets/${ticket.id}`} underline="hover" sx={{ fontWeight: 500 }}>
          {ticket.number}
        </Link>
        <Typography component="span"> {ticket.title}</Typography>
        {detail && <Typography variant="body2" color="text.secondary">{detail}</Typography>}
        {quote && <Typography variant="body2" sx={{ mt: 0.5, fontStyle: 'italic' }}>“{quote}”</Typography>}
      </Box>
      {action}
    </Box>
  )
}

export function TicketLines({ children, empty }) {
  const items = [children].flat().filter(Boolean)
  if (items.length === 0) return <Typography color="text.secondary">{empty}</Typography>
  return <Box component="ul" sx={{ listStyle: 'none', m: 0, p: 0 }}>{items}</Box>
}
