// The main journey on a phone (iPhone SE, 375 x 667), using the ☰ menu to get around:
// an employee submits a ticket -> the engineer it went to starts and resolves it -> an admin
// closes it from the Tickets list. On every page it also checks nothing scrolls sideways.
describe('On a phone', () => {
  const title = `Cypress phone test: blinds stuck ${Date.now()}`
  let ticket
  let adminToken

  // The page is no wider than the screen (a sideways scrollbar means something doesn't fit).
  function fitsTheScreen() {
    cy.document().its('documentElement.scrollWidth').should('be.at.most', 375)
  }

  before(() => {
    cy.apiLogin(Cypress.expose('admin')).then((token) => { adminToken = token })
  })

  after(() => {
    if (ticket) cy.api(adminToken, 'DELETE', `/tickets/${ticket.id}`) // leave the data as it was
  })

  beforeEach(() => cy.viewport('iphone-se2'))

  it('works for the employee, the engineer and the admin', () => {
    // The employee submits from their dashboard: the popup fills the screen.
    cy.visitAs(Cypress.expose('employee'))
    cy.contains('h1', 'My tickets')
    fitsTheScreen()
    cy.intercept('POST', '**/api/tickets/*').as('submit')
    cy.contains('button', 'Submit a ticket').click()
    cy.get('.MuiDialog-paperFullScreen').should('be.visible')
    cy.field('Title').type(title)
    cy.field('Description').type('The blinds in the meeting room will not go up.', { delay: 100 })
    cy.pick('Category', 'Cleaning')
    cy.pick('Building', 'ACME Headquarters')
    cy.pick('Floor', 'Floor 1')
    cy.get('[role="dialog"]').contains('button', 'Submit').click()
    cy.wait('@submit').then(({ response }) => {
      expect(response.statusCode).to.equal(201)
      ticket = response.body
    })

    // The engineer it went to finds it on their dashboard and resolves it.
    cy.then(() => cy.api(adminToken, 'GET', '/users/engineers')).then(({ body }) => {
      const engineer = body.find((e) => e.id === ticket.assignee_id)
      cy.visitAs(engineer.email)
    })
    cy.contains('h1', 'My work')
    fitsTheScreen()
    cy.contains(title).click()
    cy.contains('h1', title)
    fitsTheScreen()
    cy.pick('Change status to', 'In Progress')
    cy.contains('button', 'Update status').click()
    cy.contains('Moved to In Progress')
    cy.pick('Change status to', 'Resolved')
    cy.field('What was done to fix it?').type('Freed the cord and re-hung the blinds.')
    cy.contains('button', 'Update status').click()
    cy.contains('Moved to Resolved')

    // The admin goes to Tickets through the menu, searches for it and closes it.
    cy.visitAs(Cypress.expose('admin'))
    cy.get('[aria-label="Open menu"]').click()
    cy.get('nav[aria-label="Menu"]').contains('a', 'Tickets').click()
    cy.contains('h1', 'Tickets')
    fitsTheScreen()
    cy.field('Search').type('Cypress phone test')
    cy.contains('a', title).click()
    cy.pick('Change status to', 'Closed')
    cy.contains('button', 'Update status').click()
    cy.contains('Moved to Closed')
  })

  it('every admin page fits the screen', () => {
    for (const page of ['/', '/tickets', '/users', '/facilities', '/reports/engineers', '/reports/locations', '/account']) {
      cy.visitAs(Cypress.expose('admin'), page)
      cy.get('main').should('be.visible')
      cy.wait(800) // let the page's data arrive
      fitsTheScreen()
    }
  })
})
