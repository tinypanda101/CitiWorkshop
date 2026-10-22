// Admin page for accounts, with two tabs: every account (add / edit, 25 a page) and the engineers
// (their sub-specialty, availability and how many unfinished tickets each one has, with filters).

import { useEffect, useState } from 'react'
import {
  Alert, Box, Button, Chip, MenuItem, Paper, Snackbar, Tab, Table, TableBody, TableCell,
  TableContainer, TableHead, TablePagination, TableRow, Tabs, TextField, Typography,
} from '@mui/material'
import Layout from '../components/Layout'
import EngineerTable from '../components/EngineerTable'
import PasswordResetDialog from '../components/PasswordResetDialog'
import UserDialog from '../components/UserDialog'
import { api } from '../services/api'
import { ROLE_NAMES } from '../roles'

function AccountsTab({ onEdit, reloads }) {
  const [search, setSearch] = useState('')
  const [role, setRole] = useState('')
  const [page, setPage] = useState(0) // TablePagination counts pages from 0; the API from 1
  const [perPage, setPerPage] = useState(25)
  const [result, setResult] = useState(null) // { accounts, total }
  const [error, setError] = useState('')

  const params = new URLSearchParams({ page: page + 1, per_page: perPage })
  if (search.trim()) params.set('q', search.trim())
  if (role) params.set('role', role)
  const query = params.toString()

  useEffect(() => {
    // Wait until typing stops for 300 ms before asking the API.
    const timer = setTimeout(() => {
      api('users', `/?${query}`).then(setResult).catch((err) => setError(err.message))
    }, 300)
    return () => clearTimeout(timer)
  }, [query, reloads])

  const accounts = result?.accounts ?? null

  return (
    <>
      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
      <Box sx={{ display: 'flex', gap: 2, mb: 2, flexWrap: 'wrap' }}>
        <TextField size="small" label="Search" placeholder="Name or email" value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(0) }} sx={{ flexGrow: 1, minWidth: 200 }} />
        <TextField select size="small" label="Role" value={role} onChange={(e) => { setRole(e.target.value); setPage(0) }}
          sx={{ minWidth: 160 }}>
          <MenuItem value="">Any</MenuItem>
          {Object.entries(ROLE_NAMES).map(([value, name]) => <MenuItem key={value} value={value}>{name}</MenuItem>)}
        </TextField>
      </Box>
      <TableContainer component={Paper} variant="outlined">
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>Name</TableCell>
              <TableCell>Email</TableCell>
              <TableCell>Role</TableCell>
              <TableCell>Status</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {accounts === null ? (
              <TableRow><TableCell colSpan={4}>Loading…</TableCell></TableRow>
            ) : accounts.length === 0 ? (
              <TableRow><TableCell colSpan={4}>No accounts match.</TableCell></TableRow>
            ) : accounts.map((a) => (
              <TableRow key={a.id} hover onClick={() => onEdit(a)} sx={{ cursor: 'pointer' }}>
                <TableCell>{a.full_name}</TableCell>
                <TableCell>{a.email}</TableCell>
                <TableCell><Chip size="small" label={ROLE_NAMES[a.role]} /></TableCell>
                <TableCell>{a.is_active ? 'Active' : 'Deactivated'}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        <TablePagination component="div" count={result?.total ?? 0} page={page} rowsPerPage={perPage}
          rowsPerPageOptions={[25, 50, 100]} onPageChange={(e, next) => setPage(next)}
          onRowsPerPageChange={(e) => { setPerPage(Number(e.target.value)); setPage(0) }} />
      </TableContainer>
    </>
  )
}

function EngineersTab({ reloads }) {
  const [engineers, setEngineers] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    api('users', '/engineers').then(setEngineers).catch((err) => setError(err.message))
  }, [reloads])

  return (
    <>
      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
      <Typography color="text.secondary" sx={{ mb: 2 }}>
        To make someone an engineer, edit their account on the Accounts tab and set the role to Engineer.
        Engineers set their own availability on My account.
      </Typography>
      {engineers === null ? <Typography color="text.secondary">Loading…</Typography> : <EngineerTable engineers={engineers} phone />}
    </>
  )
}

export default function UsersPage() {
  const [tab, setTab] = useState('accounts')
  const [editing, setEditing] = useState(null) // { account } — account is null when adding
  const [resetting, setResetting] = useState(false) // the Reset a password popup is open
  const [reloads, setReloads] = useState(0) // goes up after a save, so the tabs reload
  const [message, setMessage] = useState('')

  function handleSaved() {
    setMessage(editing.account ? `${editing.account.full_name} saved` : 'Account added')
    setEditing(null)
    setReloads(reloads + 1)
  }

  return (
    <Layout>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 1, flexWrap: 'wrap' }}>
        <Typography variant="h4" component="h1" sx={{ flexGrow: 1 }}>Users</Typography>
        <Button variant="outlined" onClick={() => setResetting(true)}>Reset a password</Button>
        <Button variant="contained" onClick={() => setEditing({ account: null })}>+ Add account</Button>
      </Box>
      <Tabs value={tab} onChange={(e, value) => setTab(value)} sx={{ mb: 2 }}>
        <Tab value="accounts" label="Accounts" />
        <Tab value="engineers" label="Engineers" />
      </Tabs>

      {tab === 'accounts'
        ? <AccountsTab reloads={reloads} onEdit={(account) => setEditing({ account })} />
        : <EngineersTab reloads={reloads} />}

      {resetting && (
        <PasswordResetDialog onClose={() => setResetting(false)}
          onReset={(account) => { setResetting(false); setMessage(`Password reset for ${account.full_name}`) }} />
      )}
      {editing && <UserDialog account={editing.account} onSaved={handleSaved} onClose={() => setEditing(null)} />}

      <Snackbar open={!!message} message={message} autoHideDuration={4000} onClose={() => setMessage('')}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }} />
    </Layout>
  )
}
