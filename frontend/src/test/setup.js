// Runs before every test file: adds jest-dom's checks (toBeInTheDocument, toBeDisabled...)
// and clears what each test rendered and mocked.
import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach, vi } from 'vitest'

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  localStorage.clear()
})
