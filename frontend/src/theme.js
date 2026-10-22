// Colours and font shared by every screen (matches the mock-ups on the canvas), in a light and
// a dark version. `category` is the facility / technology chart colours, checked for colour-blind
// readers against each background.

import { createTheme } from '@mui/material/styles'

const PALETTES = {
  light: {
    primary: { main: '#1565c0' },
    secondary: { main: '#1f4e79' }, // the top bar
    background: { default: '#f4f6f9', paper: '#ffffff' },
    text: { primary: '#1d2733', secondary: '#5b6878' },
    category: { facility: '#2a78d6', technology: '#eb6834' },
  },
  dark: {
    primary: { main: '#64a7f0' },
    secondary: { main: '#0f2a44' },
    background: { default: '#121821', paper: '#1a2230' },
    text: { primary: '#e6ebf1', secondary: '#a3afbd' },
    category: { facility: '#3a86de', technology: '#e2612b' },
  },
}

export function makeTheme(mode) {
  return createTheme({
    palette: { mode, ...PALETTES[mode] },
    typography: {
      fontFamily: "Roboto, 'Segoe UI', Arial, sans-serif",
      button: { textTransform: 'none', fontWeight: 500 },
    },
    shape: { borderRadius: 6 },
  })
}
