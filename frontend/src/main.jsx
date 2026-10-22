import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { HashRouter } from 'react-router-dom'
import { ColorModeProvider } from './services/ColorMode'
import { AuthProvider } from './services/AuthContext'
import App from './App.jsx'

// HashRouter keeps page addresses after a # (e.g. /#/login), so refreshing any page
// works on CloudFront without extra server rules.
createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ColorModeProvider>
      <HashRouter>
        <AuthProvider>
          <App />
        </AuthProvider>
      </HashRouter>
    </ColorModeProvider>
  </StrictMode>,
)
