// An employee asks for Critical while submitting; an admin sees it under Escalations and approves it.
describe('Requesting a higher priority', () => {
  const title = `Cypress test: water on the stairs ${Date.now()}`
  let ticketId
  let adminToken

  before(() => {
    cy.apiLogin(Cypress.expose('admin')).then((token) => { adminToken = token })
  })

  after(() => {
    if (ticketId) cy.api(adminToken, 'DELETE', `/tickets/${ticketId}`)
  })

  it('needs a reason, then reaches the admin, who approves it', () => {
    cy.visitAs(Cypress.expose('employee'))
    cy.intercept('POST', '**/api/tickets/*').as('submit')
    cy.contains('button', 'Submit a ticket').click()
    cy.field('Title').type(title)
    cy.field('Description').type('There is a puddle on the main stairs.')
    cy.pick('Category', 'Cleaning')
    cy.pick('Building', 'ACME Headquarters')
    cy.pick('Floor', 'Floor 1')
    cy.contains('button', 'Request Critical').click()

    // No reason yet: the form says why, under the box.
    cy.get('[role="dialog"]').contains('button', 'Submit').click()
    cy.contains('Please say why it needs a higher priority')

    cy.field('Why does it need this priority?').type('Someone could slip and get hurt.')
    cy.get('[role="dialog"]').contains('button', 'Submit').click()
    cy.wait('@submit')
    cy.wait('@submit').then(({ response }) => {
      expect(response.statusCode).to.equal(201)
      ticketId = response.body.id
      expect(response.body.priority).to.equal('medium')
      expect(response.body.escalation_status).to.equal('pending')
    })

    // The admin finds it under Escalations and approves it.
    cy.visitAs(Cypress.expose('admin'), '/reports/escalations')
    cy.contains('li', title).within(() => cy.contains('button', 'Approve').click())
    cy.contains('escalation approved')
    cy.then(() => cy.api(adminToken, 'GET', `/tickets/${ticketId}`)).its('body.priority').should('equal', 'critical')
  })
})
