// "Availability: [Available ▾]" in the top bar, for engineers. Admins see it when they
// assign tickets.

import { useEffect, useState } from 'react'
import { Box, MenuItem, Select, Typography } from '@mui/material'
import { api } from '../services/api'
import { AVAILABILITY_NAMES } from '../roles'

// The dot beside each choice (MUI palette names).
const DOTS = { available: 'success.light', busy: 'warning.light', off_duty: 'grey.400' }

// `inMenu`: shown in the phone's side menu (light background) rather than the dark top bar.
export default function AvailabilitySelect({ inMenu = false }) {
  const [availability, setAvailability] = useState('')

  useEffect(() => {
    api('users', '/engineers/me').then((me) => setAvailability(me.availability)).catch(() => {})
  }, [])

  async function change(value) {
    const me = await api('users', '/engineers/me/availability', { method: 'PUT', body: { availability: value } })
    setAvailability(me.availability)
  }

  if (!availability) return null

  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
      <Typography variant="body2" component="label" htmlFor="availability">Availability:</Typography>
      <Select id="availability" size="small" value={availability} onChange={(e) => change(e.target.value)}
        sx={inMenu ? { fontSize: 14, flexGrow: 1, '.MuiSelect-select': { display: 'flex', alignItems: 'center', gap: 1 } } : {
          color: 'inherit', fontSize: 14, bgcolor: 'rgba(255,255,255,0.12)',
          '.MuiOutlinedInput-notchedOutline': { borderColor: 'rgba(255,255,255,0.35)' },
          '.MuiSelect-icon': { color: 'inherit' }, '.MuiSelect-select': { py: 0.5, display: 'flex', alignItems: 'center', gap: 1 },
        }}>
        {Object.entries(AVAILABILITY_NAMES).map(([value, name]) => (
          <MenuItem key={value} value={value} sx={{ gap: 1 }}>
            <Box component="span" sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: DOTS[value] }} />{name}
          </MenuItem>
        ))}
      </Select>
    </Box>
  )
}
