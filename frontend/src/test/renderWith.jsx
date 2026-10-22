// Renders a component the way the app does: inside the theme (light/dark) and a router.
// `route` is the page address to start on, e.g. '/reports/engineers?category=Plumbing'.
import { render } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { ColorModeProvider } from '../services/ColorMode'

export function renderWith(ui, { route = '/' } = {}) {
  return render(
    <ColorModeProvider>
      <MemoryRouter initialEntries={[route]}>{ui}</MemoryRouter>
    </ColorModeProvider>,
  )
}
