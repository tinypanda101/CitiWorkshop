// One sub-specialty on the admin dashboard: its free slots (big), a meter of slots used,
// and how many engineers are on duty and tickets waiting. Slots = engineers who aren't
// Off duty × the ticket cap. The state is shown as a word as well as the colour.
// Clicking it opens the Engineers report filtered to that sub-specialty. On a phone (xs) two fit
// across, so the "used · on duty" line is left out.

import { Link as RouterLink } from 'react-router-dom'
import { Box, LinearProgress, Paper, Typography } from '@mui/material'

const STATES = {
  full: { word: 'Full', color: 'error' },
  nearly: { word: 'Nearly full', color: 'warning' },
  nobody: { word: 'No one on duty', color: 'inherit' },
  ok: { word: 'OK', color: 'success' },
}

function stateOf(w) {
  if (w.capacity === 0) return 'nobody'
  if (w.used >= w.capacity || w.waiting > 0) return 'full'
  if (w.used >= 0.8 * w.capacity) return 'nearly'
  return 'ok'
}

export default function WorkloadTile({ workload: w, to }) {
  const state = STATES[stateOf(w)]
  const free = Math.max(w.capacity - w.used, 0)
  const percentUsed = w.capacity ? Math.min(100, (100 * w.used) / w.capacity) : 100
  const edge = state.color === 'inherit' ? 'grey.500' : `${state.color}.main`

  return (
    <Paper variant="outlined" component={RouterLink} to={to} sx={{
      p: { xs: 1, sm: 1.5 }, display: 'grid', gap: 0.75, borderTopStyle: 'solid', borderTopWidth: { xs: 3, sm: 4 }, borderTopColor: edge, minWidth: 0,
      textDecoration: 'none', color: 'inherit', '&:hover': { bgcolor: 'action.hover' },
    }}>
      <Typography sx={{ fontWeight: 500, fontSize: { xs: '0.8rem', sm: '1rem' } }} noWrap title={w.category_name}>{w.category_name}</Typography>
      <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 1 }}>
        <Typography variant="h4" component="span" sx={{ fontVariantNumeric: 'tabular-nums', fontSize: { xs: '1.4rem', sm: '2.125rem' } }}>{free}</Typography>
        <Typography variant="body2" sx={{ flexGrow: 1 }}>free</Typography>
        <Typography variant="body2" color={state.color === 'inherit' ? 'text.secondary' : `${state.color}.main`}
          sx={{ fontWeight: 500 }}>
          {state.word}
        </Typography>
      </Box>
      <LinearProgress variant="determinate" value={percentUsed} color={state.color}
        aria-label={`${w.used} of ${w.capacity} slots used`}
        sx={{ height: 6, borderRadius: 3, ...(state.color === 'inherit' && { color: 'grey.500' }) }} />
      <Typography variant="body2" color="text.secondary" sx={{ display: { xs: 'none', sm: 'block' } }}>
        {w.used} / {w.capacity} used · {w.on_duty} on duty
      </Typography>
      {w.waiting > 0 && (
        <Typography variant="body2" color="error.main" sx={{ mt: -0.5 }}>
          {w.waiting} {w.waiting === 1 ? 'ticket' : 'tickets'} waiting
        </Typography>
      )}
    </Paper>
  )
}
