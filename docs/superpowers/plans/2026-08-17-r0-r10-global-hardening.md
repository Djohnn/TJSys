# R0-R10 Global Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eliminar as divergências acumuladas após consolidar R0-R10, deixando testes backend, Ruff, mypy, Django check e migrations sem falhas.

**Architecture:** Preservar os contratos canônicos já validados nas sprints e corrigir consumidores legados, fixtures e configuração na origem. Cada grupo começa pelos failures reproduzidos, aplica a menor correção e roda primeiro o grupo afetado; a suíte global e os gates estáticos encerram o trabalho.

**Tech Stack:** Django 5.2, DRF, PostgreSQL, pytest-django, Ruff e mypy.

---

### Task 1: Reconciliar contratos legados de Sales e autenticação

**Files:**
- Modify: `backend/tests/test_coverage_final.py`
- Modify: `backend/tests/test_sales_tenancy_coverage.py`
- Modify: `backend/tests/test_unified_coverage.py`
- Modify: `backend/tests/test_final_coverage_push.py`

- [ ] Reproduzir os failures de `SaleViewSet.action`, `reason` obrigatório, locks com mocks, HTTP `201` das actions compensatórias e login MFA HTTP `202`.
- [ ] Comparar os testes com `backend/sales/services.py`, `backend/sales/views.py` e `backend/accounts/views/login.py`.
- [ ] Atualizar somente os consumidores legados para o contrato atual; não tornar `reason` opcional, não remover locks e não regredir MFA.
- [ ] Rodar os quatro arquivos até o grupo ficar verde.
- [ ] Commitar a onda isoladamente.

### Task 2: Reconciliar fixtures dos comandos protegidos

**Files:**
- Modify: `backend/tests/test_people_commands_coverage.py`
- Reference: `backend/tenancy/management/commands/seed_e2e.py`

- [ ] Reproduzir os failures do `seed_e2e`, `seed_tenants` e `audit_stock_policies`.
- [ ] Identificar os requisitos ambientais e de tenant context exigidos pelos comandos.
- [ ] Configurar as fixtures/testes com settings e variáveis E2E explícitas, preservando o fail-closed do comando.
- [ ] Rodar o arquivo completo até ficar verde.
- [ ] Commitar a onda isoladamente.

### Task 3: Reconciliar catálogo, estoque e fiscal

**Files:**
- Modify: `backend/tests/test_product_stock_api.py`
- Modify: `backend/tests/test_product_stock_control_new.py`
- Modify: `backend/tests/test_product_stock_policy.py`
- Modify: `backend/tests/test_fiscal_receipt_validation.py`
- Modify implementation only if a current contract test proves a product defect.

- [ ] Reproduzir os failures de resumo de estoque, correlation/preconditions, migration histórica de `Product.subcategory` e CNPJ do fornecedor.
- [ ] Comparar com migrations atuais, serializers/views vigentes e validação fiscal canônica.
- [ ] Corrigir fixtures históricas ou implementação conforme a causa comprovada.
- [ ] Rodar os quatro arquivos até ficarem verdes.
- [ ] Commitar a onda isoladamente.

### Task 4: Separar e corrigir o contrato de papéis PostgreSQL

**Files:**
- Modify: `backend/tests/test_database_roles.py`
- Modify: `infra/postgres/init/001_roles.sh` somente se o papel runtime real estiver privilegiado.

- [ ] Consultar os papéis usados por runtime, migrations e criação do banco de teste.
- [ ] Confirmar se `CREATEDB` pertence apenas ao executor de testes ou vazou para o papel runtime.
- [ ] Corrigir a configuração ou a asserção para testar o papel correto, sem reduzir isolamento RLS.
- [ ] Rodar `backend/tests/test_database_roles.py` até ficar verde.
- [ ] Commitar a onda isoladamente.

### Task 5: Zerar a suíte backend global

**Files:**
- Modify somente arquivos associados a failures ainda reproduzíveis.

- [ ] Rodar `python -m pytest tests -q --no-cov`.
- [ ] Para cada failure residual, registrar causa, criar/reusar RED focal e aplicar uma única correção.
- [ ] Repetir o teste focal e depois a suíte global até obter zero failures.
- [ ] Rodar `manage.py check` e `makemigrations --check --dry-run`.
- [ ] Commitar eventuais correções residuais.

### Task 6: Zerar Ruff e mypy globais

**Files:**
- Modify: arquivos reportados por `ruff check .` e `mypy .`.

- [ ] Rodar Ruff com estatísticas e aplicar formatação/correções mecânicas sem mudar comportamento.
- [ ] Rodar a suíte afetada depois de cada lote mecânico.
- [ ] Adicionar anotações explícitas aos modelos PDV e validar o loader opcional de `catalog/tests/conftest.py`.
- [ ] Rodar `ruff check .` e `mypy .` até ambos retornarem zero.
- [ ] Reexecutar a suíte backend global após o lote estático.
- [ ] Commitar o hardening estático.

### Task 7: Consolidar evidência e integrar

**Files:**
- Create: `docs/10_Releases/R0_R10_GLOBAL_HARDENING_FINAL_REPORT.md`
- Modify: `docs/PRD.md`

- [ ] Registrar outputs reais de testes, Ruff, mypy, Django e migrations.
- [ ] Atualizar o PRD sem declarar sucesso para qualquer gate ainda falho.
- [ ] Atualizar o Graphify e manter os artefatos gerados fora do commit.
- [ ] Integrar a branch na `master`, repetir os gates finais e confirmar `git status` limpo.
- [ ] Remover worktree e branch temporárias; não fazer push.
