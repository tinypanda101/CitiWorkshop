// A password box with an eye button at the end that shows or hides what was typed.
// Takes the same props as a TextField (label, value, onChange, helperText...).

import { useState } from 'react'
import { IconButton, InputAdornment, TextField } from '@mui/material'
import Visibility from '@mui/icons-material/Visibility'
import VisibilityOff from '@mui/icons-material/VisibilityOff'

export default function PasswordField(props) {
  const [shown, setShown] = useState(false)
  return (
    <TextField {...props} type={shown ? 'text' : 'password'}
      slotProps={{
        input: {
          endAdornment: (
            <InputAdornment position="end">
              <IconButton edge="end" onClick={() => setShown(!shown)} aria-label={shown ? 'Hide password' : 'Show password'}>
                {shown ? <VisibilityOff /> : <Visibility />}
              </IconButton>
            </InputAdornment>
          ),
        },
      }} />
  )
}
