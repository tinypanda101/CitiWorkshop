// Pages for other roles can't be opened by typing their address.
describe('Access by role', () => {
  it('sends an employee who opens an admin page back to their dashboard', () => {
    for (const page of ['/users', '/facilities', '/tickets', '/reports/overdue']) {
      cy.visitAs(Cypress.expose('employee'), page)
      cy.contains('h1', 'My tickets')
      cy.location('hash').should('equal', '#/')
    }
  })

  it('sends someone signed out to the login page', () => {
    cy.visit('/#/tickets')
    cy.location('hash').should('equal', '#/login')
  })
})
