// The top bar every signed-in page uses: app name, menu, your name and role, Log out.
// Which menu links you see depends on your role; engineers also set their availability here.

import { NavLink } from 'react-router-dom'
import { AppBar, Box, Button, Chip, Toolbar, Typography } from '@mui/material'
import { useAuth } from '../services/AuthContext'
import { ROLE_NAMES } from '../roles'
import AvailabilitySelect from './AvailabilitySelect'

// `roles` lists who sees the link; leave it out for everyone.
const MENU = [
  { to: '/', label: 'Dashboard' },
  { to: '/tickets', label: 'Tickets', roles: ['admin'] }, // everyone else works from their dashboard
  { to: '/facilities', label: 'Facilities', roles: ['admin'] },
  { to: '/users', label: 'Users', roles: ['admin'] },
  { to: '/account', label: 'My account' },
]

export default function Layout({ children }) {
  const { user, logout } = useAuth()
  const links = MENU.filter((item) => !item.roles || item.roles.includes(user.role))

  return (
    <Box sx={{ minHeight: '100vh', bgcolor: 'background.default' }}>
      <AppBar position="static" color="secondary" elevation={0}>
        <Toolbar sx={{ gap: 2, flexWrap: 'wrap' }}>
          <Typography variant="h6" component="span">ACME Facility Desk</Typography>
          <Box component="nav" sx={{ display: 'flex', gap: 0.5, flexGrow: 1 }}>
            {links.map((item) => (
              <Button key={item.to} component={NavLink} to={item.to} end color="inherit"
                sx={{ '&.active': { bgcolor: 'rgba(255,255,255,0.16)' } }}>
                {item.label}
              </Button>
            ))}
          </Box>
          {user.role === 'engineer' && <AvailabilitySelect />}
          <Typography variant="body2">{user.full_name}</Typography>
          <Chip label={ROLE_NAMES[user.role]} size="small" sx={{ color: 'inherit', bgcolor: 'rgba(255,255,255,0.18)' }} />
          <Button color="inherit" onClick={logout}>Log out</Button>
        </Toolbar>
      </AppBar>
      <Box component="main" sx={{ maxWidth: 1200, mx: 'auto', px: 2, py: 4 }}>
        {children}
      </Box>
    </Box>
  )
}
