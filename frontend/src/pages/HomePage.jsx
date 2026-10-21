// The dashboard (the home page): the dashboard for your role under a short heading.
// Admins have Submit a ticket in the heading; employees and engineers have it by their Submitted Tickets list.

import { useState } from 'react'
import { Box, Typography } from '@mui/material'
import Layout from '../components/Layout'
import SubmitTicketButton from '../components/SubmitTicketButton'
import AdminDashboard from '../components/dashboard/AdminDashboard'
import EmployeeDashboard from '../components/dashboard/EmployeeDashboard'
import EngineerDashboard from '../components/dashboard/EngineerDashboard'
import { useAuth } from '../services/AuthContext'

const TITLES = { admin: 'Dashboard', engineer: 'My work', employee: 'My tickets' }

export default function HomePage() {
  const { user } = useAuth()
  const [reloads, setReloads] = useState(0) // goes up after submitting, so the numbers refresh

  const Dashboard = { admin: AdminDashboard, engineer: EngineerDashboard }[user.role] || EmployeeDashboard

  return (
    <Layout>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 2, flexWrap: 'wrap' }}>
        <Typography variant="h4" component="h1" sx={{ flexGrow: 1 }}>{TITLES[user.role]}</Typography>
        {user.role === 'admin' && <SubmitTicketButton onSubmitted={() => setReloads(reloads + 1)} />}
      </Box>
      <Dashboard reloads={reloads} user={user} />
    </Layout>
  )
}
