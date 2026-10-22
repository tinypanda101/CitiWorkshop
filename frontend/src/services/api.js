// One helper for every call to the backend, e.g.
//   const { token, user } = await api('auth', '/login', { method: 'POST', body: { email, password } })
//
// VITE_API_URL comes from frontend/.env.local (written by bin/generate-env.sh): the local
// proxy (http://localhost:3001) during development, the CloudFront site in AWS. Every
// service is at <VITE_API_URL>/api/<service>.
//
// The local proxy drops the Authorization header, so in development (npm run dev) the
// token is also sent as ?token=. The backend only accepts that when running locally.

const TOKEN_KEY = 'token'
const API_URL = import.meta.env.VITE_API_URL || ''

function buildUrl(service, path, token) {
  const url = `${API_URL}/api/${service}${path}`
  if (!token || !import.meta.env.DEV) return url
  return url + (url.includes('?') ? '&' : '?') + `token=${encodeURIComponent(token)}`
}

export function getToken() {
  return localStorage.getItem(TOKEN_KEY)
}

export function setToken(token) {
  if (token) localStorage.setItem(TOKEN_KEY, token)
  else localStorage.removeItem(TOKEN_KEY)
}

// Thrown for any error reply. `details` maps field names to messages, e.g. { email: 'Must be…' }.
export class ApiError extends Error {
  constructor(status, code, message, details) {
    super(message)
    this.status = status
    this.code = code
    this.details = details || {}
  }
}

export async function api(service, path, { method = 'GET', body } = {}) {
  const headers = { 'Content-Type': 'application/json' }
  const token = getToken()
  if (token) headers.Authorization = `Bearer ${token}`

  let response
  try {
    response = await fetch(buildUrl(service, path, token), {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    })
  } catch {
    throw new ApiError(0, 'network_error', 'Could not reach the server. Please try again.')
  }

  const data = await response.json().catch(() => null)

  if (!response.ok) {
    const error = data?.error || {}
    // Not signed in or session expired: forget the token and go to the login page.
    // (Login itself also answers 401 for a wrong password, so leave that to the page.)
    if (response.status === 401 && path !== '/login') {
      setToken(null)
      window.location.hash = '#/login'
    }
    throw new ApiError(response.status, error.code, error.message || 'Something went wrong', error.details)
  }
  return data
}

// Each service is its own Lambda, and one that hasn't been used for a while takes a second or
// two to start ("cold start"). On opening, the app pings every service in the background so
// they've started by the time a page needs them. The replies are ignored.
const SERVICES = ['auth', 'users', 'tickets', 'facilities', 'dashboard']

export function warmUp() {
  for (const service of SERVICES) {
    fetch(`${API_URL}/api/${service}/ping`).catch(() => {})
  }
}
