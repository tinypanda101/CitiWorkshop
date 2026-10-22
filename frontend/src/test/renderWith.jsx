// Renders a component the way the app does: inside the theme (light/dark) and a router.
// `route` is the page address to start on, e.g. '/reports/engineers?category=Plumbing'.
// `phone: true` tells React Responsive the screen is 375 px wide, so useIsPhone() is true.
import { render } from '@testing-library/react'
import { Context as ResponsiveContext } from 'react-responsive'
import { MemoryRouter } from 'react-router-dom'
import { ColorModeProvider } from '../services/ColorMode'

export function renderWith(ui, { route = '/', phone = false } = {}) {
  const page = (
    <ColorModeProvider>
      <MemoryRouter initialEntries={[route]}>{ui}</MemoryRouter>
    </ColorModeProvider>
  )
  return render(phone ? <ResponsiveContext.Provider value={{ width: 375 }}>{page}</ResponsiveContext.Provider> : page)
}
