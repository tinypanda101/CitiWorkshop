// The api() helper: what it sends, and how it turns error replies into ApiError.
import { describe, expect, it, vi } from 'vitest'
import { api, ApiError, getToken, setToken } from './api'

// Makes the next fetch() reply with this status and JSON body (or no body).
function reply(status, body) {
  const fetch = vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: () => (body === undefined ? Promise.reject(new Error('no body')) : Promise.resolve(body)),
  })
  vi.stubGlobal('fetch', fetch)
  return fetch
}

describe('api()', () => {
  it('sends JSON with the saved token, and returns the reply', async () => {
    setToken('abc123')
    const fetch = reply(200, { id: 1 })
    expect(await api('tickets', '/1', { method: 'PUT', body: { title: 'New' } })).toEqual({ id: 1 })
    const [url, options] = fetch.mock.calls[0]
    expect(url).toContain('/api/tickets/1')
    expect(options.method).toBe('PUT')
    expect(options.headers.Authorization).toBe('Bearer abc123')
    expect(JSON.parse(options.body)).toEqual({ title: 'New' })
  })

  it('works with an empty reply (204 after a delete)', async () => {
    reply(204)
    expect(await api('tickets', '/1', { method: 'DELETE' })).toBeNull()
  })

  it('turns an error reply into an ApiError with the field messages', async () => {
    reply(400, { error: { code: 'validation_error', message: 'Please check the highlighted fields', details: { name: 'Required' } } })
    const error = await api('facilities', '/buildings', { method: 'POST', body: {} }).catch((e) => e)
    expect(error).toBeInstanceOf(ApiError)
    expect([error.status, error.code, error.message]).toEqual([400, 'validation_error', 'Please check the highlighted fields'])
    expect(error.details).toEqual({ name: 'Required' })
  })

  it('gives a plain message when the reply has no error body', async () => {
    reply(500)
    const error = await api('tickets', '/').catch((e) => e)
    expect([error.status, error.message, error.details]).toEqual([500, 'Something went wrong', {}])
  })

  it('says it could not reach the server when the network fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')))
    const error = await api('tickets', '/').catch((e) => e)
    expect([error.code, error.message]).toEqual(['network_error', 'Could not reach the server. Please try again.'])
  })

  it('on a 401 forgets the token and goes to the login page', async () => {
    setToken('expired')
    window.location.hash = '#/tickets'
    reply(401, { error: { code: 'token_expired', message: 'Your session has expired, please log in again' } })
    await expect(api('tickets', '/')).rejects.toThrow('Your session has expired')
    expect(getToken()).toBeNull()
    expect(window.location.hash).toBe('#/login')
  })

  it('a wrong password on the login page itself does not redirect', async () => {
    window.location.hash = '#/login'
    setToken(null)
    reply(401, { error: { code: 'invalid_credentials', message: 'Wrong email or password' } })
    await expect(api('auth', '/login', { method: 'POST', body: {} })).rejects.toThrow('Wrong email or password')
    expect(window.location.hash).toBe('#/login')
  })
})
