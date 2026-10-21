// Colours and font shared by every screen (matches the mock-ups on the canvas).

import { createTheme } from '@mui/material/styles'

const theme = createTheme({
  palette: {
    primary: { main: '#1565c0' },
    secondary: { main: '#1f4e79' }, // the top bar
    background: { default: '#f4f6f9', paper: '#ffffff' },
    text: { primary: '#1d2733', secondary: '#5b6878' },
  },
  typography: {
    fontFamily: "Roboto, 'Segoe UI', Arial, sans-serif",
    button: { textTransform: 'none', fontWeight: 500 },
  },
  shape: { borderRadius: 6 },
})

export default theme
