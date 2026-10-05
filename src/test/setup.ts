import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach, vi } from 'vitest'

// jsdom has no canvas, so confetti is a no-op unless a test mocks it itself.
vi.mock('canvas-confetti', () => ({ default: vi.fn() }))

afterEach(cleanup)
