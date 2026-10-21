// The "Submit a ticket" button: opens the popup, then shows "TKT-1001 submitted" with a View link.
// Used on the dashboards. `onSubmitted` lets the page reload its numbers; `onView` replaces
// the View link (employees open the ticket in their popup instead of the full page).

import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button, Snackbar } from '@mui/material'
import TicketDialog from './TicketDialog'

export default function SubmitTicketButton({ onSubmitted, onView, ...buttonProps }) {
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const [submitted, setSubmitted] = useState(null) // the ticket just submitted

  function handleSaved(ticket) {
    setOpen(false)
    setSubmitted(ticket)
    if (onSubmitted) onSubmitted(ticket)
  }

  return (
    <>
      <Button variant="contained" onClick={() => setOpen(true)} {...buttonProps}>Submit a ticket</Button>
      {open && <TicketDialog onSaved={handleSaved} onClose={() => setOpen(false)} />}
      <Snackbar open={!!submitted} autoHideDuration={6000} onClose={() => setSubmitted(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
        message={submitted && `${submitted.number} submitted`}
        action={submitted && (
          <Button color="inherit" size="small"
            onClick={() => { if (onView) onView(submitted); else navigate(`/tickets/${submitted.id}`); setSubmitted(null) }}>
            View
          </Button>
        )} />
    </>
  )
}
