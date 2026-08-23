import { setupServer } from 'msw/node'
import { handlers, favoritesHandlers } from './handlers'

export const server = setupServer(...handlers, ...favoritesHandlers)
