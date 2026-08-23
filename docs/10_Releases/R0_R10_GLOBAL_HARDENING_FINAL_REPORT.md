# R0-R10 — Relatório Final de Hardening Global

**Data:** 2026-08-17

**Branch de execução:** `codex/r0-r10-global-hardening`

**Base:** `master` em `f0cf2e7`

## Resultado

O backend consolidado de R0-R10 ficou sem falhas na suíte completa, no Ruff,
no formatter, no mypy, no Django check e na verificação de migrations. Nenhuma
refatoração funcional ou feature nova foi iniciada durante este trabalho.

## Divergências resolvidas

- testes legados de vendas passaram a respeitar `reason` obrigatório, lock/reload,
  HTTP `201` nas ações compensatórias e login MFA HTTP `202`;
- o `seed_e2e` permaneceu fail-closed e seus testes passaram a isolar somente a
  execução interna do seed;
- o comando `audit_product_stock_policies`, existente apenas como arquivo não
  rastreado no checkout raiz, foi recuperado e versionado;
- contratos de quantidade normalizada, auditoria/outbox e migrations históricas
  de estoque foram reconciliados;
- produto inexistente nos endpoints de desativação/reativação de estoque agora
  retorna `404`, em vez de propagar `500`;
- o papel PostgreSQL de testes é corrigido para `NOSUPERUSER NOBYPASSRLS
  NOCREATEDB` durante o bootstrap reproduzível;
- a dívida Ruff global foi formatada e os dois erros estruturais de mypy foram
  corrigidos sem ignores por linha.

## Evidência bruta

Baseline antes do hardening:

```text
1849 passed, 64 failed in 1118.32s
Ruff: 474 errors
mypy: 29 errors in 2 files
```

Validações focais:

```text
Sales/auth inicial: 7 passed in 23.25s
Sales legada: 280 passed in 82.82s
Coverage sales/auth: 246 passed in 30.09s
Comandos protegidos: 48 passed in 42.36s
Catálogo/estoque/fiscal: 41 passed in 50.70s
Papéis PostgreSQL: 2 passed in 26.94s
```

Primeiro gate backend global:

```text
1913 passed in 709.55s (0:11:49)
```

Gates estáticos globais:

```text
Success: no issues found in 320 source files
All checks passed!
321 files already formatted
```

Gate backend global após formatação e tipagem:

```text
1913 passed in 717.29s (0:11:57)
```

Validação final após merge na `master` (`0e2b1ec`):

```text
1913 passed in 672.34s (0:11:12)
All checks passed!
321 files already formatted
Success: no issues found in 320 source files
No changes detected
System check identified no issues (0 silenced).
```

Django e migrations com o papel documentado de migration:

```text
No changes detected
System check identified no issues (0 silenced).
```

## Commits da execução

- `5c005a5` — compatibilidade dos contratos sales/auth;
- `8a761ea` — restauração do comando de auditoria de estoque;
- `f17bd10` — reconciliação de catálogo, estoque e fiscal;
- `d4e966c` — papel PostgreSQL de testes restrito;
- `e69a325` — Ruff, formatter e mypy globais.
- `745c76a` — relatório e rastreabilidade dos gates globais;
- `0e2b1ec` — merge do hardening validado na `master`.

## Limites

- O hardening prova o backend consolidado no escopo R0-R10; não altera o estado
  documental de sprints posteriores.
- Nenhum push foi executado.
- Artefatos locais de `graphify-out/` permanecem fora dos commits.
