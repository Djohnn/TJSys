# Sprint 7 / R7 — NFC-e via PlugNotas (Integração Fiscal)

**Data:** 2026-08-11
**Status:** Encerrada com ressalva aceita

## Escopo validado

- App Django `fiscal` com `FiscalProvider` (ABC), `FiscalEmitter`, `FiscalProductConfig` e `FiscalDocument` (state machine com `PENDING/QUEUED/PROCESSING/CONCLUDED/REJECTED/CANCELLED/FAILED`), migrations e isolamento por tenant.
- Adapter `PlugNotasAdapter` com `emit`/`query`/`cancel` no nível do provider.
- **Fluxo assíncrono sob demanda (RF12):** `RequestFiscalView` (`/api/v1/sales/<uuid>/request-fiscal/`) agora cria o documento em estado `QUEUED`, dispara a task Celery `handle_sale_completed.delay(sale_id)` e retorna imediatamente no request HTTP (sem bater no PlugNotas/SEFAZ síncronamente). As tarefas `handle_sale_completed`/`poll_fiscal_document` (Celery) processam a emissão e o polling em background.
- Webhook como gatilho (não fonte de dado): o estado verdadeiro vem de `adapter.query()`, nunca do corpo do POST.
- Frontend não bloqueante: toast pós-venda, impressão Balcão imediata, reimpressão Fiscal só quando autorizado, PDV segue operando independente da emissão.

## Regra de negócio confirmada (fluxo vigente)

A emissão é **sob demanda**. Confirmar uma venda **nunca** emite NFC-e automaticamente:
o handler outbox de `sales.sale.confirmed` para emissão fiscal está **comentado** in `fiscal/tasks.py`; o único ponto ativo de emissão é o endpoint `/request-fiscal/`, acionado por "Imprimir Cupom Fiscal".

## Evidência executada

```text
Backend fiscal (R7):
.......................................... [100%]
42 passed, 0 failed, 1 warning in 34.76s

Django check:
System check identified no issues (0 silenced).

Django migrations:
No changes detected

PDV Vitest:
Test Files  21 passed (21)
Tests       185 passed (185)
Duration    12.80s

PDV typecheck:
tsc --noEmit -p tsconfig.typecheck.json (exit 0)

PDV lint:
146 problems (0 errors, 146 warnings) (exit 0)
```

### Cobertura backend (42 testes de `tests/test_fiscal_*.py`)

- **Novos Testes E2E Assíncronos (`tests/test_fiscal_sprint7_async.py`):**
  - **`test_request_fiscal_async_returns_queued_immediately`** — Retorna 201 with `fiscal_status=QUEUED` sem chamar PlugNotas da request thread.
  - **`test_request_fiscal_async_creates_document_and_enqueues_task`** — Verifica enfileiramento da task Celery.
  - **`test_request_fiscal_async_idempotent_returns_existing`** — Chamadas repetidas sobre a mesma venda não duplicam e retornam o mesmo `FiscalDocument`.
  - **`test_request_fiscal_async_rejected_for_non_confirmed_sale`** — Vendas não confirmadas retornam 400.
  - **`test_request_fiscal_async_handles_missing_sale`** — Vendas inexistentes retornam 404.
- **Outros cenários cobertos:**
  - Estados `PENDING/PROCESSING → CONCLUDED`, `REJECTED` (reattempt) e `FAILED` — cobertos.
  - Timeout (30min) força `FAILED` — `test_poll_timeout_forces_failed`.
  - `MAX_AUTO_REATTEMPTS=2`: no último attempt não reenfileira — `test_max_reatattempt_rejected_does_not_reenqueue`.
  - NCM ausente fornece `FAILED` com `error_detail` claro — `test_emit_fails_clearly_when_ncm_missing`.
  - Emitente ausente fornece `FAILED` — `test_emit_nfce_fails_when_emitter_is_missing`.
  - Webhook não confia no body (consulta provider) — `test_fiscal_webhook_queries_provider_instead_of_trusting_body`.
  - Webhook duplicado é idempotente — `test_duplicate_webhook_is_idempotent`.
  - Isolamento multi-tenant — `test_fiscal_document_isolation_between_tenants`.
  - Sem auto-emissão em `sales.sale.confirmed` — `test_sale_confirmed_outbox_does_not_trigger_automatic_fiscal_emission`.

### Cobertura PDV (185 testes / 21 arquivos)

- Finalizar venda não abre impressão automática nem dispara emissão fiscal (`Sale.test.tsx`).
- Carrinho limpo e estado resetado pós-venda.
- Toast exibe nº da venda + botões Fiscal/Balcão/Fechar, não bloqueante.
- Botão Fiscal desabilitado sem `hasFiscalConfig`.
- "Fechar" apenas oculta o toast, sem efeito colateral.
- Cupom Balcão imprime imediatamente (sem chamada externa), a qualquer momento no histórico.
- Reimpressão Fiscal só quando o `FiscalDocument` está autorizado (com protocolo/chave); PENDING/PROCESSING/REJECTED bloqueia.
- Histórico exibe status pendente/rejeitado.

## Ressalvas aceitas e débitos separados

- **`FiscalProductConfig` ausente não gera `FAILED` na emissão NFC-e.** O código usa defaults CET (`cst_icms=00`, `cst_pis=99`, `cst_cofins=07`, `origem=0`), então o documento segue a `PROCESSING`. Diverge do critério "erro claro para configuração fiscal ausente"; o comportamento real está coberto por teste e aceito como ressalva.
- **`window.electronAPI.requestFiscalReceipt` não implementado no IPC/preload.** O renderer faz `fetch('/api/v1/sales/{id}/request-fiscal/')` direto à API HTTP (atende comportamento de não-bloqueio, diverge da spec de interface).
- **Ruff/mypy globais permanecem com débitos técnicos.** Pendentes 28 erros de Ruff e 11 erros de mypy herdados em diretórios do master fora de `fiscal/` (`accounts`, `catalog`, `inventory`). Os gates de Ruff/mypy focados no app `fiscal` passaram com 100% de sucesso (0 erros).

## Rollback

Reverter os arquivos listados na revisão da R7 (incluindo `backend/tests/test_fiscal_sprint7_state.py` e `test_fiscal_sprint7_async.py`); não remover artefatos de outras frentes sem uma decisão de escopo.
