// The employee's own tickets as a simple list: number, title, when it was submitted and
// its stage, with a dot when there's a new note or update. Filter by stage, sort by date.
// Clicking a row opens MyTicketDialog; opening and closing it counts as "seen".

import { useState } from 'react'
import { Box, ButtonBase, MenuItem, TextField, ToggleButton, ToggleButtonGroup, Typography } from '@mui/material'
import MyTicketDialog from './MyTicketDialog'
import { StageChip } from '../TicketChips'
import { api } from '../../services/api'
import { EMPLOYEE_STAGES, employeeStage, formatDate } from '../../ticketLabels'

function NewsDot({ news }) {
  return (
    <Box component="span" title={news ? 'New note or update since you last looked' : undefined}
      sx={{ width: 9, height: 9, borderRadius: '50%', bgcolor: news ? 'primary.main' : 'transparent' }} />
  )
}

export default function MyTickets({ rows, user }) {
  const [stage, setStage] = useState('all')
  const [sort, setSort] = useState('newest')
  const [openId, setOpenId] = useState(null)
  const [seen, setSeen] = useState([]) // ids opened on this visit, so their dot goes away

  function markSeen(id) {
    api('tickets', `/${id}/seen`, { method: 'POST' }).catch(() => {}) // only affects the dot
    setSeen((ids) => [...ids, id])
  }

  const shown = rows
    .filter((t) => stage === 'all' || employeeStage(t.status) === stage)
    .sort((a, b) => (sort === 'newest' ? -1 : 1) * (new Date(a.created_at) - new Date(b.created_at)))

  return (
    <>
      <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 2, mb: 1.5 }}>
        <ToggleButtonGroup exclusive size="small" color="primary" value={stage} aria-label="Progress"
          onChange={(e, value) => value && setStage(value)}>
          <ToggleButton value="all">All</ToggleButton>
          {Object.entries(EMPLOYEE_STAGES).map(([value, s]) => <ToggleButton key={value} value={value}>{s.name}</ToggleButton>)}
        </ToggleButtonGroup>
        <TextField select size="small" label="Submitted" value={sort} onChange={(e) => setSort(e.target.value)} sx={{ minWidth: 160 }}>
          <MenuItem value="newest">Newest first</MenuItem>
          <MenuItem value="oldest">Oldest first</MenuItem>
        </TextField>
      </Box>

      {rows.length === 0 ? (
        <Typography color="text.secondary">You haven't submitted any tickets yet. Use Submit a ticket to report a problem.</Typography>
      ) : shown.length === 0 ? (
        <Typography color="text.secondary">No tickets at this stage.</Typography>
      ) : (
        <Box component="ul" sx={{ listStyle: 'none', m: 0, p: 0, borderTop: 1, borderColor: 'divider' }}>
          {shown.map((t) => (
            <Box component="li" key={t.id} sx={{ borderBottom: 1, borderColor: 'divider' }}>
              <ButtonBase onClick={() => { markSeen(t.id); setOpenId(t.id) }} sx={{
                width: '100%', textAlign: 'left', px: 1, py: 1.5, gap: 1.5, display: 'grid',
                gridTemplateColumns: { xs: '9px 1fr auto', sm: '9px 84px 1fr auto auto' }, alignItems: 'center',
                '&:hover': { bgcolor: 'action.hover' },
              }}>
                <NewsDot news={t.news && !seen.includes(t.id)} />
                <Typography sx={{ fontWeight: 500, color: 'primary.main', display: { xs: 'none', sm: 'block' } }}>{t.number}</Typography>
                <Typography noWrap>{t.title}</Typography>
                <Typography variant="body2" color="text.secondary" sx={{ display: { xs: 'none', sm: 'block' } }}>
                  Submitted {formatDate(t.created_at)}
                </Typography>
                <StageChip status={t.status} />
              </ButtonBase>
            </Box>
          ))}
        </Box>
      )}
      <Typography variant="body2" color="text.secondary" sx={{ mt: 1.5, display: 'flex', alignItems: 'center', gap: 1 }}>
        <NewsDot news /> New note or update since you last opened it
      </Typography>

      {openId && (
        <MyTicketDialog ticketId={openId} user={user}
          onClose={() => { markSeen(openId); setOpenId(null) }} />
      )}
    </>
  )
}
