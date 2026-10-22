// The main journey, across all three roles:
// an employee submits a ticket -> it's auto-assigned -> the engineer works on it, adds a note
// and resolves it -> an admin closes it -> the employee sees it finished, with the note.
describe('A ticket from start to finish', () => {
  const title = `Cypress test: office too warm ${Date.now()}`
  let ticket // the API's reply when it was submitted
  let adminToken

  before(() => {
    cy.apiLogin(Cypress.expose('admin')).then((token) => { adminToken = token })
  })

  after(() => {
    if (ticket) cy.api(adminToken, 'DELETE', `/tickets/${ticket.id}`) // leave the data as it was
  })

  it('works for the employee, the engineer and the admin', () => {
    // 1. The employee logs in with the form and submits a ticket from their dashboard.
    cy.visit('/#/login')
    cy.field('Email').type(Cypress.expose('employee'))
    cy.field('Password').type(Cypress.expose('password'))
    cy.contains('button', 'Log in').click()
    cy.contains('h1', 'My tickets')

    cy.intercept('POST', '**/api/tickets/*').as('submit')
    cy.contains('button', 'Submit a ticket').click()
    cy.field('Title').type(title)
    // Typed at a person's pace: at Cypress's usual 10 ms a key, MUI's auto-sizing text box can loop
    // when the text wraps to a second line (see TESTING.md, known gaps).
    cy.field('Description').type('The heating is stuck on and it is very warm by the windows.', { delay: 100 })
    cy.pick('Category', 'HVAC / Temperature')
    cy.pick('Building', 'ACME Headquarters')
    cy.pick('Floor', 'Floor 1')
    cy.get('[role="dialog"]').contains('button', 'Submit').click()

    cy.wait('@submit').then(({ response }) => {
      expect(response.statusCode).to.equal(201)
      ticket = response.body
      // 2. Auto-assign gave it to an HVAC engineer straight away.
      expect(ticket.status).to.equal('assigned')
      expect(ticket.assignee_name).to.be.a('string')
    })
    cy.contains(`submitted`)

    // 3. The engineer it went to starts it, adds a note and resolves it.
    cy.then(() => cy.api(adminToken, 'GET', '/users/engineers')).then(({ body }) => {
      const engineer = body.find((e) => e.id === ticket.assignee_id)
      expect(engineer.category_name).to.equal('HVAC / Temperature')
      cy.visitAs(engineer.email, `/tickets/${ticket.id}`)
    })
    cy.contains('h1', title)
    cy.pick('Change status to', 'In Progress')
    cy.contains('button', 'Update status').click()
    cy.contains('Moved to In Progress')

    cy.field('Add a note').type('On my way to look at the thermostat.')
    cy.contains('button', 'Add note').click()
    cy.contains('On my way to look at the thermostat.')

    cy.pick('Change status to', 'Resolved')
    cy.field('What was done to fix it?').type('Reset the thermostat to 21°C.')
    cy.contains('button', 'Update status').click()
    cy.contains('Moved to Resolved')

    // 4. The admin closes it.
    cy.then(() => cy.visitAs(Cypress.expose('admin'), `/tickets/${ticket.id}`)) // ticket is known by now
    cy.pick('Change status to', 'Closed')
    cy.contains('button', 'Update status').click()
    cy.contains('Moved to Closed')

    // 5. The employee sees it finished, with a dot for the news, and opens it.
    cy.visitAs(Cypress.expose('employee'))
    cy.contains(title).closest('button').within(() => {
      cy.get('[title="New note or update since you last looked"]').should('exist')
    })
    cy.contains(title).click()
    cy.get('[role="dialog"]').within(() => {
      cy.contains('Resolved')
      cy.contains('Fix: Reset the thermostat to 21°C.')
      cy.contains('On my way to look at the thermostat.')
    })
  })
})
