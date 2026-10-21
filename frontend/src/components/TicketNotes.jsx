// The notes on a ticket: the conversation between the reporter, the engineer and admins.
// You can edit your own notes; you (or an admin) can delete them. No new notes once the
// ticket is Closed, except from admins.

import { useEffect, useState } from 'react'
import {
  Alert, Box, Button, Chip, Dialog, DialogActions, DialogTitle, Link, Paper, Stack, TextField, Typography,
} from '@mui/material'
import { api } from '../services/api'
import { ROLE_NAMES } from '../roles'
import { formatDateTime } from '../ticketLabels'

function NoteRow({ note, user, onSaved, onDelete }) {
  const [editing, setEditing] = useState(false)
  const [text, setText] = useState(note.body)
  const [error, setError] = useState('')

  async function save() {
    try {
      onSaved(await api('tickets', `/notes/${note.id}`, { method: 'PUT', body: { body: text } }))
      setEditing(false)
    } catch (err) {
      setError(err.details?.body || err.message)
    }
  }

  const mine = note.author_id === user.id
  // Saved more than a second after it was written means it was edited.
  const edited = new Date(note.updated_at) - new Date(note.created_at) > 1000

  return (
    <Box sx={{ py: 1.5, borderBottom: 1, borderColor: 'divider' }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
        <Typography variant="subtitle2">{note.author_name}</Typography>
        <Chip size="small" label={ROLE_NAMES[note.author_role]} />
        <Typography variant="caption" color="text.secondary" sx={{ flexGrow: 1 }}>
          {formatDateTime(note.created_at)}{edited && ' · edited'}
        </Typography>
        {mine && !editing && <Link component="button" variant="body2" onClick={() => setEditing(true)}>Edit</Link>}
        {(mine || user.role === 'admin') && (
          <Link component="button" variant="body2" color="error" onClick={() => onDelete(note)}>Delete</Link>
        )}
      </Box>
      {editing ? (
        <Stack spacing={1} sx={{ mt: 1 }}>
          {error && <Alert severity="error">{error}</Alert>}
          <TextField multiline minRows={2} value={text} onChange={(e) => setText(e.target.value)} autoFocus />
          <Stack direction="row" spacing={1}>
            <Button size="small" variant="contained" onClick={save}>Save</Button>
            <Button size="small" onClick={() => { setEditing(false); setText(note.body); setError('') }}>Cancel</Button>
          </Stack>
        </Stack>
      ) : (
        <Typography sx={{ mt: 0.5, whiteSpace: 'pre-wrap' }}>{note.body}</Typography>
      )}
    </Box>
  )
}

export default function TicketNotes({ ticket, user }) {
  const [notes, setNotes] = useState(null)
  const [text, setText] = useState('')
  const [error, setError] = useState('')
  const [deleting, setDeleting] = useState(null)

  useEffect(() => {
    api('tickets', `/${ticket.id}/notes`).then(setNotes).catch((err) => setError(err.message))
  }, [ticket.id])

  async function addNote(event) {
    event.preventDefault()
    setError('')
    try {
      const note = await api('tickets', `/${ticket.id}/notes`, { method: 'POST', body: { body: text } })
      setNotes([...notes, note])
      setText('')
    } catch (err) {
      setError(err.details?.body || err.message)
    }
  }

  async function confirmDelete() {
    const note = deleting
    setDeleting(null)
    try {
      await api('tickets', `/notes/${note.id}`, { method: 'DELETE' })
      setNotes(notes.filter((n) => n.id !== note.id))
    } catch (err) {
      setError(err.message)
    }
  }

  const canAdd = ticket.status !== 'closed' || user.role === 'admin'

  return (
    <Paper variant="outlined" sx={{ p: 3, mt: 2 }}>
      <Typography variant="h6" component="h2">Notes</Typography>
      {error && <Alert severity="error" onClose={() => setError('')} sx={{ mt: 1 }}>{error}</Alert>}
      {notes === null ? (
        <Typography color="text.secondary" sx={{ mt: 1 }}>Loading…</Typography>
      ) : notes.length === 0 ? (
        <Typography color="text.secondary" sx={{ mt: 1 }}>No notes yet.</Typography>
      ) : notes.map((note) => (
        <NoteRow key={note.id} note={note} user={user} onDelete={setDeleting}
          onSaved={(saved) => setNotes(notes.map((n) => (n.id === saved.id ? saved : n)))} />
      ))}

      {canAdd ? (
        <Stack component="form" spacing={1} onSubmit={addNote} sx={{ mt: 2 }}>
          <TextField label="Add a note" multiline minRows={2} value={text} onChange={(e) => setText(e.target.value)} />
          <Button type="submit" variant="contained" sx={{ alignSelf: 'flex-start' }} disabled={!text.trim()}>Add note</Button>
        </Stack>
      ) : (
        <Typography color="text.secondary" sx={{ mt: 2 }}>This ticket is closed, so no more notes can be added.</Typography>
      )}

      {deleting && (
        <Dialog open onClose={() => setDeleting(null)}>
          <DialogTitle>Delete this note?</DialogTitle>
          <DialogActions>
            <Button onClick={() => setDeleting(null)}>Cancel</Button>
            <Button color="error" variant="contained" onClick={confirmDelete}>Delete</Button>
          </DialogActions>
        </Dialog>
      )}
    </Paper>
  )
}
