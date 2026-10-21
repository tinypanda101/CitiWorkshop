// The dashboard's date range: Last 7 / 30 / 90 days and All time buttons, plus From and To
// boxes. A button fills in the dates; typing your own dates makes a custom range.
// `value` is { preset, from, to } with dates as "2026-10-21" ('' = no limit).

import { Box, TextField, ToggleButton, ToggleButtonGroup } from '@mui/material'
import { presetRange } from './dashboardFormat'

const PRESETS = { 7: 'Last 7 days', 30: 'Last 30 days', 90: 'Last 90 days', all: 'All time' }

export default function DateRangePicker({ value, onChange }) {
  function typeDate(field, date) {
    onChange({ ...value, preset: 'custom', [field]: date })
  }

  return (
    <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap', alignItems: 'center' }}>
      <ToggleButtonGroup exclusive size="small" color="primary" value={value.preset === 'custom' ? null : value.preset}
        onChange={(e, preset) => preset && onChange(presetRange(preset))} aria-label="Date range">
        {Object.entries(PRESETS).map(([preset, label]) => <ToggleButton key={preset} value={preset}>{label}</ToggleButton>)}
      </ToggleButtonGroup>
      <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
        <TextField size="small" type="date" label="From" value={value.from}
          onChange={(e) => typeDate('from', e.target.value)} slotProps={{ inputLabel: { shrink: true } }} />
        <TextField size="small" type="date" label="To" value={value.to}
          onChange={(e) => typeDate('to', e.target.value)} slotProps={{ inputLabel: { shrink: true } }} />
      </Box>
    </Box>
  )
}
