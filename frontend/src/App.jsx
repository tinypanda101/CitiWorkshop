// The list of pages: which address shows which page.

import { Navigate, Route, Routes } from 'react-router-dom'
import { Box, CircularProgress } from '@mui/material'
import { useAuth } from './services/AuthContext'
import LoginPage from './pages/LoginPage'
import RegisterPage from './pages/RegisterPage'
import HomePage from './pages/HomePage'
import FacilitiesPage from './pages/FacilitiesPage'
import TicketsPage from './pages/TicketsPage'
import TicketDetailPage from './pages/TicketDetailPage'
import UsersPage from './pages/UsersPage'
import AccountPage from './pages/AccountPage'
import AdminReportPage from './pages/AdminReportPage'

// Shows the page only when someone is logged in; otherwise sends them to /login.
// With `roles`, only those roles get in; everyone else goes back to the home page.
function RequireAuth({ roles, children }) {
  const { user, loading } = useAuth()
  if (loading) {
    return (
      <Box sx={{ display: 'grid', placeItems: 'center', minHeight: '100vh' }}>
        <CircularProgress />
      </Box>
    )
  }
  if (!user) return <Navigate to="/login" replace />
  if (roles && !roles.includes(user.role)) return <Navigate to="/" replace />
  return children
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/register" element={<RegisterPage />} />
      <Route path="/" element={<RequireAuth><HomePage /></RequireAuth>} />
      <Route path="/tickets" element={<RequireAuth roles={['admin']}><TicketsPage /></RequireAuth>} />
      <Route path="/tickets/:id" element={<RequireAuth roles={['engineer', 'admin']}><TicketDetailPage /></RequireAuth>} />
      <Route path="/facilities" element={<RequireAuth roles={['admin']}><FacilitiesPage /></RequireAuth>} />
      <Route path="/users" element={<RequireAuth roles={['admin']}><UsersPage /></RequireAuth>} />
      <Route path="/reports/:kind" element={<RequireAuth roles={['admin']}><AdminReportPage /></RequireAuth>} />
      <Route path="/account" element={<RequireAuth><AccountPage /></RequireAuth>} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
