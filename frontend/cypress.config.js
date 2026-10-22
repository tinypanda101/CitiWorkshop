// End-to-end tests (Cypress): a real browser using the running local app.
// Start the app first (LocalStack, the proxy on :3001 and `npm run dev` on :3000), then
//   npx cypress run    (headless)   or   npx cypress open   (the visual runner)
// The tests sign in as mock-data accounts (password "password1"), so run scripts/mock_data.py once first.
import { defineConfig } from 'cypress'

export default defineConfig({
  e2e: {
    baseUrl: 'http://localhost:3000',
    specPattern: 'cypress/e2e/**/*.cy.js',
    video: false,
    defaultCommandTimeout: 10000, // a Lambda that has gone cold takes a second or two to answer
  },
  expose: { // read in the tests with Cypress.expose(name); nothing secret (mock-data accounts)
    apiUrl: 'http://localhost:3001', // the local proxy in front of the Lambdas
    // Mock-data accounts the journeys use.
    employee: 'stephanie.hansen@acme.inc',
    admin: 'deborah.tucker@acme.inc',
    password: 'password1',
  },
})
