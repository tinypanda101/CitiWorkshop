// Commands every journey uses. Pages are found by what people see (labels, button text).

// Logs in through the API and returns the token (cy.apiLogin(email).then((token) => ...)).
Cypress.Commands.add('apiLogin', (email) => {
  return cy.request('POST', `${Cypress.expose('apiUrl')}/api/auth/login`, { email, password: Cypress.expose('password') })
    .its('body.token')
})

// A call to the API as whoever owns the token. AWS reads the Authorization header; the local
// proxy drops that header, so (like the app in development) the token also goes in the address.
Cypress.Commands.add('api', (token, method, path, body) => {
  const join = path.includes('?') ? '&' : '?'
  return cy.request({
    method, url: `${Cypress.expose('apiUrl')}/api${path}${join}token=${token}`, body, failOnStatusCode: false,
    headers: { Authorization: `Bearer ${token}` },
  })
})

// Opens a page already signed in as this person (skips the login form). The ?as= part makes
// it a real page load: a visit that only changes the part after # wouldn't reload the app,
// so it would still be signed in as the previous person.
Cypress.Commands.add('visitAs', (email, page = '/') => {
  cy.apiLogin(email).then((token) => {
    cy.visit(`/?as=${encodeURIComponent(email)}#${page}`, { onBeforeLoad: (win) => win.localStorage.setItem('token', token) })
  })
})

// MUI links each field to its label by id: the label's id is the field's id + "-label".
// Finds the label by its text ("Title", or "Title *" when required) and returns the field.
function fieldFor(label) {
  const text = new RegExp(`^${Cypress._.escapeRegExp(label)}\\s*\\*?$`)
  return cy.contains('[id$="-label"]', text).invoke('attr', 'id')
    .then((id) => cy.get(`[id="${id.slice(0, -'-label'.length)}"]`))
}

// The text box with this label, e.g. cy.field('Title').type('Leak').
Cypress.Commands.add('field', fieldFor)

// Picks an option in the drop-down with this label, e.g. cy.pick('Category', 'Plumbing').
Cypress.Commands.add('pick', (label, option) => {
  fieldFor(label).click()
  cy.get('[role="listbox"]').contains('[role="option"]', option).click()
})
