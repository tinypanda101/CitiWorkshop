// The page frame shared by Login and Register: top bar plus a centred white card.

import { AppBar, Box, Paper, Toolbar, Typography } from '@mui/material'

export default function AuthCard({ title, children }) {
  return (
    <Box sx={{ minHeight: '100vh', bgcolor: 'background.default' }}>
      <AppBar position="static" color="secondary" elevation={0}>
        <Toolbar>
          <Typography variant="h6" component="span">ACME Facility Desk</Typography>
        </Toolbar>
      </AppBar>
      <Box sx={{ display: 'flex', justifyContent: 'center', px: 2, py: 6 }}>
        <Paper variant="outlined" sx={{ width: '100%', maxWidth: 420, p: { xs: 3, sm: 4 } }}>
          <Typography variant="h5" component="h1" sx={{ mb: 3 }}>{title}</Typography>
          {children}
        </Paper>
      </Box>
    </Box>
  )
}
