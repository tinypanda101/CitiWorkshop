// The dashboard (the home page): the dashboard for your role under a short heading.
// Everyone submits tickets from their Submitted Tickets list (a tab for admins and engineers).

import { Typography } from '@mui/material'
import Layout from '../components/Layout'
import AdminDashboard from '../components/dashboard/AdminDashboard'
import EmployeeDashboard from '../components/dashboard/EmployeeDashboard'
import EngineerDashboard from '../components/dashboard/EngineerDashboard'
import { useAuth } from '../services/AuthContext'

const TITLES = { admin: 'Dashboard', engineer: 'My work', employee: 'My tickets' }

export default function HomePage() {
  const { user } = useAuth()
  const Dashboard = { admin: AdminDashboard, engineer: EngineerDashboard }[user.role] || EmployeeDashboard

  return (
    <Layout>
      <Typography variant="h4" component="h1" sx={{ mb: 2 }}>{TITLES[user.role]}</Typography>
      <Dashboard user={user} />
    </Layout>
  )
}
