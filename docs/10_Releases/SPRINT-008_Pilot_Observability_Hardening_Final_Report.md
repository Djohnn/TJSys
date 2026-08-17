# Sprint 8 — Piloto, Observabilidade e Hardening — Relatório Final

Data da revisão: 2026-08-12

## Resumo

O fechamento técnico da R8 foi aprovado. Os gates globais estão verdes, o
smoke exige autenticação real, métricas fiscais são globais, o reset de
métricas está protegido e o backup/restore foi validado em banco descartável.

A decisão de iniciar o piloto permanece um gate operacional humano separado:
o checklist ainda exige cadastro das lojas, credenciais fiscais reais,
monitoramento externo, segurança/compliance e assinaturas.

## Evidências

### Health, readiness e smoke autenticado

```text
PASS Health - HTTP 200
PASS Readiness - HTTP 200
PASS Metrics - HTTP 200
PASS Companies API - HTTP 200
PASS Products API - HTTP 200
PASS Inventory Locations API - HTTP 200
PASS Sales API - HTTP 200
PASS Fiscal Documents API - HTTP 200
Smoke summary: 8 passed, 0 failed
```

Readiness também foi validado em cenários negativos de banco e cache, ambos
retornando `503` e `X-Correlation-ID`.

### Backup e restore

```text
Running pg_dump for tjsys on 127.0.0.1:5433...
Backup completed: ...\tjsys_20260812_174300.dump
SHA256: 10E67960BBCECD678248BE10471137CCAEC906349917050AB9620E6DD563B098
WARNING: Accepted only the known transaction_timeout compatibility warning
All verification checks passed
```

O backup usa formato custom e compressão nativa do `pg_dump`, sem dependência
de `gzip`. O restore verifica SHA-256, tabelas críticas, consultas e índices;
qualquer erro fora da allowlist exata falha o processo. O banco descartável foi
removido ao final.

### Backend

```text
734 passed in 371.26s (0:06:11)
All checks passed!
Success: no issues found in 293 source files
No changes detected
System check identified no issues (0 silenced).
```

### PDV

```text
Test Files  21 passed (21)
Tests       182 passed (182)
Duration    10.29s
typecheck: exit 0
lint: 0 errors (warnings preexistentes)
build: main, preload e renderer gerados
```

### Frontend

```text
Test Files  22 passed (22)
Tests       328 passed (328)
Duration    21.61s
typecheck: exit 0
lint: 0 errors (4 warnings)
build: exit 0
```

### Scripts operacionais

```text
4 passed in 0.08s
```

## Checklist de piloto

O checklist está em
[`PILOT_READINESS_CHECKLIST.md`](../09_Operations/PILOT_READINESS_CHECKLIST.md).
Itens técnicos comprovados nesta revisão estão marcados com evidência. Itens
que dependem do ambiente real ou de aprovação humana permanecem abertos.

## Status

**Status técnico:** APROVADO.

**Status da Sprint 8:** CONCLUÍDA para desenvolvimento e QA.

**Piloto em produção:** PENDENTE de checklist operacional e sign-offs; este
relatório não substitui a decisão humana de GO/NO-GO.
