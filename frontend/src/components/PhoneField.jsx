// A phone number as a country code (dropdown) plus the number (digits only; spaces, hyphens
// and brackets typed are dropped). `value` and `onChange` use the saved form: "+" then the
// country code and number, e.g. "+15552011234", or "" for no phone.

import { useState } from 'react'
import { MenuItem, Stack, TextField } from '@mui/material'
import { COUNTRIES, splitPhone } from '../phone'

export default function PhoneField({ label = 'Phone', value, onChange, error, helperText }) {
  const [parts, setParts] = useState(() => splitPhone(value))

  function change(next) {
    setParts(next)
    onChange(next.number ? `+${next.code}${next.number}` : '')
  }

  return (
    <Stack direction="row" spacing={1}>
      <TextField select label="Country" value={parts.code} sx={{ width: 140, flexShrink: 0 }}
        onChange={(e) => change({ ...parts, code: e.target.value })}
        slotProps={{ select: { renderValue: (code) => `+${code}` } }}>
        {COUNTRIES.map((c) => <MenuItem key={c.code} value={c.code}>+{c.code} {c.name}</MenuItem>)}
      </TextField>
      <TextField label={label} fullWidth value={parts.number} error={error} helperText={helperText}
        slotProps={{ htmlInput: { inputMode: 'tel' } }}
        onChange={(e) => change({ ...parts, number: e.target.value.replace(/\D/g, '') })} />
    </Stack>
  )
}
