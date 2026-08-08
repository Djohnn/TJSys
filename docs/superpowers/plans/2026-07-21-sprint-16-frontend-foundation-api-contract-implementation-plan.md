# Sprint 16 Frontend Foundation and API Contract Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Option 1 is locked; do not switch to superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Create the React web foundation and make the Django API safely consumable through a versioned OpenAPI contract, session authentication, CSRF and tenant-aware typed requests.

**Architecture:** Build a standalone Vite SPA in `frontend/`; do not reuse PDV runtime code. The browser authenticates only with Django session cookies, obtains CSRF explicitly, and sends the selected tenant in `X-Tenant-ID`. Django publishes OpenAPI through drf-spectacular and allows credentialed CORS only from configured origins.

**Tech Stack:** React 18, Vite 7, TypeScript 5.5, React Router 7, TanStack Query 5, React Hook Form 7, Zod 3, openapi-typescript, Vitest 4, Testing Library, MSW 2, Playwright 1.45, axe-core, Django 5, DRF, drf-spectacular, django-cors-headers.

---

## Execution protocol

Execute on a new `feat/sprint-16-frontend-foundation` worktree based on updated `master`. Do not ask architecture questions: every technology, route, state boundary and security choice is locked below. Stop only for a reproducible failing baseline, unavailable required runtime, or missing external authority; otherwise resolve implementation details by matching existing repository conventions.

## Locked decisions

- Package manager: npm with committed `frontend/package-lock.json`.
- SPA only; no SSR and no Next.js.
- Session cookie is the only web authentication mechanism; never persist JWT/session secrets in Web Storage.
- API URL comes from `VITE_API_BASE_URL`, default `/api/v1`.
- Server state lives in TanStack Query; auth/tenant selection lives in React context.
- API-generated types live in `frontend/src/api/generated/schema.ts` and are never hand-edited.
- All backend errors exposed to UI normalize to RFC 9457-style `ApiProblem`.
- CI gates: backend suite, OpenAPI validation, frontend lint, typecheck, unit tests and build.

### Task 1: Backend browser-integration configuration

**Files:**
- Modify: `backend/pyproject.toml`
- Modify: `backend/config/settings/base.py`
- Modify: `backend/config/urls.py`
- Modify: `.env.example`
- Create: `backend/tests/test_frontend_readiness.py`

- [ ] Write BDD tests proving: allowed origin receives credentialed CORS headers; unlisted origin does not; `/api/v1/schema/` returns OpenAPI JSON; `/api/v1/docs/` loads Swagger UI.
- [ ] Run `C:\ERP\.venv\Scripts\python.exe -m pytest tests/test_frontend_readiness.py -q --no-cov`; expect failures for missing packages/routes/headers.
- [ ] Add dependencies `django-cors-headers>=4.4,<5` and `drf-spectacular>=0.27,<1` to `backend/pyproject.toml`, then run `C:\ERP\.venv\Scripts\python.exe -m pip install -e ".[dev]"` from `backend/`.
- [ ] Add `corsheaders` and `drf_spectacular`, place `corsheaders.middleware.CorsMiddleware` immediately after `SecurityMiddleware`, set `CORS_ALLOWED_ORIGINS` from environment, set `CORS_ALLOW_CREDENTIALS = True`, and set DRF `DEFAULT_SCHEMA_CLASS = 'drf_spectacular.openapi.AutoSchema'`.
- [ ] Add `SpectacularAPIView` at `/api/v1/schema/` and `SpectacularSwaggerView` at `/api/v1/docs/`; schema title is `TJSys API`, version `1.0.0`, and schema is not public without authentication outside DEBUG.
- [ ] Add `CORS_ALLOWED_ORIGINS=http://localhost:5173,http://127.0.0.1:5173` to `.env.example`.
- [ ] Run the focused test; expect all scenarios PASS.
- [ ] Run `python manage.py spectacular --file openapi.yaml --validate`; expect exit 0.
- [ ] Commit with `feat(api): publish browser-ready OpenAPI contract`.

### Task 2: Scaffold the web application

**Files:**
- Replace: `frontend/README.md`
- Create: `frontend/package.json`, `frontend/package-lock.json`, `frontend/index.html`
- Create: `frontend/tsconfig.json`, `frontend/tsconfig.node.json`, `frontend/vite.config.ts`
- Create: `frontend/eslint.config.js`, `frontend/playwright.config.ts`
- Create: `frontend/src/main.tsx`, `frontend/src/app/App.tsx`, `frontend/src/styles/global.css`
- Create: `frontend/src/test/setup.ts`, `frontend/src/app/App.test.tsx`

- [ ] From `frontend/`, run `npm init -y`, then create the exact Vite/TypeScript files listed above; replace the placeholder README with setup, scripts and security conventions.
- [ ] Install fixed runtime dependencies: `npm install react@18.3.1 react-dom@18.3.1 react-router-dom@7.18.1 @tanstack/react-query@5 react-hook-form@7 zod@3 @hookform/resolvers@3`.
- [ ] Install fixed dev dependency majors: `npm install -D typescript@5.5 vite@7 @vitejs/plugin-react@5 vitest@4 jsdom@29 @testing-library/react@16 @testing-library/jest-dom@6 @testing-library/user-event@14 msw@2 openapi-typescript@7 @playwright/test@1.45 @axe-core/playwright@4 eslint@9 prettier@3`.
- [ ] Set scripts exactly: `dev`, `build`, `lint`, `typecheck`, `test`, `test:watch`, `test:e2e`, `api:generate` and `api:check`; `api:generate` runs `openapi-typescript http://127.0.0.1:8000/api/v1/schema/ -o src/api/generated/schema.ts`, while CI exports the schema locally before generation and fails on generated diff.
- [ ] Write `App.test.tsx` asserting the TJSys shell renders; run `npm test -- --run src/app/App.test.tsx`; expect RED before `App` exists.
- [ ] Implement semantic landmarks (`header`, `nav`, `main`) and global tokens for color, spacing, focus and typography; do not add a component framework.
- [ ] Run `npm run lint && npm run typecheck && npm test && npm run build`; expect exit 0.
- [ ] Commit with `feat(frontend): scaffold React web application`.

### Task 3: Typed API client and Problem Details

**Files:**
- Create: `frontend/src/api/generated/schema.ts`
- Create: `frontend/src/api/problem.ts`, `frontend/src/api/client.ts`
- Create: `frontend/src/api/client.test.ts`
- Create: `frontend/src/test/server.ts`, `frontend/src/test/handlers.ts`

- [ ] Generate `schema.ts` from the running backend and commit the deterministic output.
- [ ] Write tests for JSON success, CSRF header on unsafe methods, `credentials: include`, `X-Tenant-ID`, correlation ID capture, 401 and Problem Details normalization.
- [ ] Run `npm test -- --run src/api/client.test.ts`; expect RED because `apiRequest` is absent.
- [ ] Implement `ApiProblem` with `type`, `title`, `status`, `detail`, `code`, `errors`, `correlationId`; implement `apiRequest<T>(path, options)` using `fetch`, the configured base URL, JSON content negotiation and injected accessors for CSRF/tenant.
- [ ] Never retry POST/PATCH/DELETE automatically. Retry GET at most once only for network failure, never for 4xx/5xx.
- [ ] Start/stop/reset MSW in `src/test/setup.ts`.
- [ ] Run focused tests and `npm run typecheck`; expect exit 0.
- [ ] Commit with `feat(frontend): add typed tenant-aware API client`.

### Task 4: Session, CSRF, MFA and tenant contexts

**Files:**
- Create: `frontend/src/auth/AuthProvider.tsx`, `frontend/src/auth/authApi.ts`
- Create: `frontend/src/auth/LoginPage.tsx`, `frontend/src/auth/MfaPage.tsx`, `frontend/src/auth/ProtectedRoute.tsx`
- Create: `frontend/src/tenant/TenantProvider.tsx`, `frontend/src/tenant/TenantSelector.tsx`
- Create: `frontend/src/auth/AuthProvider.test.tsx`, `frontend/src/tenant/TenantProvider.test.tsx`
- Modify: `frontend/src/app/App.tsx`

- [ ] Write tests for initial CSRF/me lookup, successful login, MFA-required response, logout, protected redirect, tenant persistence by non-sensitive tenant ID, and query-cache clearing on tenant switch.
- [ ] Run both test files; expect RED for missing providers.
- [ ] Implement auth state machine `loading | anonymous | mfa_required | authenticated`; call `/auth/csrf/`, `/auth/login/`, `/auth/mfa/challenge/`, `/auth/me/`, `/auth/logout/` through the central client.
- [ ] Persist only selected tenant UUID under `tjsys:selected-tenant`; validate it against memberships returned by `/auth/me/` before use.
- [ ] On tenant switch call `queryClient.clear()` before exposing the new tenant ID.
- [ ] Configure routes `/login`, `/mfa` and protected `/`; browser back must not reveal protected cached data after logout.
- [ ] Run focused tests; expect PASS.
- [ ] Commit with `feat(frontend): implement session and tenant contexts`.

### Task 5: Shell, error boundaries and accessibility baseline

**Files:**
- Create: `frontend/src/layout/AppShell.tsx`, `frontend/src/layout/Navigation.tsx`
- Create: `frontend/src/errors/AppErrorBoundary.tsx`, `frontend/src/errors/ErrorState.tsx`
- Create: `frontend/src/components/LoadingState.tsx`, `frontend/src/components/EmptyState.tsx`
- Create: `frontend/src/layout/AppShell.test.tsx`

- [ ] Write tests for keyboard navigation, active-route semantics, permission-hidden navigation, loading/empty/problem states and correlation ID display.
- [ ] Run the test; expect RED.
- [ ] Implement the shell with skip link, landmarks, visible focus, responsive navigation and capability-based items. Hidden menu items do not replace backend authorization.
- [ ] Map 401 to logout, 403 to denied, 404 to not found, 409 to conflict and 5xx/network to retryable error.
- [ ] Run tests and axe assertions; expect zero serious/critical violations.
- [ ] Commit with `feat(frontend): add accessible application shell`.

### Task 6: E2E and CI gates

**Files:**
- Create: `frontend/e2e/auth-tenant.spec.ts`
- Create: `frontend/e2e/accessibility.spec.ts`
- Create: `frontend/e2e/fixtures.ts`
- Modify: `.github/workflows/ci.yml`
- Modify: `docs/PRD.md`
- Create: `docs/10_Releases/SPRINT-016_Frontend_Foundation_API_Contract_Final_Report.md`

- [ ] Extend `backend/tenancy/management/commands/seed_e2e.py` with a deterministic web admin, MFA-ready session fixtures and two tenants; use documented fake credentials exclusively in test environments.
- [ ] Write Playwright scenarios for login, MFA, tenant switch, logout, expired session and cross-tenant cache clearing.
- [ ] Run `npx playwright install --with-deps chromium firefox webkit` and `npm run test:e2e`; expect all scenarios PASS.
- [ ] Add CI steps with Node 22 cache: `npm ci`, `npm run api:check`, `npm run lint`, `npm run typecheck`, `npm test`, `npm run build`; add Playwright as a separate job after backend readiness.
- [ ] Add Sprint 16–20 sections and spec/plan links to `docs/PRD.md`; mark only Sprint 16 implementation boxes complete.
- [ ] Run backend pytest, Ruff, mypy, Django check, migration check, frontend unit tests, build and E2E. Record raw counts and durations in the final report.
- [ ] Commit with `feat: sprint 16 - fundacao frontend contrato api`.
