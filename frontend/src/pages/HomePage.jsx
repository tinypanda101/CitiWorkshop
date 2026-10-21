// Placeholder home page until the dashboards are built (step 9).

import { AppBar, Box, Button, Chip, Paper, Toolbar, Typography } from '@mui/material'
import { useAuth } from '../services/AuthContext'

const ROLE_NAMES = { employee: 'Employee', engineer: 'Engineer', admin: 'Facility Admin' }

export default function HomePage() {
  const { user, logout } = useAuth()

  return (
    <Box sx={{ minHeight: '100vh', bgcolor: 'background.default' }}>
      <AppBar position="static" color="secondary" elevation={0}>
        <Toolbar sx={{ gap: 1.5 }}>
          <Typography variant="h6" component="span" sx={{ flexGrow: 1 }}>ACME Facility Desk</Typography>
          <Typography variant="body2">{user.full_name}</Typography>
          <Chip label={ROLE_NAMES[user.role]} size="small" sx={{ color: 'inherit', bgcolor: 'rgba(255,255,255,0.18)' }} />
        </Toolbar>
      </AppBar>
      <Box sx={{ maxWidth: 720, mx: 'auto', px: 2, py: 4 }}>
        <Paper variant="outlined" sx={{ p: 3 }}>
          <Typography variant="h5" component="h1" gutterBottom>Welcome, {user.full_name}</Typography>
          <Typography color="text.secondary" gutterBottom>
            Signed in as {user.email} · {ROLE_NAMES[user.role]}
          </Typography>
          <Button variant="outlined" onClick={logout} sx={{ mt: 2 }}>Log out</Button>
        </Paper>
      </Box>
    </Box>
  )
}
