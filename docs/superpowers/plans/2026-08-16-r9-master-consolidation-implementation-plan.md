# R9 Master Consolidation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reconciliar a implementação validada da Sprint R9 com a `master`, preservando as alterações atuais e incorporando somente a dependência técnica necessária da R8.

**Architecture:** A integração parte de `master@02ac51c` em worktree isolado. O merge histórico da branch `codex/r9-finalization` será preparado sem commit, classificado por escopo e resolvido com preferência explícita por mudanças R9 comprovadas nos fluxos pós-venda, mantendo a versão atual da `master` em áreas não relacionadas. Correções novas só serão feitas por RED/GREEN.

**Tech Stack:** Django 5, Django REST Framework, PostgreSQL, React/Vite, Vitest, Playwright, Ruff, mypy e Git worktrees.

---

### Task 1: Fixar baseline e fronteiras da integração

**Files:**
- Create: `docs/superpowers/plans/2026-08-16-r9-master-consolidation-implementation-plan.md`
- Inspect: `docs/superpowers/specs/2026-07-18-sprint-9-returns-cancellations-refunds-design.md`
- Inspect: `docs/10_Releases/SPRINT-009_Returns_Cancellations_Refunds_Final_Report.md`

- [ ] **Step 1: Confirmar o ponto de partida**

Run: `git status --short --branch && git rev-parse HEAD`

Expected: branch `codex/r9-consolidation`, árvore limpa antes deste plano e HEAD `02ac51c28f3e3cb7bf03980a6d0f490060a92882`.

- [ ] **Step 2: Registrar baseline backend**

Run: `C:\ERP\.venv\Scripts\python.exe -m pytest tests/test_sales_returns_models.py tests/test_sales_returns_services.py tests/test_sales_refunds_services.py tests/test_sales_cancellations_services.py tests/test_sales_returns_api.py -q --no-cov`

Expected: `34 passed`.

- [ ] **Step 3: Registrar baseline frontend e PDV**

Run: `npm.cmd test -- --run` em `frontend` e `npm.cmd test` em `pdv`.

Expected: frontend `377 passed`; PDV `210 passed`.

- [ ] **Step 4: Commitar somente o plano**

Run: `git add docs/superpowers/plans/2026-08-16-r9-master-consolidation-implementation-plan.md && git commit -m "docs(r9): plan master consolidation"`

Expected: commit isolado contendo apenas este arquivo.

### Task 2: Preparar e classificar o merge histórico

**Files:**
- Modify: arquivos apresentados por `git status` após o merge sem commit
- Preserve: `frontend/playwright-report/index.html`
- Preserve: `graphify-out/`

- [ ] **Step 1: Preparar merge sem commit**

Run: `git merge --no-ff --no-commit codex/r9-finalization`

Expected: merge preparado ou conflitos explícitos; nenhum commit automático.

- [ ] **Step 2: Classificar cada arquivo**

Run: `git status --short` e `git diff --name-status --cached`.

Keep R9: `backend/sales/`, testes R9, dialogs e API de `frontend/src/salesManagement/`, E2E/CI necessário, migrations, PRD e relatório R9.

Keep R8 prerequisite only when required by R9: observabilidade/monitoring, scripts operacionais e configuração de teste comprovadamente dependente.

Restore from current `HEAD`: catálogo, estoque, PDV e outros arquivos sem vínculo demonstrável com R9, salvo quando um teste R9 reproduz uma dependência real.

- [ ] **Step 3: Resolver conflitos sem descartar mudanças atuais da master**

Para cada conflito, comparar base, ours e theirs com `git diff --cc <arquivo>` e preservar contratos já presentes na `master`. Não usar resolução global `--ours` ou `--theirs`.

- [ ] **Step 4: Validar higiene do diff**

Run: `git diff --check && git status --short`.

Expected: nenhum marcador de conflito, nenhum artefato gerado e nenhuma mudança fora da classificação registrada.

### Task 3: Verificar contratos de domínio e API R9

**Files:**
- Test: `backend/tests/test_sales_returns_models.py`
- Test: `backend/tests/test_sales_returns_services.py`
- Test: `backend/tests/test_sales_refunds_services.py`
- Test: `backend/tests/test_sales_cancellations_services.py`
- Test: `backend/tests/test_sales_compensation_concurrency.py`
- Test: `backend/tests/test_sales_returns_api.py`
- Test: `backend/tests/test_sales_refund_migrations.py`
- Test: `backend/tests/test_sales_rls_migration.py`

- [ ] **Step 1: Executar suíte funcional isolada**

Run: `C:\ERP\.venv\Scripts\python.exe -m pytest tests/test_sales_returns_models.py tests/test_sales_returns_services.py tests/test_sales_refunds_services.py tests/test_sales_cancellations_services.py tests/test_sales_returns_api.py -q --no-cov`.

Expected: zero falhas; mesma chave/payload é replay, chave divergente é conflito, cross-tenant é 404 estável e respostas de erro usam `application/problem+json`.

- [ ] **Step 2: Executar concorrência, rollback e migrations em processos separados**

Run separadamente: `pytest tests/test_sales_compensation_concurrency.py`, `pytest tests/test_sales_refund_migrations.py` e `pytest tests/test_sales_rls_migration.py` com `--no-cov`.

Expected: zero falhas e nenhum resíduo de schema entre os processos.

- [ ] **Step 3: Aplicar TDD se surgir regressão real**

Adicionar um cenário Given/When/Then mínimo que falhe pelo comportamento incorreto, capturar RED, implementar a menor correção e capturar GREEN. Não alterar produção para falhas exclusivamente ambientais.

### Task 4: Verificar frontend, acessibilidade e E2E

**Files:**
- Test: `frontend/src/salesManagement/compensations.test.tsx`
- Test: `frontend/e2e/pdv-management-financial.spec.ts`
- Inspect: `frontend/src/salesManagement/ReturnDialog.tsx`
- Inspect: `frontend/src/salesManagement/RefundDialog.tsx`
- Inspect: `frontend/src/salesManagement/CancellationDialog.tsx`

- [ ] **Step 1: Executar Vitest focado e completo**

Run: `npm.cmd test -- --run src/salesManagement/compensations.test.tsx` e depois `npm.cmd test -- --run`.

Expected: zero falhas.

- [ ] **Step 2: Executar typecheck, lint e build**

Run: `npm.cmd run typecheck`, `npm.cmd run lint` e `npm.cmd run build`.

Expected: exit 0; warnings devem ser separados de erros.

- [ ] **Step 3: Auditar UI R9 com Impeccable**

Executar o contexto Impeccable nos dialogs R9, aplicar os playbooks `audit`, `polish` e `critique` em passes limitados, sem redesenhar as telas.

- [ ] **Step 4: Executar Playwright R9 com retries zero**

Run: `npx.cmd playwright test e2e/pdv-management-financial.spec.ts --project=chromium --retries=0` com stack E2E e credenciais isoladas.

Expected: cenários R9 passam sem waits fixos e sem reutilização indevida de estado.

### Task 5: Gates finais, evidência e integração

**Files:**
- Modify: `docs/10_Releases/SPRINT-009_Returns_Cancellations_Refunds_Final_Report.md`
- Modify: `docs/PRD.md`

- [ ] **Step 1: Executar qualidade backend**

Run: Ruff e mypy no escopo alterado; `manage.py check`; `manage.py makemigrations --check --dry-run`; `manage.py migrate --check` no banco de teste correto.

Expected: zero erros no escopo R9. Dívida global externa deve permanecer explicitamente separada.

- [ ] **Step 2: Atualizar evidência corrente**

Substituir afirmações de fechamento corrente por outputs desta reconciliação, incluindo comando, contagem, duração, exit code, commit e ressalvas ambientais reais.

- [ ] **Step 3: Criar commit de reconciliação**

Run: stage seletivo dos arquivos R9 validados e `git commit -m "merge: consolidate R9 returns and refunds"`.

Expected: nenhum relatório Playwright ou `graphify-out/` no commit.

- [ ] **Step 4: Reexecutar os gates pós-commit**

Run: suíte R9 backend, frontend, PDV afetado, checks estáticos e `git diff --check` novamente.

Expected: outputs frescos com exit 0 antes de qualquer merge em `master`.

- [ ] **Step 5: Integrar na master e limpar**

Run: merge local não fast-forward de `codex/r9-consolidation` na worktree limpa da `master`, revalidar status e remover somente o worktree de consolidação após confirmação do merge.

Expected: `master` contém a reconciliação R9, permanece limpa e os worktrees históricos não são alterados.
