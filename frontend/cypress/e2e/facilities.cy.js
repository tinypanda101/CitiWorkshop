// An admin adds a building: a bad name is refused with a message, a good one creates its floors.
describe('Adding a building', () => {
  const code = 'CYT'
  let adminToken

  // Removes the test building if a run left one behind.
  function removeTestBuilding() {
    cy.api(adminToken, 'GET', '/facilities/buildings').then(({ body }) => {
      const building = body.find((b) => b.code === code)
      if (building) cy.api(adminToken, 'DELETE', `/facilities/buildings/${building.id}`)
    })
  }

  before(() => {
    cy.apiLogin(Cypress.expose('admin')).then((token) => { adminToken = token })
    cy.then(removeTestBuilding)
  })

  after(() => removeTestBuilding())

  it('refuses !Hospital, then makes the building with its floors and seats', () => {
    cy.visitAs(Cypress.expose('admin'), '/facilities')
    cy.contains('h2', 'Buildings').parent().contains('button', '+ Add').click()
    cy.field('Code').type(code)
    cy.field('Name').type('!Hospital')
    cy.field('Address').type('1 Test Street')
    cy.field('Number of floors').clear().type('2')
    cy.contains('button', 'Save').click()
    cy.contains('Only letters, numbers, spaces and hyphens (-)')

    cy.field('Name').clear().type('Cypress Test Hospital')
    cy.contains('button', 'Save').click()
    cy.contains('Cypress Test Hospital (CYT)').click()
    cy.contains('h2', 'Floors in Cypress Test Hospital')
    cy.contains('Floor 2').click()
    cy.contains('CYT-201')
  })
})
