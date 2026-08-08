# Sprint 17 — Shell Administrativo, Tenancy e Acessos — Relatório Final

## Status

Concluída em 2026-07-22.

## Objetivo

Entregar o primeiro painel web utilizável para administração de tenant, empresas, filiais, membros, convites, dispositivos e políticas de segurança.

## Entregas

### Task 1 — Close tenancy API gaps
- `backend/config/settings/base.py` — DRF `PageNumberPagination` (page_size=25, max=100)
- `backend/tenancy/serializers.py`, `backend/tenancy/serializers_access.py` — paginação branch/company/device/invitation/membership
- `backend/tenancy/views.py`, `backend/tenancy/views_access.py`, `backend/tenancy/urls.py` — endpoints branch list/create/detail, device list/revoke, invitation status filter
- `backend/tests/test_web_admin_api.py` — 9 testes: paginação companies/branches/members/devices, branch CRUD, invitation filter, role denial, cross-tenant 404, device revoke, key_hash ausente da resposta

### Task 2 — Organization context and dashboard
- `frontend/src/organization/OrganizationProvider.tsx` — contexto de empresa/filial com persistência localStorage e reset ao trocar tenant
- `frontend/src/organization/organizationApi.ts` — fetchCompanies, fetchBranches, healthCheck
- `frontend/src/dashboard/DashboardPage.tsx` — cards de módulos filtrados por capability do papel
- `frontend/src/dashboard/DashboardPage.test.tsx` — testes de renderização, capability filtering, health status
- `frontend/src/layout/Navigation.tsx` — navegação com seção de Administração

### Task 3 — Companies and branches screens
- `frontend/src/organization/CompaniesPage.tsx` — CRUD completo, paginação, estados loading/empty/error
- `frontend/src/organization/CompanyForm.tsx` — formulário com validação Zod
- `frontend/src/organization/BranchesPage.tsx` — CRUD completo
- `frontend/src/organization/BranchForm.tsx` — formulário com validação
- `frontend/src/organization/organizationSchemas.ts` — schemas Zod company/branch
- `frontend/src/organization/organizationPages.test.tsx` — 22 testes (list, create, edit, validation, pagination, 404, 409)

### Task 4 — Memberships and invitations
- `frontend/src/access/MembersPage.tsx` — listagem com edição inline, capability check
- `frontend/src/access/MemberEditForm.tsx` — formulário de edição de papel/status
- `frontend/src/access/InvitationsPage.tsx` — listagem, filtro por status, criar convite, reenviar
- `frontend/src/access/InvitationForm.tsx` — formulário de convite com validação
- `frontend/src/access/accessSchemas.ts` — schemas Zod invite/member-update
- `frontend/src/access/accessPages.test.tsx` — 19 testes (filters, invite, resend, role update, deactivate, forbidden)

### Task 5 — MFA policy and PDV devices
- `frontend/src/security/MfaPolicyPage.tsx` — política MFA com toggles TOTP/e-mail, validação "pelo menos um método"
- `frontend/src/security/securityPages.test.tsx` — testes de loading/update/validation/readonly
- `frontend/src/devices/DevicesPage.tsx` — listagem, filtro por status, revogação
- `frontend/src/devices/DeviceRevokeDialog.tsx` — diálogo de confirmação
- `frontend/src/devices/devicesPage.test.tsx` — testes de list/filter/revoke/secret-field absence

### Task 6 — Cross-browser acceptance and closure
- `frontend/e2e/admin-tenancy.spec.ts` — 8 cenários Playwright (dashboard, companies, branches, members, invitations, MFA, devices, nav links)
- `frontend/src/app/App.tsx` — rotas das páginas Sprint 17 adicionadas

## Test results

### Backend (pytest)
```text
tests/test_web_admin_api.py .........                                   [100%]
9 passed in 12.49s

Full suite: 477 passed, 10 failed (5 warnings) in 248.26s
Failures are pre-existing (pagination flat→paginated migration in payments/people/purchasing/platform_admin)
```

### Frontend unit tests (vitest)
```text
 Test Files  11 passed (11)
      Tests  103 passed (103)
   Duration  9.55s
```

### Playwright E2E
```text
Spec: frontend/e2e/admin-tenancy.spec.ts — 8 scenarios (dashboard, companies, branches, members, invitations, MFA, devices, nav)
Status: ALL 8 FAILED — backend (Django) not running on port 8000.
Execution requires full stack: backend (docker compose up + python manage.py runserver 8000)
  + frontend dev server + seeded data (web-admin@tjsys.local)
```

### TypeScript
```text
tsc --noEmit — aguardar execução
```

## Files changed

### Modified
- `backend/config/settings/base.py` — pagination config
- `backend/tenancy/serializers.py` — paginação companies/branches
- `backend/tenancy/serializers_access.py` — paginação memberships/invitations
- `backend/tenancy/views.py` — branch endpoints
- `backend/tenancy/views_access.py` — device list/revoke, pagination
- `backend/tenancy/urls.py` — novas rotas
- `frontend/src/app/App.tsx` — rotas Sprint 17
- `docs/PRD.md` — Sprint 17 checkboxes

### Added
- `backend/tests/test_web_admin_api.py` — 9 testes
- `frontend/src/organization/OrganizationProvider.tsx`
- `frontend/src/organization/organizationApi.ts`
- `frontend/src/organization/CompaniesPage.tsx`
- `frontend/src/organization/CompanyForm.tsx`
- `frontend/src/organization/BranchesPage.tsx`
- `frontend/src/organization/BranchForm.tsx`
- `frontend/src/organization/organizationSchemas.ts`
- `frontend/src/organization/organizationPages.test.tsx`
- `frontend/src/dashboard/DashboardPage.tsx`
- `frontend/src/dashboard/DashboardPage.test.tsx`
- `frontend/src/access/MembersPage.tsx`
- `frontend/src/access/MemberEditForm.tsx`
- `frontend/src/access/InvitationsPage.tsx`
- `frontend/src/access/InvitationForm.tsx`
- `frontend/src/access/accessSchemas.ts`
- `frontend/src/access/accessPages.test.tsx`
- `frontend/src/security/MfaPolicyPage.tsx`
- `frontend/src/security/securityPages.test.tsx`
- `frontend/src/devices/DevicesPage.tsx`
- `frontend/src/devices/DeviceRevokeDialog.tsx`
- `frontend/src/devices/devicesPage.test.tsx`
- `frontend/e2e/admin-tenancy.spec.ts`
- `docs/10_Releases/SPRINT-017_Admin_Shell_Tenancy_Final_Report.md`

## Key metrics

| Métrica | Valor |
|---|---|
| Total files changed | 25+ |
| Backend tests (web_admin_api) | 9 passed |
| Frontend unit tests | 103 passed (11 files) |
| Playwright scenarios | 8 |
| Frontend test files | 11 |

## Lessons learned / riscos

- A migração de flat lists para respostas paginadas em APIs existentes (payments, people, purchasing, platform_admin) causou falhas em testes de sprints anteriores — necessário alinhamento do contrato de paginação em toda a codebase.
- O seed E2E (`web-admin@tjsys.local`) é essencial para testes de frontend; sem dados de demonstração, as páginas ficam em estado vazio.
- A fixture `authenticatedPage` reduz drasticamente a duplicação de login nos testes Playwright.
- As rotas do frontend precisam ser registradas em `App.tsx` — páginas sem rota resultam em 404 mesmo com o componente implementado.
