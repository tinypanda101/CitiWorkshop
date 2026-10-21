// A horizontal bar for each row, with the number beside it. Bars are scaled to the biggest
// value in the list. Hovering a row shows its exact count. Give rows a `color` to colour
// them (the categories use one colour per type, with a legend); otherwise they use the
// app's primary blue. `max` fixes the full-width value (e.g. the 5-ticket cap), and a
// row's `text` replaces the number beside it (e.g. "5 / 5 Full").

import { Box, Tooltip, Typography } from '@mui/material'

export default function BarList({ rows, empty = 'Nothing yet.', unit = 'ticket', max }) {
  if (rows.length === 0 || rows.every((r) => r.value === 0)) {
    return <Typography color="text.secondary">{empty}</Typography>
  }
  const full = max || Math.max(...rows.map((r) => r.value))

  return (
    <Box component="ul" sx={{ listStyle: 'none', m: 0, p: 0, display: 'grid', gap: 1 }}>
      {rows.map((row) => (
        <Tooltip key={row.label} placement="top-start" title={`${row.label}: ${row.value} ${row.value === 1 ? unit : `${unit}s`}`}>
          <Box component="li" sx={{
            display: 'grid', gridTemplateColumns: 'minmax(96px, 38%) 1fr auto', gap: 1.5, alignItems: 'center', py: 0.25,
          }}>
            <Typography variant="body2" noWrap title={row.label}>{row.label}</Typography>
            <Box sx={{ height: 10 }}>
              {row.value > 0 && (
                <Box sx={{
                  height: '100%', width: `${Math.min(row.value / full, 1) * 100}%`, minWidth: 4,
                  bgcolor: row.color || 'primary.main', borderRadius: '0 4px 4px 0',
                }} />
              )}
            </Box>
            <Typography variant="body2" sx={{ textAlign: 'right', minWidth: 32, fontVariantNumeric: 'tabular-nums' }}>{row.text ?? row.value}</Typography>
          </Box>
        </Tooltip>
      ))}
    </Box>
  )
}
