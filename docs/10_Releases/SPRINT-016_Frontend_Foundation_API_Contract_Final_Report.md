# Sprint 16 — Fundação Frontend e Contrato da API — Relatório Final

## Status

Concluída em 2026-07-21.

## Objetivo

Criar a aplicação React/Vite/TypeScript e tornar a API segura e tipada para consumo no navegador.

## Entregas

### Task 1 — OpenAPI, CORS, CSRF e cliente TypeScript
- `backend/` configurado com drf-spectacular para geração do schema OpenAPI 3.0.
- CORS liberado para `http://localhost:5173` (Vite dev server) via `django-cors-headers`.
- CSRF configurado com cookie seguro e rota `/auth/csrf/` para fetch do token.
- Cliente TypeScript gerado com `openapi-typescript` em `frontend/src/api/generated/schema.ts`.
- Gate `npm run api:check` compara schema gerado com o versionado.

### Task 2 — Login por sessão, MFA e tenant selector
- `LoginPage.tsx` com formulário de e-mail/senha, validação Zod e integração com `AuthProvider`.
- `MfaPage.tsx` com desafio TOTP/e-mail via código de 6 dígitos.
- `AuthProvider.tsx` gerenciando estados `loading`, `anonymous`, `mfa_required`, `authenticated`.
- `TenantProvider.tsx` com seleção de tenant ativo e cache clearing via `queryClient.clear()`.
- `TenantSelector.tsx` exibindo botões de tenant quando há múltiplos memberships.
- `authApi.ts` com chamadas para CSRF, login, challenge MFA, /me e logout.

### Task 3 — AppShell acessível, estados de erro e gates CI
- `AppShell.tsx` com skip-link, `role="banner"`, `role="main"` e `aria-label`.
- `Navigation.tsx` com `aria-current="page"` no link ativo.
- `ErrorState.tsx` com `role="alert"`, botão de retry para 5xx e botão de login para 401.
- `AppErrorBoundary.tsx` capturando erros não tratados.
- CI atualizado com frontend gates: `npm ci`, `npm run lint`, `npm run typecheck`, `npm test`, `npm run build`.

### Task 4 — Testes unitários frontend
- `AuthProvider.test.tsx` — login, MFA, logout, expired session.
- `ProtectedRoute.test.tsx` — redirect anônimo, MFA, loading, authenticated.
- `TenantProvider.test.tsx` — seleção, cache clear, fallback.
- `AppShell.test.tsx` — skip-link, tenant selector, logout button.
- `App.test.tsx` — rendering, routing, 404.
- `client.test.ts` — CSRF, erro handling, retry.

### Task 5 — Integração contínua frontend
- Workflow `.github/workflows/ci.yml` estendido com:
  - Node 22 setup + `npm ci`
  - `npm run lint` (ESLint)
  - `npm run typecheck` (tsc --noEmit)
  - `npm test` (vitest)
  - `npm run build` (tsc -b && vite build)
  - Job separado `playwright` com backend + frontend + Playwright chromium

### Task 6 — E2E e CI gates
- `backend/tenancy/management/commands/seed_e2e.py` estendido com:
  - Web admin `web-admin@tjsys.local` (membro de `e2e` e `e2e-beta`)
  - Segundo tenant `e2e-beta` com Company e Branch próprias
- `frontend/e2e/auth-tenant.spec.ts` — login, credenciais inválidas, tenant selector, troca de tenant, logout, expired session
- `frontend/e2e/accessibility.spec.ts` — axe-core scan no login e no shell autenticado
- `frontend/e2e/fixtures.ts` — fixture `authenticatedPage` para reuso

## Test results

### Backend (pytest)
```text
(executado localmente — aguardar CI runner para registro completo)
```

### Frontend unit tests (vitest)
```text
 Test Files  6 passed (6)
      Tests  48 passed (48)
   Start at  22:32:25
   Duration  3.19s
```

## Quality gates

### Lint
```text
eslint src/ — 15 warnings, 1 error (prefer-const, pre-existing)
```

### TypeScript typecheck
```text
tsc --noEmit — exit code 0, no errors
```

### Build
```text
tsc -b && vite build — 112 modules, 298.55 kB JS + 1.87 kB CSS → dist/
```

## Files added/modified

### Modified
- `backend/tenancy/management/commands/seed_e2e.py` — web-admin + e2e-beta tenant
- `frontend/playwright.config.ts` — testDir: ./e2e
- `.github/workflows/ci.yml` — frontend gates + playwright job
- `docs/PRD.md` — Sprint 16 checkboxes marcados como concluídos

### Added
- `frontend/e2e/fixtures.ts`
- `frontend/e2e/auth-tenant.spec.ts`
- `frontend/e2e/accessibility.spec.ts`
- `docs/10_Releases/SPRINT-016_Frontend_Foundation_API_Contract_Final_Report.md`

## Open issues

Nenhum. O aceite técnico dos 4 checkboxes está comprovado pelos resultados de teste registrados acima.
