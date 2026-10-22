// The dashboard's date range: Last 7 / 30 / 90 days and All time buttons, plus From and To
// boxes. A button fills in the dates; typing your own dates makes a custom range.
// `value` is { preset, from, to } with dates as "2026-10-21" ('' = no limit).
// On a phone the buttons become one drop-down; From and To show when "Custom dates" is picked.

import { Box, MenuItem, TextField, ToggleButton, ToggleButtonGroup } from '@mui/material'
import { presetRange } from './dashboardFormat'
import { useIsPhone } from '../../services/useIsPhone'

const PRESETS = { 7: 'Last 7 days', 30: 'Last 30 days', 90: 'Last 90 days', all: 'All time' }

export default function DateRangePicker({ value, onChange }) {
  const isPhone = useIsPhone()

  function typeDate(field, date) {
    onChange({ ...value, preset: 'custom', [field]: date })
  }

  const dateBoxes = (
    <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
      <TextField size="small" type="date" label="From" value={value.from} fullWidth={isPhone}
        onChange={(e) => typeDate('from', e.target.value)} slotProps={{ inputLabel: { shrink: true } }} />
      <TextField size="small" type="date" label="To" value={value.to} fullWidth={isPhone}
        onChange={(e) => typeDate('to', e.target.value)} slotProps={{ inputLabel: { shrink: true } }} />
    </Box>
  )

  if (isPhone) {
    return (
      <Box sx={{ display: 'grid', gap: 1 }}>
        <TextField select size="small" label="Date range" value={value.preset}
          onChange={(e) => onChange(e.target.value === 'custom' ? { ...value, preset: 'custom' } : presetRange(e.target.value))}>
          {Object.entries(PRESETS).map(([preset, label]) => <MenuItem key={preset} value={preset}>{label}</MenuItem>)}
          <MenuItem value="custom">Custom dates</MenuItem>
        </TextField>
        {value.preset === 'custom' && dateBoxes}
      </Box>
    )
  }

  return (
    <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap', alignItems: 'center' }}>
      <ToggleButtonGroup exclusive size="small" color="primary" value={value.preset === 'custom' ? null : value.preset}
        onChange={(e, preset) => preset && onChange(presetRange(preset))} aria-label="Date range">
        {Object.entries(PRESETS).map(([preset, label]) => <ToggleButton key={preset} value={preset}>{label}</ToggleButton>)}
      </ToggleButtonGroup>
      {dateBoxes}
    </Box>
  )
}
