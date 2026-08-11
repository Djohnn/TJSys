# Sprint 6 / R6 — Offline Hardening e Sincronização

**Data:** 2026-08-11
**Status:** Encerrada com ressalva aceita

## Escopo validado

- Sincronização unitária do PDV com fallback do lote para processamento por evento.
- Cliente de lote com hashing SHA-256 via import ESM, sem `require()`.
- Tela de pendências e fluxo offline/recuperação cobertos por Playwright.
- Ingestão backend com replay, gap de sequência e hash de envelope inválido.
- Script `npm run typecheck` restrito aos serviços R6 (`syncEngine` e `batchSyncClient`).

## Evidência executada

```text
PDV Vitest:
Test Files  21 passed (21)
Tests       177 passed (177)
Duration    12.37s

PDV E2E R6:
Running 2 tests using 2 workers
2 passed (5.9s)

Backend R6:
......... [100%]
9 passed, 1 warning in 17.74s

PDV typecheck:
> tjsys-pdv@0.1.0 typecheck
> tsc --noEmit -p tsconfig.typecheck.json

PDV lint R6:
All checks passed!

Backend mypy R6:
Success: no issues found in 8 source files

Django migrations/check:
No changes detected
System check identified no issues (0 silenced).
```

## Ressalvas aceitas e débitos separados

- `electron-builder --win` continua dependente de Developer Mode/privilégio
  para links simbólicos do `winCodeSign`; não foi possível emitir o instalador
  neste ambiente sem essa capacidade. Esta é a única ressalva de fechamento da
  R6 e deve ser validada em CI ou Windows com Developer Mode/privilégio.
- Ruff global (28 erros) e mypy global (11 erros em 4 arquivos) permanecem como
  débito técnico fora do escopo R6.
- Alterações e arquivos não versionados de outras frentes permanecem fora do
  release R6 e exigem revisão própria antes de qualquer push global.

## Rollback

Reverter os arquivos listados na revisão da R6; não remover artefatos de outras
frentes sem uma decisão de escopo.
