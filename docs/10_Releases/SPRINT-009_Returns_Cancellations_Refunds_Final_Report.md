# Sprint 9 — Devoluções, Cancelamentos e Estornos — Relatório Final

**Data do fechamento:** 2026-08-13
**Base:** `e7a0a8a` (`codex/r8-finalization`)
**Branch de auditoria:** `codex/r9-finalization`
**Design aprovado:** [R9 — Auditoria e Fechamento do Pós-venda](../superpowers/specs/2026-08-12-r9-finalization-audit-design.md)
**Plano de auditoria:** [R9 Finalization Audit Implementation Plan](../superpowers/plans/2026-08-12-r9-finalization-audit-implementation-plan.md), Task 9, linhas 370–408

## Resultado executivo

A auditoria fecha a implementação técnica da R9 com os gates obrigatórios
comprovados nesta branch. Devoluções, reembolsos e cancelamentos são fatos
compensatórios idempotentes, auditáveis, concorrentes de forma segura e
isolados por tenant. A venda confirmada permanece imutável.

O fechamento não transforma limitações ambientais em sucesso: o banco
compartilhado local não foi migrado, o deploy check depende de secrets e os
artefatos locais `frontend/playwright-report/index.html` e `graphify-out/`
permanecem externos e não versionados. O banco isolado `test_tjsys` passou a
validação de migration; o banco compartilhado preexistente não foi alterado.

## Entregas e decisões confirmadas

### Domínio e transações

- `SaleReturn`, `SaleReturnItem`, `SaleRefund` e `SaleCancellation` representam
  fatos compensatórios próprios; a venda original não é apagada nem reescrita.
- `reason` é obrigatório nos comandos de retorno, reembolso e cancelamento,
  com validação de tamanho e persistência no fato, auditoria e Outbox.
- Toda operação mutável exige `Idempotency-Key`. Replay com chave e payload
  equivalentes retorna o mesmo fato; a mesma chave com payload diferente produz
  conflito estável. Replays legados só são aceitos quando semanticamente
  equivalentes ao fato persistido.
- Retornos parciais ou totais calculam o saldo líquido devolvível, rejeitam
  quantidade não positiva ou acima do saldo e usam locks para impedir duplicação
  por concorrência.
- Reembolsos e cancelamentos estão dentro de `transaction.atomic`; falha em
  estoque, caixa, auditoria ou Outbox faz rollback integral, sem efeitos
  parciais.

### Reembolsos, caixa e sessão

- `cash` exige a sessão de caixa original aberta e cria exatamente um
  `cash_out` associado à sessão e ao reembolso.
- `pix` e `card_external` criam o registro operacional rastreável sem movimentar
  o dinheiro físico do caixa.
- Valor ausente significa saldo restante; valor não positivo ou superior ao
  saldo reembolsável é rejeitado. Reembolsos concorrentes são serializados por
  venda e sessão.
- O cancelamento comercial cria os reembolsos compensatórios necessários por
  método de pagamento, sem duplicar fatos já existentes.

### Cancelamento comercial e política fiscal

- O cancelamento é uma ação comercial da venda; bloqueia venda já cancelada,
  venda não confirmada e venda incompatível com retornos já concluídos.
- O cancelamento comercial **não cancela documento fiscal automaticamente** e
  não chama o domínio fiscal. Cancelamento fiscal permanece manual/on-demand,
  solicitado pelo operador quando aplicável.

### RLS, contratos e API

- A migration de RLS cobre os fatos compensatórios de `sales`; o isolamento
  cross-tenant é aplicado no serviço e na API. Recurso de outro tenant é
  indistinguível de inexistente.
- As ações são expostas na `SaleViewSet` com Problem Details, autenticação,
  tenant ativo, capability e `Idempotency-Key` obrigatórios.
- A rota real de reembolso é `POST /api/v1/sales/{id}/refund/`.
- A compatibilidade de devoluções é preservada em
  `POST /api/v1/sales/{id}/returns/` e
  `GET /api/v1/sales/{id}/returns/`; cancelamento permanece em
  `POST /api/v1/sales/{id}/cancel/`.
- O contrato de retorno usa `sale_item_id`, não um identificador de produto
  ambíguo. Erros de validação, autorização, inexistência e conflito preservam
  status e códigos Problem Details estáveis.

### Frontend, persistência e 404

- `ReturnDialog` envia `sale_item_id`, `quantity`, `reason` e
  `Idempotency-Key` para `/returns/`; `RefundDialog` usa a rota real
  `/refund/` e envia método, valor opcional, motivo e chave idempotente.
- O E2E confirma resposta real `201` com identificadores e consulta posterior
  em `/returns/`, provando que o retorno foi persistido no banco; não há mock do
  endpoint principal.
- A superfície administrativa mantém estados de erro, incluindo o estado 404
  com correlation ID, sem converter recurso inexistente em sucesso.

### E2E, CI, seed e atomicidade

- O seed E2E é fail-closed, idempotente e abrangido por transação; preserva
  exatamente as linhas de recovery esperadas e impõe limite de gerações.
- O CI aguarda o backend por health check antes do Playwright e fornece
  `E2E_SEED=1`; a validação de configuração remove a dependência YAML implícita.
- A jornada R9 consome códigos somente em Chromium. Firefox e WebKit são
  deliberadamente skipped para não consumir recovery codes.

## Commits corretivos confirmados desde `e7a0a8a`

Lista obtida por `git log --oneline e7a0a8a..HEAD` antes do commit documental:

```text
dcfcd07 test(r9): isolate compensation event effects
eb9cb27 test(r9): scope refund cash snapshots
32d68bf test(r9): prove compensation atomicity
85ff057 test(ci): remove implicit yaml dependency
7892760 fix(ci): gate E2E backend readiness
3d199b2 test(e2e): cover seed safety and ci contract
dd68fcf fix(e2e): harden R9 seed safety
233772f fix(e2e): close R9 conformity gaps
a43c7a3 test(e2e): finalize R9 return journey
0aec670 fix(r9): align sales compensation dialogs
220d1c5 fix: tighten R9 command validation
f9267f7 fix: close R9 sales compensation API
f0254cf fix: harden commercial sale cancellation
54a8c40 fix(sales): replay refunds after cancellation
e978c9c fix(r9): enforce sales tenant isolation
c7ebdee fix(r9): bound concurrent refunds
5299934 fix(r9): validate semantic return replays
4861b29 fix(r9): validate return item totals
804010b fix(r9): replay raw legacy return hashes
a20bba2 fix(r9): preserve return replay hashes
ae2e6b1 fix(r9): serialize sale returns
13002e2 test(r9): verify refund reason migration
3dc28fe feat(r9): record refund reason
27987f6 docs(r9): add finalization plan
5069309 docs(r9): define finalization audit
```

## Verificação — outputs brutos atuais

Os resultados abaixo substituem integralmente a evidência histórica incompleta;
somente as execuções atuais desta branch são consideradas para o aceite.

### Fault injection e schema novo

```text
Fault injection Task8 RED: 3 failed in 17.58s
Fault injection Task8 GREEN: 3 passed in 18.09s
Suíte focada schema-new: 107 passed in 73.28s
```

O RED é a evidência intencional de que os testes detectaram efeitos parciais
antes da correção; o GREEN confirma rollback/atomicidade após a correção.

### Backend global e qualidade estática

```text
Pytest global: 815 passed in 490.82s (0:08:10)
Coverage: 81.47%
Exit code: 0

Ruff:
All checks passed!

mypy:
Success: no issues found in 297 source files

makemigrations --check --dry-run:
No changes detected

Django check:
System check identified no issues (0 silenced).
Exit code: 0
```

### Migration e deploy

```text
Migration isolada (test_tjsys): 1 passed in 20.48s
migrate --check: exit 0

Deploy check sem ambiente:
falhou por MFA_ENCRYPTION_KEY ausente

Deploy check com MFA_ENCRYPTION_KEY dummy efêmera:
exit 0, apenas warnings
```

O resultado sem ambiente é falha de pré-condição, não falha funcional da R9;
produção exige o secret real fornecido externamente. O banco compartilhado
local possui migrations pendentes preexistentes e não foi migrado nem alterado.

### Frontend e E2E

```text
Frontend:
Tests 337 passed (337)
Lint: exit 0, 0 errors, 4 warnings preexistentes
Typecheck: exit 0
Build: exit 0

Playwright R9:
1 passed (4.5s)

Firefox + WebKit:
18 skipped, EXIT=0

Chromium completo:
9 passed (22.6s), EXIT=0
```

### Rechecks adicionais da Task 8 após reviews

```text
Refunds: 29 passed in 26.15s
Cancelamentos: 19 passed in 36.44s
Focados: 3 passed in 20.39s
```

## Definition of Done

- [x] Retorno, reembolso e cancelamento cobertos por serviço, API,
      concorrência, rollback e E2E.
- [x] Mesma chave e payload produzem um único fato; payload diferente produz
      conflito estável.
- [x] Estoque, caixa, auditoria e Outbox têm efeitos exatos e rollback integral.
- [x] Cross-tenant permanece indistinguível de inexistente.
- [x] A UI usa `/returns/`, `sale_item_id` e o endpoint real `/refund/`.
- [x] Cancelamento comercial não chama nem cancela o domínio fiscal
      automaticamente.
- [x] Suítes globais, Ruff, mypy, migrations isoladas, Django checks,
      frontend, typecheck, build e E2E comprovados pelos outputs acima.
- [x] Relatório final contém evidência atual e limitações reais; o baseline
      antigo não é usado como evidência.
- [x] Commit documental isolado em `codex/r9-finalization`, sem push.

## Riscos e ressalvas

- O banco compartilhado local não foi migrado; a validação de schema/migration
  foi feita em `test_tjsys`, que passou, e o banco compartilhado preexistente
  foi preservado.
- O deploy check exige `MFA_ENCRYPTION_KEY`; sem a variável falha por
  configuração ausente. Com chave dummy efêmera passou com warnings.
- `frontend/playwright-report/index.html` e `graphify-out/` são artefatos
  externos/locais, mantidos fora do commit documental.
- Nenhum push foi realizado.

## Decisão final

Com os gates obrigatórios comprovados e as ressalvas ambientais explicitadas,
a R9 está tecnicamente concluída e apta a avançar para a R10. A política
fiscal continua manual/on-demand; não há autorização implícita para cancelar
NFC-e a partir do cancelamento comercial.
