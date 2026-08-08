# Sprint 0 Remediation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Transformar a fundação parcial do Sprint 0 em uma implementação verificável, com isolamento multi-tenant real, RLS sem bypass, testes IDOR, integridade organizacional, observabilidade correta e aceite reproduzível.

**Architecture:** PostgreSQL separará o papel proprietário do papel de runtime. O tenant ativo será validado explicitamente e aplicado com `SET LOCAL` dentro de transação por requisição; uma API mínima de empresas provará o isolamento. Contexto de logs usará `contextvars`, auditoria será imutável e a Outbox terá efeito idempotente observável.

**Tech Stack:** Python 3.12+, Django 5.1, DRF, PostgreSQL 16, Redis 7, Celery, pytest-django, Ruff, mypy, pytest-cov, Docker Compose, GitHub Actions

---

### Task 1: Reabrir o aceite sem evidência

**Files:**
- Modify: `docs/PRD.md`

- [ ] **Step 1: Corrigir estado do Sprint 0**

Alterar o estado para `Em correção` na tabela e na seção da sprint. Reabrir todos os itens de `0.5`, os itens não comprovados de `0.6` e `0.7`, e os itens de aceite `0.8` relativos a migrations, suíte, RLS, evidências e commit.

- [ ] **Step 2: Registrar o motivo**

Adicionar abaixo do estado:

```markdown
**Correção de aceite:** auditoria independente identificou bypass de RLS, ausência de IDOR real, migrations pendentes e checkboxes sem evidência. Os itens afetados permanecerão abertos até nova validação.
```

- [ ] **Step 3: Commit documental isolado**

```powershell
git add docs/PRD.md
git commit -m "docs: reopen unverified sprint 0 tasks"
```

### Task 2: Separar papéis PostgreSQL e provar RLS

**Files:**
- Modify: `infra/compose.yaml`
- Create: `infra/postgres/init/001_roles.sql`
- Modify: `.env.example`
- Modify: `backend/config/settings/local.py`
- Modify: `backend/config/settings/test.py`
- Modify: `backend/config/settings/production.py`
- Create: `backend/tests/test_database_roles.py`
- Modify: `backend/tests/test_isolation.py`

- [ ] **Step 1: Escrever testes vermelhos do papel de runtime**

Criar testes que consultem `pg_roles` e exijam `rolsuper = false`, `rolbypassrls = false` e usuário diferente do proprietário das tabelas tenant-scoped.

- [ ] **Step 2: Executar e confirmar falha**

Run: `pytest tests/test_database_roles.py -v`

Expected: falha porque `tjsys` é superuser e bypassa RLS.

- [ ] **Step 3: Criar bootstrap de papéis**

O init SQL criará `tjsys_owner` para migrations e `tjsys_app` para runtime, sem privilégios elevados. Conceder conexão, uso do schema, DML nas tabelas e privilégios default necessários ao papel app, mantendo propriedade com owner.

- [ ] **Step 4: Separar credenciais por ambiente**

Adicionar `POSTGRES_OWNER_*` e `POSTGRES_APP_*` ao `.env.example`. Settings de runtime usarão app; comandos de migration receberão owner por variáveis explícitas. Nenhum setting de produção poderá cair no segredo inseguro de `base.py`.

- [ ] **Step 5: Aplicar bootstrap sem destruir o banco local**

Executar o SQL idempotente no banco existente com o owner e aplicar migrations. O arquivo em `docker-entrypoint-initdb.d` atenderá instalações novas; nenhuma remoção de volume ou dados fará parte desta correção.

- [ ] **Step 6: Criar testes RLS reais**

Executar queries sob `tjsys_app` e provar:

- tenant A lê A e não lê B;
- tenant B lê B e não lê A;
- ausência de contexto retorna zero linhas;
- insert/update cross-tenant é rejeitado.

- [ ] **Step 7: Executar testes e commit**

Run: `pytest tests/test_database_roles.py tests/test_isolation.py::TestRLSIsolation -v`

Expected: todos passam usando papel não privilegiado.

```powershell
git add infra .env.example backend/config/settings backend/tests/test_database_roles.py backend/tests/test_isolation.py
git commit -m "fix(security): enforce RLS with app role"
```

### Task 3: Tornar o contexto tenant explícito e transacional

**Files:**
- Create: `backend/tenancy/context.py`
- Modify: `backend/config/tenant_middleware.py`
- Modify: `backend/config/settings/base.py`
- Create: `backend/tenancy/permissions.py`
- Create: `backend/tenancy/serializers.py`
- Create: `backend/tenancy/views.py`
- Create: `backend/tenancy/urls.py`
- Modify: `backend/config/urls.py`
- Create: `backend/tests/test_tenant_api.py`

- [ ] **Step 1: Escrever testes vermelhos de seleção e IDOR**

Usar dois usuários, dois tenants e duas empresas. Exigir header `X-Tenant-ID`, membership ativa, lista isolada, detalhe cross-tenant 404, escrita cross-tenant bloqueada e ausência de contexto 400 ou 403 padronizado.

- [ ] **Step 2: Confirmar falha pela ausência da API**

Run: `pytest tests/test_tenant_api.py -v`

Expected: falha por rota inexistente ou isolamento ausente.

- [ ] **Step 3: Implementar contexto com `contextvars`**

Expor `get_current_tenant_id`, `set_current_tenant_id` e reset por token. Não armazenar request globalmente.

- [ ] **Step 4: Reescrever middleware**

Validar `X-Tenant-ID` como UUID, confirmar membership ativa, envolver a resposta em `transaction.atomic()` e executar `SET LOCAL app.current_tenant_id = %s`. Resetar contexto Python em `finally`. Rotas públicas ficam sem tenant.

- [ ] **Step 5: Criar API mínima de empresas**

Implementar listagem e detalhe read-only filtrados pelo tenant ativo. Usar DRF, autenticação e resposta 404 para recurso de outro tenant.

- [ ] **Step 6: Executar testes e commit**

Run: `pytest tests/test_tenant_api.py tests/test_isolation.py -v`

```powershell
git add backend/tenancy backend/config backend/tests
git commit -m "fix(tenancy): isolate tenant request context"
```

### Task 4: Garantir integridade Empresa, Filial e Usuário

**Files:**
- Modify: `backend/tenancy/models.py`
- Create: `backend/tenancy/services.py`
- Create: `backend/tenancy/migrations/0003_tenant_integrity.py`
- Create: `backend/tests/test_tenant_integrity.py`

- [ ] **Step 1: Escrever testes vermelhos**

Testar que Branch rejeita tenant diferente de `company.tenant`, UserBranch rejeita usuário sem membership ativa e aceita vínculo coerente.

- [ ] **Step 2: Confirmar falhas atuais**

Run: `pytest tests/test_tenant_integrity.py -v`

- [ ] **Step 3: Implementar validação transacional**

Adicionar `clean()` e serviço de criação que bloqueie inconsistências. Usar constraint de banco para unicidade e invariantes locais; documentar por que a igualdade entre FKs exige validação de serviço ou trigger.

- [ ] **Step 4: Executar testes, migrations check e commit**

Run: `pytest tests/test_tenant_integrity.py -v`

Run: `python manage.py makemigrations --check --dry-run`

```powershell
git add backend/tenancy backend/tests/test_tenant_integrity.py
git commit -m "fix(tenancy): enforce organization integrity"
```

### Task 5: Corrigir correlation ID e contexto de logs

**Files:**
- Modify: `backend/config/middleware.py`
- Modify: `backend/config/log_context.py`
- Modify: `backend/config/settings/base.py`
- Create: `backend/tests/test_observability.py`

- [ ] **Step 1: Escrever testes vermelhos**

Testar UUID recebido válido, substituição de valor inválido ou excessivo, correlation ID na resposta, usuário e tenant no log, e ausência de vazamento na requisição seguinte.

- [ ] **Step 2: Implementar ordem e limpeza**

Validar UUID em `CorrelationIDMiddleware`. Usar `contextvars`. Preencher contexto após autenticação e tenant; limpar sempre em `finally`.

- [ ] **Step 3: Executar testes e commit**

Run: `pytest tests/test_observability.py -v`

```powershell
git add backend/config backend/tests/test_observability.py
git commit -m "fix(observability): isolate request log context"
```

### Task 6: Tornar auditoria imutável e sanitizada

**Files:**
- Modify: `backend/audit/models.py`
- Modify: `backend/audit/admin.py`
- Create: `backend/audit/services.py`
- Modify: `backend/tests/test_outbox.py`
- Create: `backend/tests/test_audit.py`

- [ ] **Step 1: Escrever testes vermelhos**

Testar bloqueio de update/delete pela API de modelo/serviço, admin somente leitura e remoção de chaves `password`, `token`, `secret`, `certificate` de detalhes.

- [ ] **Step 2: Implementar serviço append-only**

Centralizar criação, sanitizar recursivamente detalhes e impedir mutação de registro persistido. Admin não terá permissões de adicionar, alterar ou excluir.

- [ ] **Step 3: Executar testes e commit**

Run: `pytest tests/test_audit.py -v`

```powershell
git add backend/audit backend/tests/test_audit.py
git commit -m "fix(audit): enforce append-only records"
```

### Task 7: Dar efeito idempotente observável à Outbox

**Files:**
- Modify: `backend/outbox/models.py`
- Modify: `backend/outbox/services.py`
- Modify: `backend/outbox/tasks/publisher.py`
- Create: `backend/outbox/handlers.py`
- Create: `backend/outbox/migrations/0002_delivery_effect.py`
- Modify: `backend/tests/test_outbox.py`

- [ ] **Step 1: Escrever teste vermelho de efeito único**

Registrar handler de teste que persiste uma chave de efeito única. Processar a mesma mensagem duas vezes e exigir exatamente um efeito.

- [ ] **Step 2: Implementar registry e locking**

Usar `transaction.atomic`, `select_for_update`, registry por `event_type` e chave única `(message, handler)`. Mensagem publicada retorna sem repetir handler.

- [ ] **Step 3: Testar erro e retry**

Provar incremento de retry, estado de falha e dead letter sem duplicação de efeito.

- [ ] **Step 4: Executar testes e commit**

Run: `pytest tests/test_outbox.py -v`

```powershell
git add backend/outbox backend/tests/test_outbox.py
git commit -m "fix(outbox): prove idempotent delivery"
```

### Task 8: Fechar migrations, cobertura e CI

**Files:**
- Modify: `backend/pyproject.toml`
- Modify: `.github/workflows/ci.yml`
- Modify: `README.md`
- Modify: `backend/README.md`

- [ ] **Step 1: Configurar cobertura real**

Adicionar opções pytest-cov e relatório terminal/XML. Excluir migrations e exigir cobertura mínima inicial apenas como piso, preservando testes críticos como gates explícitos.

- [ ] **Step 2: Corrigir CI**

Executar migrations com owner, testes com app role, RLS/IDOR obrigatórios, Ruff, mypy, cobertura, `pip-audit`, detecção de segredos com baseline auditado e `check --deploy` com variáveis completas.

- [ ] **Step 3: Aplicar todas as migrations locais**

Run: `python manage.py migrate`

Run: `python manage.py migrate --check`

Expected: zero migrations pendentes.

- [ ] **Step 4: Atualizar documentação local**

Documentar bootstrap de papéis, migration owner, runtime app, execução de testes e recriação segura do ambiente local.

- [ ] **Step 5: Commit**

```powershell
git add backend/pyproject.toml .github/workflows/ci.yml README.md backend/README.md
git commit -m "ci: enforce sprint 0 quality gates"
```

### Task 9: Aceite final e PRD

**Files:**
- Modify: `docs/PRD.md`
- Modify: `docs/CHANGELOG.md`
- Modify: `docs/10_Releases/MILESTONE-001_MANIFEST.txt`

- [ ] **Step 1: Executar gate completo**

Run:

```powershell
python manage.py check
python manage.py makemigrations --check --dry-run
python manage.py migrate --check
ruff check .
mypy .
pytest --cov -v
python manage.py check --deploy --settings=config.settings.production
```

Expected: zero falhas; warnings aceitos precisam estar documentados e não podem enfraquecer isolamento ou segredo.

- [ ] **Step 2: Smoke test real**

Subir PostgreSQL, Redis e Django; validar `/health/`, correlation ID, listagem tenant A, IDOR contra recurso B e ausência de contexto.

- [ ] **Step 3: Atualizar checkboxes por evidência**

Marcar somente itens comprovados. Manter qualquer item parcial aberto com `BLOQUEADO:`. Atualizar registro com hashes reais e contagens reais.

- [ ] **Step 4: Atualizar metadados documentais**

Registrar correção no changelog e regenerar manifesto SHA-256.

- [ ] **Step 5: Commit final**

```powershell
git add docs backend frontend pdv infra .github .env.example README.md
git commit -m "feat: sprint 0 - fundação técnica"
```

- [ ] **Step 6: Verificar repositório limpo**

Run: `git status --short`

Expected: sem alterações; Sprint 0 só pode ser declarada concluída nesse estado.
