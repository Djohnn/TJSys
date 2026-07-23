# Zyrp Frontend

Web application for the Zyrp ERP — React SPA consuming the Django REST API.

## Security conventions

- **No tokens in localStorage.** Authentication uses secure session cookies
  (HTTP-only, SameSite=Lax). The SPA never stores JWTs, API keys or any
  credentials in `localStorage` or `sessionStorage`.
- **No secrets in the bundle.** Environment variables that reach the browser
  (`VITE_*`) must be non-sensitive — public API URLs, feature flags, public
  analytics IDs. Never prefix secrets with `VITE_`.
- **Session-only auth.** The session cookie is set by the backend on login and
  cleared on logout. The frontend only reads the authenticated-user endpoint
  (`/api/v1/auth/me/`) to hydrate state.

## Scripts

| Command | Description |
|---|---|
| `npm run dev` | Start Vite dev server (port 5173) |
| `npm run build` | Type-check then build for production |
| `npm run lint` | ESLint checks on `src/` |
| `npm run typecheck` | TypeScript type-checking (`tsc --noEmit`) |
| `npm test` | Run vitest tests |
| `npm run test:watch` | Vitest in watch mode |
| `npm run test:e2e` | Playwright E2E tests |
| `npm run api:generate` | Generate TypeScript types from OpenAPI schema |
| `npm run api:check` | Compare generated types against committed ones |

## Stack

- **React 18** with TypeScript (strict mode, react-jsx transform)
- **Vite 7** for dev server and bundling
- **react-router-dom v7** for routing
- **@tanstack/react-query** for server-state management
- **react-hook-form + zod** for forms and validation
- **vitest + @testing-library/react** for unit/integration tests
- **@playwright/test + @axe-core/playwright** for E2E and accessibility
- **openapi-typescript** for generated API client types

## Dev proxy

In development the Vite server proxies `/api` to `http://127.0.0.1:8000`.
