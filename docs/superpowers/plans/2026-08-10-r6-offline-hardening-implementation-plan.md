# R6 Offline Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Remediar a contingência offline existente para cumprir a norma de 16/07 sem apagar journals legados, permitir abertura/fechamento offline ou resolver conflitos no PDV.

**Architecture:** O PDV usará journal SQLite v3 append-only e projeções derivadas. O backend receberá envelopes idempotentes de até 50 eventos em `/api/v1/pdv/sync-batches/`, validará tenant/dispositivo/sequência e retornará resultado por evento; conflitos ficarão auditáveis para resolução web. A migração v2 será lockada, WAL-aware, transacional, faseada e recuperável.

**Tech Stack:** Electron/TypeScript, better-sqlite3/WAL, React/IPC, Django/DRF, PostgreSQL, pytest, Vitest e Playwright.

**Norma:** commit `4ec4601`, blob `464b85d84f015825e7af079d5f8db3c9961f5220`.

---

### Task 1: Journal v3, migração e invariantes

**Files:** `pdv/src/main/services/journalV3.ts`, `journalMigration.ts`, `operationJournal.ts`, `pdv/src/main/services/__tests__/journalMigration.test.ts`.

- [ ] **Step 1:** Escrever testes BDD falhos para journal inexistente, legado íntegro, WAL pendente, queda em cada fase, retry, payload corrompido e evento sem tenant/device/ordenação.
- [ ] **Step 2:** Implementar eventos com `event_id`, `device_id`, `tenant_id`, `branch_id`, `cash_session_id`, `operator_id`, `local_sequence`, `event_type`, `event_version`, `idempotency_key`, `occurred_at`, `payload` e `payload_hash`. Separar `offline_events` imutável de `offline_event_projection` mutável; produção nunca executará `UPDATE`/`DELETE` no evento.
- [ ] **Step 3:** Implementar lock exclusivo, `busy_timeout`, checkpoint WAL sob lock, backup de `.db`, `-wal` e `-shm`, fases `backup_created`, `schema_created`, `rows_copied`, `validated`, `activated` e retry idempotente após queda.
- [ ] **Step 4:** Mapear `sale:create` somente com campos mínimos e identidade; preservar `cash-session:*` como legado incompatível; eventos sem identidade vão para `migration_review`, exportação administrativa e bloqueio de novas conclusões financeiras.
- [ ] **Step 5:** Rodar `npm.cmd exec vitest run src/main/services/__tests__/journalMigration.test.ts`, `git diff --check`, adicionar os arquivos da Task 1 e commitar `feat(r6): add recoverable offline journal migration`.

### Task 2: Política de contingência e pagamentos

**Files:** `pdv/src/main/services/contingencyPolicy.ts`, `offlineSaleService.ts`, testes correspondentes, `pdv/src/main/ipc/sale.ts`, `cash-session.ts`.

- [ ] **Step 1:** Testar caixa previamente aberto, operador autenticado, dispositivo não revogado, produto em cache, preço com até 24h, janela offline até 2h e bloqueio fail-closed após retrocesso/âncora ausente.
- [ ] **Step 2:** Persistir `server_time`, `client_wall_time`, `last_online_at` e monotonicidade; após reinício, retrocesso ou âncora inválida bloquear nova venda offline.
- [ ] **Step 3:** Aceitar apenas `cash`, `card_external_confirmed` e `pix_external_confirmed`; dinheiro permite troco; cartão/Pix exigem valor exato e confirmação externa auditada.
- [ ] **Step 4:** Remover `cash-session:open/close` da fila de contingência; caixa e operador precisam existir antes da queda.
- [ ] **Step 5:** Rodar testes focados e `npm.cmd test`; commitar `feat(r6): enforce restricted offline contingency`.

### Task 3: Backend batch e conflitos auditáveis

**Files:** criar `backend/pdv/` com `models.py`, `serializers.py`, `services/sync_batches.py`, `views.py`, `urls.py`, migration e testes; alterar `backend/config/settings/base.py` e `config/urls.py`.

- [ ] **Step 1:** Escrever testes falhos para batch vazio/1/50/acima de 50, tenant/device inválidos, sequência duplicada/lacuna, replay idêntico, payload divergente, hash, estoque insuficiente, preço válido e conflito.
- [ ] **Step 2:** Criar `PDVSyncBatch`, `PDVSyncEvent`, `PDVSyncConflict` com unicidades de `event_id` por dispositivo, `(device, local_sequence)`, `idempotency_key` por tenant/dispositivo e `batch_hash`.
- [ ] **Step 3:** Canonicalizar JSON UTF-8 com chaves ordenadas, números decimais canônicos e timestamps UTC; calcular SHA-256 hexadecimal minúsculo.
- [ ] **Step 4:** Persistir o envelope atomicamente, processar eventos em ordem e registrar resultado individual. Conflitos não descartam eventos; lacuna/ordem inválida bloqueia avanço automático; replay idêntico retorna resultado salvo; hash divergente nunca reaplica efeitos.
- [ ] **Step 5:** Converter `offline.sale.completed` para o comando de venda; estoque insuficiente vira `conflict_requires_review`; snapshot dentro de 24h é honrado e auditado.
- [ ] **Step 6:** Rodar `python manage.py check`, migrations e `python -m pytest tests/test_pdv_sync_batches.py -q --no-cov`; commitar `feat(r6): add PDV offline batch sync backend`.

### Task 4: Cliente batch, pendências e reconexão

**Files:** modificar `pdv/src/main/services/syncEngine.ts`, `conflictResolver.ts`, `operationJournal.ts`, `pdv/src/main/ipc/sync.ts`; criar `batchSyncClient.ts`, testes, `pdv/src/renderer/pages/SyncPending.tsx` e rotas UI.

- [ ] **Step 1:** Testar máximo 50, backoff limitado, sync automático/manual, status por evento e conflito preservado.
- [ ] **Step 2:** Selecionar até 50 eventos, montar intervalo/hash/metadados, chamar `/api/v1/pdv/sync-batches/` e atualizar apenas projeções; nunca resolver conflito localmente.
- [ ] **Step 3:** Exibir `pending`, `syncing`, `synced`, `failed`, `conflict_requires_review`, sequência, valor, método, idade, erro e orientação para o backend.
- [ ] **Step 4:** Rodar `npm.cmd test` e `npm.cmd run typecheck`; commitar `feat(r6): sync offline events in bounded batches`.

### Task 5: E2E, caos e regressão

**Files:** criar `pdv/e2e/r6-offline-hardening.spec.ts`, `backend/tests/test_pdv_sync_chaos.py`; alterar CI e relatório R6.

- [ ] **Step 1:** E2E dos bloqueios: venda permitida, caixa fechado, preço vencido, limite de 2h, pagamentos externos, pendências e conflito visível.
- [ ] **Step 2:** Interromper gravação, reiniciar, confirmar journal preservado, replay idempotente e ausência de truncamento.
- [ ] **Step 3:** Executar `npm.cmd test`, typecheck, build, E2E mock, `manage.py check`, migrations e os testes backend de batch/caos.
- [ ] **Step 4:** Rodar `git diff --check` e commitar `docs(r6): record offline hardening acceptance`.

Critério de saída: nenhum evento financeiro sem identidade sincroniza silenciosamente; nenhuma abertura/fechamento offline; batch/idempotência/conflitos auditáveis; regressão R5 verde; fiscal/TEF fora do escopo.
