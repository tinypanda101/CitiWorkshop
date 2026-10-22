// The top bar every signed-in page uses: app name, menu, your name and role, Log out.
// Which menu links you see depends on your role; engineers also set their availability here.
// The sun / moon button switches between light and dark mode.
// On a phone the bar is just the name and a ☰ button, which opens all of that in a side menu.

import { useState } from 'react'
import { NavLink } from 'react-router-dom'
import {
  AppBar, Box, Button, Chip, Divider, Drawer, IconButton, List, ListItemButton, ListItemIcon, ListItemText,
  Toolbar, Tooltip, Typography,
} from '@mui/material'
import CloseIcon from '@mui/icons-material/Close'
import DarkMode from '@mui/icons-material/DarkMode'
import LightMode from '@mui/icons-material/LightMode'
import MenuIcon from '@mui/icons-material/Menu'
import { useAuth } from '../services/AuthContext'
import { useColorMode } from '../services/ColorMode'
import { useIsPhone } from '../services/useIsPhone'
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

// The phone's side menu: who you are, the links, availability (engineers), dark mode, Log out.
function PhoneMenu({ open, onClose, links }) {
  const { user, logout } = useAuth()
  const { mode, toggle } = useColorMode()
  return (
    <Drawer anchor="right" open={open} onClose={onClose} slotProps={{ paper: { sx: { width: 280 } } }}>
      <Box component="nav" aria-label="Menu" sx={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
        <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1, pl: 2, pr: 1, py: 2 }}>
          <Box sx={{ flexGrow: 1 }}>
            <Typography sx={{ fontWeight: 500 }}>{user.full_name}</Typography>
            <Chip label={ROLE_NAMES[user.role]} size="small" sx={{ mt: 0.5 }} />
          </Box>
          <IconButton aria-label="Close menu" onClick={onClose}><CloseIcon /></IconButton>
        </Box>
        <Divider />
        <List disablePadding>
          {links.map((item) => (
            <ListItemButton key={item.to} component={NavLink} to={item.to} end onClick={onClose}
              sx={{ py: 1.5, '&.active': { bgcolor: 'action.selected', color: 'primary.main', fontWeight: 500 } }}>
              <ListItemText primary={item.label} slotProps={{ primary: { sx: { fontWeight: 'inherit' } } }} />
            </ListItemButton>
          ))}
        </List>
        {user.role === 'engineer' && (
          <Box sx={{ px: 2, py: 1.5 }}><AvailabilitySelect inMenu /></Box>
        )}
        <Box sx={{ mt: 'auto' }}>
          <Divider />
          <List disablePadding>
            <ListItemButton onClick={toggle} sx={{ py: 1.5 }}>
              <ListItemIcon sx={{ minWidth: 36 }}>{mode === 'dark' ? <LightMode /> : <DarkMode />}</ListItemIcon>
              <ListItemText primary={mode === 'dark' ? 'Light mode' : 'Dark mode'} />
            </ListItemButton>
            <ListItemButton onClick={logout} sx={{ py: 1.5, color: 'error.main' }}>
              <ListItemText primary="Log out" />
            </ListItemButton>
          </List>
        </Box>
      </Box>
    </Drawer>
  )
}

export default function Layout({ children }) {
  const { user, logout } = useAuth()
  const { mode, toggle } = useColorMode()
  const isPhone = useIsPhone()
  const [menuOpen, setMenuOpen] = useState(false)
  const switchTo = mode === 'dark' ? 'light' : 'dark'
  const links = MENU.filter((item) => !item.roles || item.roles.includes(user.role))

  return (
    <Box sx={{ minHeight: '100vh', bgcolor: 'background.default' }}>
      <AppBar position="static" color="secondary" elevation={0} enableColorOnDark>
        {isPhone ? (
          <Toolbar sx={{ pr: 1 }}>
            <Typography variant="h6" component="span" sx={{ flexGrow: 1 }}>ACME Ticketing</Typography>
            <IconButton color="inherit" aria-label="Open menu" onClick={() => setMenuOpen(true)}><MenuIcon /></IconButton>
          </Toolbar>
        ) : (
          <Toolbar sx={{ gap: 2, flexWrap: 'wrap' }}>
            <Typography variant="h6" component="span">ACME Ticketing</Typography>
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
            <Tooltip title={`Switch to ${switchTo} mode`}>
              <IconButton color="inherit" onClick={toggle} aria-label={`Switch to ${switchTo} mode`}>
                {mode === 'dark' ? <LightMode /> : <DarkMode />}
              </IconButton>
            </Tooltip>
            <Button color="inherit" onClick={logout}>Log out</Button>
          </Toolbar>
        )}
      </AppBar>
      {isPhone && <PhoneMenu open={menuOpen} onClose={() => setMenuOpen(false)} links={links} />}
      <Box component="main" sx={{ maxWidth: 1200, mx: 'auto', px: { xs: 1.5, sm: 2 }, py: { xs: 2, sm: 4 } }}>
        {children}
      </Box>
    </Box>
  )
}
