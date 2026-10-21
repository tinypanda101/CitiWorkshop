// The employee dashboard: the tickets they submitted (see SubmittedTickets).

import { useEffect, useState } from 'react'
import { Alert, Typography } from '@mui/material'
import SubmittedTickets from './SubmittedTickets'
import { api } from '../../services/api'

export default function EmployeeDashboard({ user }) {
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  const [reloads, setReloads] = useState(0) // goes up after submitting a ticket

  useEffect(() => {
    api('dashboard', '/').then(setData).catch((err) => setError(err.message))
  }, [reloads])

  if (error) return <Alert severity="error">{error}</Alert>
  if (!data) return <Typography color="text.secondary">Loading…</Typography>
  return <SubmittedTickets data={data} user={user} onSubmitted={() => setReloads(reloads + 1)} />
}
