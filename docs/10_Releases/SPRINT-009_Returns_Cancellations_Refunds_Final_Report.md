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

`git log --oneline e7a0a8a..HEAD` foi confirmado; a saída inclui commits
documentais desta auditoria, que não pertencem à lista corretiva abaixo. A
lista contém 25 commits ancestrais de implementação/auditoria do `HEAD` (23 de
código/testes e 2 preparatórios de design/plano); os commits documentais de
fechamento são contabilizados separadamente no histórico, sem serem tratados
como correções de produto. `e60f06c` foi
inspecionado, mas não é ancestral do `HEAD`, não pertence a branch local e não
tem patch-id equivalente no range; portanto não é listado como entrega desta
branch.

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

## Verificação — comandos, outputs, durações e exit codes

Os resultados abaixo substituem integralmente o baseline histórico. Cada gate
registra o comando executado, o diretório de trabalho, a saída relevante, a
duração observada e o `EXIT` real. Nenhum log adicional foi versionado.

### Fault injection Task 8 e schema novo

`cwd=C:\ERP\.worktrees\r9-finalization\backend`.

Comando RED e GREEN (os mesmos três testes de atomicidade, executados antes e
depois da correção):

```powershell
C:\ERP\.venv\Scripts\python.exe -m pytest tests/test_sales_returns_services.py::TestSaleReturnService::test_outbox_failure_rolls_back_return_stock_and_events tests/test_sales_refunds_services.py::TestSaleRefundService::test_outbox_failure_rolls_back_refund_cash_and_events tests/test_sales_cancellations_services.py::TestSaleCancellationService::test_outbox_failure_rolls_back_cancellation_stock_cash_and_events -q --no-cov
```

Output RED:

```text
3 failed in 17.58s
EXIT=1
```

Output GREEN:

```text
3 passed in 18.09s
EXIT=0
```

O RED é intencional e prova que os testes detectavam efeitos parciais antes da
correção; o GREEN confirma rollback/atomicidade após a correção.

Comando schema-new:

```powershell
C:\ERP\.venv\Scripts\python.exe -m pytest tests/test_sales_returns_models.py tests/test_sales_returns_services.py tests/test_sales_refunds_services.py tests/test_sales_cancellations_services.py tests/test_sales_compensation_concurrency.py tests/test_sales_returns_api.py -q --no-cov --create-db
```

Output: `107 passed in 73.28s`; `EXIT=0`.

### Backend global e qualidade estática

Comando backend global (`cwd=...\backend`):

```powershell
C:\ERP\.venv\Scripts\python.exe -m pytest -q
```

Output: `815 passed in 490.82s (0:08:10)`; coverage `81.47%`; `EXIT=0`.

Ruff:

```powershell
$sw = [Diagnostics.Stopwatch]::StartNew(); $out = & C:\ERP\.venv\Scripts\ruff.exe check . 2>&1; $exit = $LASTEXITCODE; $sw.Stop(); $out; Write-Output ('DURATION=' + [math]::Round($sw.Elapsed.TotalSeconds, 2) + 's'); Write-Output ('EXIT=' + $exit); exit $exit
```

Output: `All checks passed!`; `DURATION=0.09s`; `EXIT=0`.

mypy:

```powershell
$sw = [Diagnostics.Stopwatch]::StartNew(); $out = & C:\ERP\.venv\Scripts\mypy.exe . 2>&1; $exit = $LASTEXITCODE; $sw.Stop(); $out; Write-Output ('DURATION=' + [math]::Round($sw.Elapsed.TotalSeconds, 2) + 's'); Write-Output ('EXIT=' + $exit); exit $exit
```

Output relevante: notas informativas do mypy em três pontos; `Success: no
issues found in 297 source files`; `DURATION=2.58s`; `EXIT=0`.

Migrations declarativas:

```powershell
$sw = [Diagnostics.Stopwatch]::StartNew(); $out = & C:\ERP\.venv\Scripts\python.exe manage.py makemigrations --check --dry-run 2>&1; $exit = $LASTEXITCODE; $sw.Stop(); $out; Write-Output ('DURATION=' + [math]::Round($sw.Elapsed.TotalSeconds, 2) + 's'); Write-Output ('EXIT=' + $exit); exit $exit
```

Output: `No changes detected`; houve também `RuntimeWarning` de falha de
autenticação no banco compartilhado; `DURATION=2.81s`; `EXIT=0`. Isso não
prova o estado do banco compartilhado.

Django check:

```powershell
$sw = [Diagnostics.Stopwatch]::StartNew(); $out = & C:\ERP\.venv\Scripts\python.exe manage.py check 2>&1; $exit = $LASTEXITCODE; $sw.Stop(); $out; Write-Output ('DURATION=' + [math]::Round($sw.Elapsed.TotalSeconds, 2) + 's'); Write-Output ('EXIT=' + $exit); exit $exit
```

Output: `System check identified no issues (0 silenced)`; `DURATION=1.99s`;
`EXIT=0`.

### Migration isolada e migrate --check

Teste isolado (`test_tjsys`, `cwd=...\backend`):

```powershell
$sw = [Diagnostics.Stopwatch]::StartNew(); $out = & C:\ERP\.venv\Scripts\python.exe -m pytest tests/test_sales_refund_migrations.py::test_refund_reason_migration_backfills_legacy_refunds -q --no-cov 2>&1; $exit = $LASTEXITCODE; $sw.Stop(); $out; Write-Output ('DURATION=' + [math]::Round($sw.Elapsed.TotalSeconds, 2) + 's'); Write-Output ('EXIT=' + $exit); exit $exit
```

Output atual: `1 passed in 25.33s`; `DURATION=28.97s`; `EXIT=0`. O alvo
retrocede para `sales 0004_sale_customer`, aplica `0005_salerefund_reason` e
valida o backfill de `reason`; o fixture reseta somente o banco cujo nome é de
teste.

Gate de verificação de migrations no alvo correto (`config.settings.test`):

```powershell
$env:POSTGRES_DB='test_tjsys'; $env:POSTGRES_TEST_DB='test_tjsys'; $sw=[Diagnostics.Stopwatch]::StartNew(); & C:\ERP\.venv\Scripts\python.exe manage.py migrate --check --settings=config.settings.test; $exit=$LASTEXITCODE; $sw.Stop(); Write-Output ('DURATION=' + [math]::Round($sw.Elapsed.TotalSeconds, 2) + 's'); Write-Output ('EXIT=' + $exit); Remove-Item Env:POSTGRES_DB,Env:POSTGRES_TEST_DB; exit $exit
```

Pré-condição: `POSTGRES_DB` e `POSTGRES_TEST_DB` foram alinhados a
`test_tjsys`; host/porta efetivos `127.0.0.1:5433`; credenciais vieram de
`POSTGRES_TEST_USER`/`POSTGRES_TEST_PASSWORD` e defaults, sem serem impressas.
O teste de backfill acima deixa o banco isolado em `sales.0005`; por isso foi
reaplicada somente a migration pendente no banco de teste:

```powershell
$env:POSTGRES_DB='test_tjsys'; $env:POSTGRES_TEST_DB='test_tjsys'; $sw=[Diagnostics.Stopwatch]::StartNew(); $out = & C:\ERP\.venv\Scripts\python.exe manage.py migrate --settings=config.settings.test 2>&1; $exit=$LASTEXITCODE; $sw.Stop(); $out; Write-Output ('DURATION=' + [math]::Round($sw.Elapsed.TotalSeconds, 2) + 's'); Write-Output ('EXIT=' + $exit); Remove-Item Env:POSTGRES_DB,Env:POSTGRES_TEST_DB; exit $exit
```

Output: `Applying sales.0006_enable_sales_rls... OK`; `DURATION=2.42s`;
`EXIT=0`.

Output do `migrate --check`: vazio; `DURATION=2.28s`; `EXIT=0`. A tentativa
anterior com `config.settings.migration` sem o alvo TEST não é este gate e
retornou `EXIT=1`; sem overrides, o default `tjsys_test` também falha por
permissão. O banco compartilhado não foi migrado nem alterado.

### Deploy check

Sem ambiente (segredo não exposto):

```powershell
$sw = [Diagnostics.Stopwatch]::StartNew(); $out = & C:\ERP\.venv\Scripts\python.exe manage.py check --deploy --settings=config.settings.production 2>&1; $exit = $LASTEXITCODE; $sw.Stop(); $out; Write-Output ('DURATION=' + [math]::Round($sw.Elapsed.TotalSeconds, 2) + 's'); Write-Output ('EXIT=' + $exit); exit $exit
```

Output relevante: `decouple.UndefinedValueError: MFA_ENCRYPTION_KEY not found`;
`DURATION=0.37s`; `EXIT=1`. Isso é falha da pré-condição ambiental.

Com ambiente dummy efêmero (o comando real gerou `MFA_ENCRYPTION_KEY` em
memória com `Fernet.generate_key()`, usou placeholders para os demais secrets
e removeu todas as variáveis ao final):

```powershell
$env:SECRET_KEY='<dummy>'; $env:MFA_ENCRYPTION_KEY=(& C:\ERP\.venv\Scripts\python.exe -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())").Trim(); $env:POSTGRES_DB='<dummy>'; $env:POSTGRES_APP_USER='<dummy>'; $env:POSTGRES_APP_PASSWORD='<dummy>'; $env:POSTGRES_HOST='127.0.0.1'; $env:POSTGRES_PORT='5433'; $env:REDIS_URL='redis://127.0.0.1:6380/0'; $env:CELERY_BROKER_URL='redis://127.0.0.1:6380/1'; $env:CELERY_RESULT_BACKEND='redis://127.0.0.1:6380/2'; $env:EMAIL_HOST='127.0.0.1'; $env:EMAIL_HOST_USER='<dummy>'; $env:EMAIL_HOST_PASSWORD='<dummy>'; $env:ALLOWED_HOSTS='localhost'; $sw = [Diagnostics.Stopwatch]::StartNew(); $out = & C:\ERP\.venv\Scripts\python.exe manage.py check --deploy --settings=config.settings.production 2>&1; $exit = $LASTEXITCODE; $sw.Stop(); Remove-Item Env:SECRET_KEY,Env:MFA_ENCRYPTION_KEY,Env:POSTGRES_DB,Env:POSTGRES_APP_USER,Env:POSTGRES_APP_PASSWORD,Env:POSTGRES_HOST,Env:POSTGRES_PORT,Env:REDIS_URL,Env:CELERY_BROKER_URL,Env:CELERY_RESULT_BACKEND,Env:EMAIL_HOST,Env:EMAIL_HOST_USER,Env:EMAIL_HOST_PASSWORD,Env:ALLOWED_HOSTS; $out; Write-Output ('DURATION=' + [math]::Round($sw.Elapsed.TotalSeconds, 2) + 's'); Write-Output ('EXIT=' + $exit); exit $exit
```

Output: `System check identified 229 issues (0 silenced)` (warnings do
exist); `DURATION=2.2s`; `EXIT=0`. Isso prova somente a inicialização com
pré-condições sintéticas, não o deploy com secrets reais.

### Frontend

Todos os comandos abaixo foram executados em
`C:\ERP\.worktrees\r9-finalization\frontend`.

Testes:

```powershell
$sw = [Diagnostics.Stopwatch]::StartNew(); $out = & npm.cmd test -- --run 2>&1; $exit = $LASTEXITCODE; $sw.Stop(); $out; Write-Output ('DURATION=' + [math]::Round($sw.Elapsed.TotalSeconds, 2) + 's'); Write-Output ('EXIT=' + $exit); exit $exit
```

Output: `Test Files 22 passed (22)`, `Tests 337 passed (337)`, Vitest
`Duration 22.47s`; wrapper `DURATION=26.07s`; `EXIT=0`. Um teste de estado
de erro imprimiu stack de `Error: test error` no jsdom, mas não produziu falha
do runner.

Lint:

```powershell
$sw = [Diagnostics.Stopwatch]::StartNew(); $out = & npm.cmd run lint 2>&1; $exit = $LASTEXITCODE; $sw.Stop(); $out; Write-Output ('DURATION=' + [math]::Round($sw.Elapsed.TotalSeconds, 2) + 's'); Write-Output ('EXIT=' + $exit); exit $exit
```

Output: `✖ 4 problems (0 errors, 4 warnings)` em `PersonForm.tsx`,
`PurchaseOrderEditor.tsx` e `ReceiptForm.tsx`; `DURATION=15.79s`; `EXIT=0`.
São os warnings preexistentes de React Hooks/React Compiler registrados no
runner.

Typecheck:

```powershell
$sw = [Diagnostics.Stopwatch]::StartNew(); $out = & npm.cmd run typecheck 2>&1; $exit = $LASTEXITCODE; $sw.Stop(); $out; Write-Output ('DURATION=' + [math]::Round($sw.Elapsed.TotalSeconds, 2) + 's'); Write-Output ('EXIT=' + $exit); exit $exit
```

Output: `tsc --noEmit`; `DURATION=13.06s`; `EXIT=0`.

Build:

```powershell
$sw = [Diagnostics.Stopwatch]::StartNew(); $out = & npm.cmd run build 2>&1; $exit = $LASTEXITCODE; $sw.Stop(); $out; Write-Output ('DURATION=' + [math]::Round($sw.Elapsed.TotalSeconds, 2) + 's'); Write-Output ('EXIT=' + $exit); exit $exit
```

Output: `209 modules transformed`, `built in 3.42s`, warning de chunk acima
de 250 kB; wrapper `DURATION=14.87s`; `EXIT=0`.

### E2E

R9 focado (`cwd=...\frontend`):

```powershell
npm.cmd exec playwright test e2e/pdv-management-financial.spec.ts -- --project=chromium --grep "R9"
```

Output: `1 passed (4.5s)`; `EXIT=0`.

Chromium completo:

```powershell
npm.cmd exec playwright test e2e/pdv-management-financial.spec.ts -- --project=chromium
```

Output: `9 passed (22.6s)`; `EXIT=0`.

Firefox/WebKit foram executados separadamente para preservar os recovery
codes:

```powershell
$sw = [Diagnostics.Stopwatch]::StartNew(); $out = & npm.cmd exec playwright test e2e/pdv-management-financial.spec.ts -- --project=firefox --project=webkit 2>&1; $exit = $LASTEXITCODE; $sw.Stop(); $out; Write-Output ('DURATION=' + [math]::Round($sw.Elapsed.TotalSeconds, 2) + 's'); Write-Output ('EXIT=' + $exit); exit $exit
```

Output: `Running 18 tests using 6 workers`, `18 skipped`; `DURATION=11.72s`;
`EXIT=0`. O skip foi deliberado e não consumiu códigos.

### Rechecks adicionais da Task 8 após reviews

Refunds (`cwd=...\backend`):

```powershell
$sw = [Diagnostics.Stopwatch]::StartNew(); $out = & C:\ERP\.venv\Scripts\python.exe -m pytest tests/test_sales_refunds_services.py -q --no-cov 2>&1; $exit = $LASTEXITCODE; $sw.Stop(); $out; Write-Output ('DURATION=' + [math]::Round($sw.Elapsed.TotalSeconds, 2) + 's'); Write-Output ('EXIT=' + $exit); exit $exit
```

Output: `29 passed in 34.15s`; wrapper `DURATION=42.93s`; `EXIT=0`.

Cancelamentos:

```powershell
$sw = [Diagnostics.Stopwatch]::StartNew(); $out = & C:\ERP\.venv\Scripts\python.exe -m pytest tests/test_sales_cancellations_services.py -q --no-cov 2>&1; $exit = $LASTEXITCODE; $sw.Stop(); $out; Write-Output ('DURATION=' + [math]::Round($sw.Elapsed.TotalSeconds, 2) + 's'); Write-Output ('EXIT=' + $exit); exit $exit
```

Output: `19 passed in 37.37s`; wrapper `DURATION=40.15s`; `EXIT=0`.

Focados de fault injection:

```powershell
$sw = [Diagnostics.Stopwatch]::StartNew(); $out = & C:\ERP\.venv\Scripts\python.exe -m pytest tests/test_sales_returns_services.py::TestSaleReturnService::test_outbox_failure_rolls_back_return_stock_and_events tests/test_sales_refunds_services.py::TestSaleRefundService::test_outbox_failure_rolls_back_refund_cash_and_events tests/test_sales_cancellations_services.py::TestSaleCancellationService::test_outbox_failure_rolls_back_cancellation_stock_cash_and_events -q --no-cov 2>&1; $exit = $LASTEXITCODE; $sw.Stop(); $out; Write-Output ('DURATION=' + [math]::Round($sw.Elapsed.TotalSeconds, 2) + 's'); Write-Output ('EXIT=' + $exit); exit $exit
```

Output: `3 passed in 25.13s`; wrapper `DURATION=28.37s`; `EXIT=0`.

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
- [x] Todos os gates obrigatórios estão verdes no alvo correto: o teste
      isolado de migration e `migrate --check` em `config.settings.test`,
      frontend, E2E, Ruff, mypy e checks funcionais estão verdes.
- [x] Os comandos, outputs, durações e exits de cada gate estão detalhados
      acima; o bloqueio ambiental não foi convertido em sucesso.
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

Com os gates obrigatórios comprovados no alvo correto e as ressalvas ambientais
explicitadas, a R9 está tecnicamente concluída e apta a avançar para a R10. A
política fiscal continua manual/on-demand; não há autorização implícita para
cancelar NFC-e a partir do cancelamento comercial.
