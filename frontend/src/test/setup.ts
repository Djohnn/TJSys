/// <reference types="vitest/globals" />
import '@testing-library/jest-dom/vitest'
import 'jest-axe/extend-expect'
import { server } from './server'

beforeAll(() => server.listen({ onUnhandledRequest: 'warn' }))
afterEach(() => server.resetHandlers())
afterAll(() => server.close())
