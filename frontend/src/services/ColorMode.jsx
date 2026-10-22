// Light or dark mode. It starts from the computer's own setting; the button in the top bar
// switches it, and the choice is remembered in this browser (localStorage).

import { createContext, useContext, useMemo, useState } from 'react'
import { CssBaseline, ThemeProvider, useMediaQuery } from '@mui/material'
import { makeTheme } from '../theme'

const KEY = 'colorMode'
const ColorModeContext = createContext(null)

function savedMode() {
  try {
    return localStorage.getItem(KEY)
  } catch {
    return null // storage blocked: just follow the computer's setting
  }
}

export function ColorModeProvider({ children }) {
  const prefersDark = useMediaQuery('(prefers-color-scheme: dark)')
  const [chosen, setChosen] = useState(savedMode) // 'light', 'dark' or null (not chosen yet)
  const mode = chosen || (prefersDark ? 'dark' : 'light')
  const theme = useMemo(() => makeTheme(mode), [mode])

  function toggle() {
    const next = mode === 'dark' ? 'light' : 'dark'
    setChosen(next)
    try { localStorage.setItem(KEY, next) } catch { /* not remembered, still switched */ }
  }

  return (
    <ColorModeContext.Provider value={{ mode, toggle }}>
      <ThemeProvider theme={theme}>
        <CssBaseline />
        {children}
      </ThemeProvider>
    </ColorModeContext.Provider>
  )
}

// eslint-disable-next-line react-refresh/only-export-components
export function useColorMode() {
  return useContext(ColorModeContext)
}
