// Placeholder home page until the dashboards are built (step 9), with the Submit a ticket button.

import { Paper, Typography } from '@mui/material'
import Layout from '../components/Layout'
import SubmitTicketButton from '../components/SubmitTicketButton'
import { ROLE_NAMES } from '../roles'
import { useAuth } from '../services/AuthContext'

export default function HomePage() {
  const { user } = useAuth()

  return (
    <Layout>
      <Paper variant="outlined" sx={{ p: 3, maxWidth: 720 }}>
        <Typography variant="h5" component="h1" gutterBottom>Welcome, {user.full_name}</Typography>
        <Typography color="text.secondary">
          Signed in as {user.email} · {ROLE_NAMES[user.role]}
        </Typography>
        <SubmitTicketButton size="large" sx={{ mt: 3 }} />
      </Paper>
    </Layout>
  )
}
