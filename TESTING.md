# Testing

There are three suites:

| Suite | Tool | What it checks | Needs running |
|---|---|---|---|
| Backend | pytest | The API rules: validation, who may do what, the workflow, auto-assign, escalations, the dashboard numbers | Only the local PostgreSQL |
| Frontend | Vitest + React Testing Library | Each component and page: what each role sees, the forms' checks and messages, what is sent to the API | Nothing (the API is faked) |
| End-to-end | Cypress | Whole journeys in a real browser, through the real API and database | The whole local app |

The tests check the rules and the refusals, not only that good input works. For example, they
check that a building called `!Hospital` is refused with a message under the Name box, that an
engineer can't skip from Assigned to Resolved, and that the 5-ticket cap is never passed.

## Latest results

| Suite | Result | Coverage |
|---|---|---|
| Backend | 304 passed | 98% of our backend code (statements) |
| Frontend | 169 passed | 83% of statements, 85% of lines |
| End-to-end | 7 passed (5 journeys) | All 3 roles, on a desktop and on a phone (375 px) |

To make sure the tests can fail, three rules were broken on purpose, one at a time: names
allowing `!`, engineers skipping a step, and no ticket cap. Each one made its tests fail. The
same was done for two frontend rules: the 100-floor limit, and sending an escalation request.

## Running them

### Backend (from the `backend` folder)

```sh
../.venv/bin/pip install -r requirements-dev.txt   # once: pytest, pytest-cov, httpx2
../.venv/bin/pytest                                # all tests (about 25 seconds)
../.venv/bin/pytest --cov                          # with the coverage report
../.venv/bin/pytest tests/test_workflow.py         # one file
```

- **Only the local PostgreSQL is needed.** LocalStack isn't: each service's FastAPI app is called
  directly with FastAPI's TestClient. These are real HTTP requests and replies, with our error
  handlers and status codes, just without Lambda in front.
- **The tests use their own database, `acme_test`.** It's created the first time. The app's data
  (the `postgres` database with the mock data) is never touched.
- **Every test starts with empty tables**, plus the 8 categories, and adds only the few rows it
  needs.

| File | Checks |
|---|---|
| `test_validation.py` | Bad building names, codes, addresses, floor and seat counts; manager name / email / phone; duplicates; ACME emails, names and passwords on accounts; a ticket's floor, seat and category must be real |
| `test_validation_rules.py` | The shared rules in `_shared/validation.py` on their own |
| `test_permissions.py` | 401 without a valid login (missing, forged, expired, or a deactivated account); 403 for every admin-only action by an employee or engineer; people only see their own tickets; the role is read from the database, not the token |
| `test_workflow.py` | Engineers go one step at a time; Blocked needs a reason and Resolved a summary; admins can move to any status; notes rules |
| `test_assignment.py` | Auto-assign: same sub-specialty, Available before Busy, never Off duty or deactivated, the cap, least busy first, longest waiting on a tie, the waiting queue in priority order; the Auto-assign button; deactivating keeps the sub-specialty |
| `test_escalation.py` | Requesting while submitting or later, a reason is required, only higher priorities, one at a time, approve / reject |
| `test_facilities.py`, `test_facilities_editing.py` | Floors and seats made with a building, seat numbering, "add several", refusing to delete things tickets use, 201 / 204 / not found |
| `test_auth.py` | Register, log in, change password, the admin password reset, what the token holds, the accounts list |
| `test_ticket_list.py` | Search (text and TKT number), every filter, sorting, paging |
| `test_dashboard.py` | With known tickets, every admin number is exact (statuses, overdue, waiting, response times, workload, locations); engineers and employees see only theirs; the "new" dot |

### Frontend (from the `frontend` folder)

```sh
npm test                 # watches and re-runs as files change
npx vitest run           # once
npm run test:coverage    # once, with the coverage report
```

The tests sit next to the code they test (`TicketDialog.test.jsx` next to `TicketDialog.jsx`).
They fake the API, so they need nothing running.

- **Why Vitest instead of Jest:** the guide names Jest. Vitest is the Jest-compatible runner made
  for Vite projects, with the same `describe` / `it` / `expect` and the same React Testing Library.
- **Where things are:**
  - The settings are in `vite.config.js`.
  - `src/test/setup.js` runs before each file.
  - `src/test/renderWith.jsx` draws a component inside the app's theme and router.
    `renderWith(ui, { phone: true })` tells React Responsive the screen is 375 px wide.
- **The phone layout** is tested in `src/pages/PhoneLayout.test.jsx`: the ☰ menu (with
  availability for engineers), the Tickets cards and filters panel, the Facilities drill-down and ⋮
  menu, the engineer cards, full-screen popups, and the date drop-down.

### End-to-end (from the `frontend` folder)

1. Start the app: `./bin/start-dev.sh` (LocalStack and the proxy on :3001) and `npm run dev`
   (on :3000).
2. Load the mock data once: `.venv/bin/python scripts/mock_data.py`. The journeys sign in as mock
   accounts (password `password1`).
3. Then run:

```sh
npx cypress run     # all journeys, headless (about a minute)
npx cypress open    # the visual runner: watch each step in a browser
```

| Journey | Checks |
|---|---|
| `ticket-journey.cy.js` | An employee logs in and submits a ticket → it's auto-assigned to an HVAC engineer → the engineer starts it, adds a note and resolves it → an admin closes it → the employee sees the "new" dot, the fix and the note |
| `escalation.cy.js` | An employee picks Request Critical: without a reason it's refused; with one it's submitted at Medium → the admin approves it under Escalations → it's Critical |
| `facilities.cy.js` | An admin adds a building called `!Hospital` (refused, with the message), fixes the name, and sees its floors and seat codes |
| `access.cy.js` | An employee typing an admin page's address is sent to their dashboard; signed-out people go to Log in |
| `phone.cy.js` | At iPhone SE size (375 × 667): an employee submits in the full-screen popup → the engineer resolves it → an admin finds it through the ☰ menu and Tickets search and closes it; every page is checked to fit the screen (no sideways scrolling) |

Each journey deletes what it created, so the data is the same afterwards.

## Bugs the tests found (fixed)

- **Tickets page: page 2 jumped back to page 1.** The search box's "wait until typing stops" timer
  also ran when the page opened. If you moved to another page in the first third of a second, it
  reset you to page 1. Now only a changed search goes back to page 1.

## Known gaps

- **Dates are compared in the database's time zone.**
  - The dashboard and Tickets page's From / To dates count from midnight in the database server's
    time zone, not the viewer's.
  - Locally they match, but AWS uses UTC. So someone in New York choosing "today" after 8 pm local
    time would see the UTC day.
  - The fix would be for the browser to send its time zone with the dates.
- **MUI's auto-sizing text boxes, at machine speed.**
  - When Cypress types at its normal 10 ms a key into a multi-line box, React can report
    "Maximum update depth exceeded" at the moment the text wraps onto a second line.
  - At a person's typing speed (and when pasting) it doesn't happen, so the journey types that
    box at 100 ms a key.
- **Some details of how the tools behave:**
  - Vitest 5 reports a caught API error as unhandled when a mock is given a rejecting
    implementation after another one. The tests use `mockRejectedValueOnce` instead.
  - Cypress 16 replaced `Cypress.env()` with `Cypress.expose()`, which is used in
    `cypress.config.js`.
  - Cypress's built-in browser warns that it's being phased out. `npx cypress run --browser firefox`
    also works.
- **Where the tests run:** they run locally, not against the AWS deployment, and nothing runs them
  automatically on each push.
