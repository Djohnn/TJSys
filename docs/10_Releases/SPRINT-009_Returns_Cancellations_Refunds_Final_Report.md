# Sprint 9 — Devoluções, Cancelamentos e Estornos — Relatório Final

**Data do fechamento:** 2026-08-13
**Base:** `77b36ef` (`codex/r9-finalization`)
**Branch de auditoria:** `codex/r9-finalization`
**Design aprovado:** [R9 — Auditoria e Fechamento do Pós-venda](../superpowers/specs/2026-08-12-r9-finalization-audit-design.md)
**Plano de auditoria:** [R9 Finalization Audit Implementation Plan](../superpowers/plans/2026-08-12-r9-finalization-audit-implementation-plan.md), Task 9, linhas 370–408

## Resultado executivo

A auditoria fecha a implementação técnica da R9 com os gates obrigatórios
comprovados nesta branch. Devoluções, reembolsos e cancelamentos são fatos
compensatórios idempotentes, auditáveis, concorrentes de forma segura e
isolados por tenant. Os valores e itens originais da venda permanecem
imutáveis; o status transiciona para `cancelled` no cancelamento comercial.

O fechamento não transforma limitações ambientais em sucesso: o deploy check
sem secrets continua bloqueado por configuração ausente. Os arquivos rastreados `frontend/playwright-report/index.html` e
`frontend/test-results/.last-run.json` estão dirty e foram preservados fora dos
commits; `graphify-out/` é untracked e também ficou fora dos commits. O banco
E2E dedicado `zyrp` foi usado para seed e `migrate --check`; o banco
compartilhado preexistente não foi alterado.

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
- `InsufficientReturnableQuantity` retorna `409` com
  `code=insufficient_returnable`; quantidades não positivas retornam
  `422 code=invalid_quantity`.

### Frontend, persistência e 404

- `ReturnDialog`, `RefundDialog` e `CancellationDialog` consomem o cliente
  compartilhado e a normalização do serializer real (`net_total`,
  `line_total`, IDs de produto e `payments.method`), sem fetch ad hoc nem
  shape legado.
- `RefundDialog` deriva o método inicial do primeiro pagamento compatível na
  ordem do serializer (`cash`, `pix` ou variantes de cartão normalizadas para
  `card_external`); com múltiplos pagamentos exibe orientação e mantém o
  seletor ajustável. `ReturnDialog` calcula crédito parcial proporcional ao
  `line_total` com `Decimal`, preservando descontos.
- `ReturnDialog` envia `sale_item_id`, `quantity`, `reason` e
  `Idempotency-Key` para `/returns/`; `RefundDialog` usa a rota real
  `/refund/`, usa o `net_total` correto e envia método, valor opcional,
  motivo e chave idempotente.
- Os dialogs distinguem carregamento, vazio e erro; 404 e falhas 500 viram
  alertas acessíveis sem crash e mantêm cross-tenant/ausente indistinguíveis.
  A suíte `compensations.test.tsx` cobre o serializer real, itens, valor de
  refund, PIX/cartão, descontos/quantidade parcial, estados vazios e
  404/erro nos dois dialogs.

### E2E, CI, seed e atomicidade

- O seed E2E é fail-closed, idempotente e abrangido por transação; preserva
  exatamente as linhas de recovery esperadas e impõe limite de gerações.
- O CI aguarda o backend por health check antes do Playwright e fornece
  `E2E_SEED=1`; ambos os workflows instalam explicitamente Chromium, Firefox e
  WebKit, comprovados por teste estático contra os projetos configurados.
- A jornada R9 usa vendas seedadas distintas para return, refund e cancel;
  cobre também 404 de refund e return sem mockar as mutações reais. Recovery
  codes são consumidos somente em Chromium; Firefox/WebKit permanecem skipped
  por política explícita. As taxas de login/MFA do job E2E são elevadas apenas
  para evitar que a suíte sequencial consuma o limite de autenticação.

## Commits do escopo de implementação e auditoria

O histórico anterior de implementação/auditoria permanece listado abaixo como
referência. O commit isolado desta remediation é
`0ac90a7b4590cd83e88471000c28a4264a0361b2 fix(r9): close spec review gaps`,
contendo código, testes e CI; os commits documentais desta etapa são
separados.

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

Os commits de fechamento documental são definidos dinamicamente pela saída
final de `git log --oneline`; não há contagem fixa neste relatório.

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

Output final pós-commit: `110 passed in 73.41s (0:01:13)`; wrapper
`DURATION=75.94s`; `EXIT=0`.
O contador anterior era 109; passou a 110 nesta remediation pela inclusão
explícita do cenário API `insufficient_returnable`/409.

### Backend global e qualidade estática

Comando backend global (`cwd=...\backend`):

```powershell
C:\ERP\.venv\Scripts\python.exe -m pytest -q
```

Output final: `825 passed in 454.81s (0:07:34)`; coverage `80.99%`; wrapper
`DURATION=459.70s`; `EXIT=0`.

Ruff:

```powershell
$sw = [Diagnostics.Stopwatch]::StartNew(); $out = & C:\ERP\.venv\Scripts\ruff.exe check . 2>&1; $exit = $LASTEXITCODE; $sw.Stop(); $out; Write-Output ('DURATION=' + [math]::Round($sw.Elapsed.TotalSeconds, 2) + 's'); Write-Output ('EXIT=' + $exit); exit $exit
```

Output final: `All checks passed!`; `DURATION=0.15s`; `EXIT=0`.

mypy:

```powershell
$sw = [Diagnostics.Stopwatch]::StartNew(); $out = & C:\ERP\.venv\Scripts\mypy.exe . 2>&1; $exit = $LASTEXITCODE; $sw.Stop(); $out; Write-Output ('DURATION=' + [math]::Round($sw.Elapsed.TotalSeconds, 2) + 's'); Write-Output ('EXIT=' + $exit); exit $exit
```

Output relevante: notas informativas do mypy em três pontos; `Success: no
issues found in 297 source files`; `DURATION=3.26s`; `EXIT=0`.

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

Output: `System check identified no issues (0 silenced)`; `DURATION=2.17s`;
`EXIT=0`.

Reexecução final com `DJANGO_SETTINGS_MODULE=config.settings.e2e` e o banco
dedicado `zyrp`: `No changes detected`; `migrate --check` também não produziu
saída; `DURATION=4.33s`; `EXITS=makemigrations:0 migrate_check:0`. O
`RuntimeWarning` da tentativa antiga sem env E2E não se repetiu.

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

Output final: `Test Files 22 passed (22)`, `Tests 347 passed (347)`, Vitest
`Duration 23.58s`; wrapper `DURATION=25.88s`; `EXIT=0`. Um teste de estado
de erro imprimiu stack de `Error: test error` no jsdom, mas não produziu falha
do runner.

Lint:

```powershell
$sw = [Diagnostics.Stopwatch]::StartNew(); $out = & npm.cmd run lint 2>&1; $exit = $LASTEXITCODE; $sw.Stop(); $out; Write-Output ('DURATION=' + [math]::Round($sw.Elapsed.TotalSeconds, 2) + 's'); Write-Output ('EXIT=' + $exit); exit $exit
```

Output: `✖ 4 problems (0 errors, 4 warnings)` em `PersonForm.tsx`,
`PurchaseOrderEditor.tsx` e `ReceiptForm.tsx`; `DURATION=12.03s`; `EXIT=0`.
São os warnings preexistentes de React Hooks/React Compiler registrados no
runner.

Typecheck:

```powershell
$sw = [Diagnostics.Stopwatch]::StartNew(); $out = & npm.cmd run typecheck 2>&1; $exit = $LASTEXITCODE; $sw.Stop(); $out; Write-Output ('DURATION=' + [math]::Round($sw.Elapsed.TotalSeconds, 2) + 's'); Write-Output ('EXIT=' + $exit); exit $exit
```

Output: `tsc --noEmit`; `DURATION=10.67s`; `EXIT=0`.

Build:

```powershell
$sw = [Diagnostics.Stopwatch]::StartNew(); $out = & npm.cmd run build 2>&1; $exit = $LASTEXITCODE; $sw.Stop(); $out; Write-Output ('DURATION=' + [math]::Round($sw.Elapsed.TotalSeconds, 2) + 's'); Write-Output ('EXIT=' + $exit); exit $exit
```

Output: `209 modules transformed`, `built in 2.81s`, warning de chunk acima
de 250 kB; wrapper `DURATION=14.29s`; `EXIT=0`.

### Contrato Problem Details e CI browser

Teste API e contrato final:

```text
.............. [100%]
14 passed in 20.92s; EXIT=0
```

Os casos positivos acima do saldo provam `409`/`insufficient_returnable`; os
casos `qty <= 0` provam `422`/`invalid_quantity`, sem alterar a proteção de
concorrência.

Teste estático de workflows e guards de seed:

```text
....... [100%]
7 passed in 0.08s
DURATION=2.69s EXIT=0
```

O teste compara os três projetos declarados no Playwright com a instalação
dos dois workflows; o mesmo job também cobre o limite fail-closed das três
gerações R9.

### E2E

R9 focado (`cwd=...\frontend`):

```powershell
npm.cmd exec playwright test e2e/pdv-management-financial.spec.ts -- --project=chromium --grep "R9"
```

Output: `5 passed (29.0s)`; wrapper `DURATION=31.17s`; `EXIT=0`.

Chromium completo:

```powershell
npm.cmd exec playwright test e2e/pdv-management-financial.spec.ts -- --project=chromium
```

Output: `13 passed (1.2m)`; wrapper `DURATION=74.77s`; `EXIT=0`.

Firefox/WebKit foram executados separadamente para preservar os recovery
codes:

```powershell
$sw = [Diagnostics.Stopwatch]::StartNew(); $out = & npm.cmd exec playwright test e2e/pdv-management-financial.spec.ts -- --project=firefox --project=webkit 2>&1; $exit = $LASTEXITCODE; $sw.Stop(); $out; Write-Output ('DURATION=' + [math]::Round($sw.Elapsed.TotalSeconds, 2) + 's'); Write-Output ('EXIT=' + $exit); exit $exit
```

Output: `Running 26 tests using 1 worker`, `26 skipped`; `DURATION=4.05s`;
`EXIT=0`. O skip foi deliberado e não consumiu códigos.

### Impeccable UI

Para a mudança substancial dos dialogs, foram executados contexto, audit,
polish manual bounded e critique. O detector mecânico final retornou `[]` para
`RefundDialog.tsx` e `ReturnDialog.tsx`; a crítica armazenada para a superfície
dos dialogs ficou em `36/40`, sem P0/P1. O snapshot é explicitamente
single-context degradado porque `spawn_agent` não está exposto nesta sessão;
os P2 restantes são foco/tamanho do controle do Modal compartilhado, fora do
escopo desta remediation.

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

### Integridade documental do diff

`cwd=C:\ERP\.worktrees\r9-finalization`.

```powershell
$sw=[Diagnostics.Stopwatch]::StartNew(); $out = & git diff --check 2>$null; $exit=$LASTEXITCODE; $sw.Stop(); $out; Write-Output ('DURATION=' + [math]::Round($sw.Elapsed.TotalSeconds, 2) + 's'); Write-Output ('EXIT=' + $exit); exit $exit
```

Output: silencioso; `DURATION=0.18s`; `EXIT=0`.

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
- [x] `git diff --check` executado no worktree: output silencioso,
      `DURATION=0.18s`, `EXIT=0`.
- [x] Commits isolados em `codex/r9-finalization`, definidos pelo histórico
      final da branch, sem push.

## Riscos e ressalvas

- O banco compartilhado local não foi migrado; a validação de schema/migration
  foi feita em `test_tjsys`, que passou, e o banco compartilhado preexistente
  foi preservado.
- O deploy check exige `MFA_ENCRYPTION_KEY`; sem a variável falha por
  configuração ausente. Com chave dummy efêmera passou com warnings.
- `frontend/playwright-report/index.html` e
  `frontend/test-results/.last-run.json` são arquivos rastreados e dirty,
  preservados fora dos commits; `graphify-out/` é untracked e também foi
  mantido fora dos commits.
- Nenhum push foi realizado.

## Decisão final

Com os gates obrigatórios comprovados no alvo correto e as ressalvas ambientais
explicitadas, a R9 está tecnicamente concluída e apta a avançar para a R10. A
política fiscal continua manual/on-demand; não há autorização implícita para
cancelar NFC-e a partir do cancelamento comercial.

## Adendo final desta remediation

Este adendo substitui qualquer baseline anterior neste relatório. O commit de
código/testes/CI desta etapa é `0ac90a7b4590cd83e88471000c28a4264a0361b2 fix(r9): close spec review gaps`.
O backend agora expõe `insufficient_returnable` com HTTP 409 para excesso sobre
o saldo devolvível; `invalid_quantity` para quantidade não positiva permanece
em HTTP 422. Os dialogs usam a normalização compartilhada
do serializer real (`net_total`, `line_total`, IDs de produto e
`payments.method`) e têm loading, empty, erro acessível e 404 sem crash.

O seed passou a manter vendas distintas para return, refund e cancel. A jornada
R9 final tem cinco cenários reais: return, refund, cancel e 404 em cada dialog.
O CI instala os três browsers declarados no Playwright; `retries=0`,
`workers=1` e `trace=retain-on-failure` são determinísticos, e o skip
Firefox/WebKit é política explícita para não consumir recovery codes.

## Adendo de follow-up da spec review — 2026-08-13

### RED observado antes da correção

O RED frontend original fornecido pela execução interrompida foi preservado
sem alterar sua contagem:

```text
npm.cmd test -- --run src/salesManagement/compensations.test.tsx
18 failed | 11 passed (29)
Duration 23.80s
```

Essa tentativa original não registrou o exit code; ele não foi inventado neste
relatório. Como RED reproduzível desta continuação, antes da implementação, o
mesmo arquivo já ampliado produziu `4 failed | 31 passed (35)`, `Duration
6.49s`; depois da correção, no recheck pós-commit, produziu `35 passed (35)`,
runner `5.65s`, wrapper `7.84s`, exit 0.

### Decisões e cenários Gherkin da revisão

- Given taxas de autenticação configuradas, When o workflow é analisado, Then
  `AUTH_LOGIN_RATE`/`AUTH_MFA_RATE` aparecem apenas no job E2E; projetos
  Chromium/Firefox/WebKit têm instalação e execução coerentes.
- Given Playwright em qualquer ambiente, When o runner inicia, Then usa
  `retries=0`, `workers=1` e `trace=retain-on-failure`, sem trace condicionado
  a retry.
- Given pagamentos canônicos PIX, cartão ou múltiplos, When RefundDialog abre,
  Then deriva o primeiro método compatível em ordem, normaliza cartão para
  `card_external` e deixa o usuário ajustar com aviso acessível em múltiplos.
- Given linha de duas unidades com `line_total=18.00`, When uma unidade é
  devolvida, Then o resumo mostra `R$ 9.00` usando aritmética monetária precisa.
- Given `qty <= 0`, When a API processa o retorno, Then responde
  `invalid_quantity`/422; Given excesso positivo, Then responde
  `insufficient_returnable`/409.
- Given retorno ou reembolso sem itens/pagamentos, When o detalhe carrega, Then
  há estado vazio acessível e a confirmação fica desabilitada.

### Raw outputs do follow-up

```text
Backend/API/serviços/CI contracts: 14 passed in 20.92s; EXIT=0
Workflow static contract: 7 passed in 0.08s; DURATION=2.69s; EXIT=0
Frontend compensations: 35 passed in 5.65s; wrapper DURATION=7.84s; EXIT=0
Vitest completo: 22 files, 347 passed; runner Duration 23.58s;
wrapper DURATION=25.88s; EXIT=0
```

O runner Vitest imprimiu `Error: test error` do teste intencional de estado de
erro em jsdom, mas terminou com zero falhas e exit 0. O diff final foi
rechecado, Graphify foi atualizado após o código, e nenhum push foi feito.

## Adendo final da quality review - evidencia corrente - 2026-08-13

Este adendo substitui as contagens de execucao anteriores deste relatorio. A
contagem corrente da remediation e `111` no backend focado, `44` no arquivo
frontend focado, `356` no Vitest completo, `6` no foco E2E R9 e `14` no spec
completo Chromium. Os numeros historicos `109`/`110`, `347` e `13` permanecem
apenas como contexto de execucoes anteriores; nao sao usados como aceite atual.

### Decisoes finais da quality review

- `refundable_balance` e calculado como `net_total` menos refunds
  `completed`, com `Decimal`, filtro explicito de tenant e `Prefetch` dos
  itens/refunds para evitar N+1 no detalhe. O cliente normaliza o campo real e
  o `RefundDialog` mostra e valida o saldo corrente.
- O validador compartilhado `normalize_reason` faz `strip`, rejeita motivo
  vazio e preserva a forma normalizada no fato, auditoria e Outbox para
  return/refund/cancel.
- `Modal` e compartilhado pelos tres dialogs e fornece foco inicial, trap de
  Tab, Escape, restauracao de foco, close/cancel durante loading e bloqueio
  apenas durante a mutacao. Os estados loading, empty, erro/404 e sucesso
  permanecem distintos.
- Quantidades usam a precisao do serializer (`unit_precision`, ate seis casas)
  e `Decimal`; dinheiro nao usa `parseFloat` nem `Number` nos dialogs.
- O start manual do Vite e o `sleep` de frontend foram removidos do
  `e2e.yml`; o `webServer` do Playwright controla readiness com host explicito
  `127.0.0.1`. O health check do backend mantem seu polling operacional
  separado.
- A duplicacao de `_handle_sales_error` foi avaliada. `CashSessionViewSet` e
  `SaleViewSet` possuem conjuntos de excecoes/codigos diferentes; o helper
  comum nao foi extraido nesta remediation para nao alterar o contrato de
  caixa. Fica registrado como minor tecnico delimitado.

### Cenarios Gherkin finais

- Given o workflow CI, When as variaveis sao analisadas, Then
  `AUTH_LOGIN_RATE`, `AUTH_MFA_RATE` e `E2E_RECOVERY_CODE` aparecem somente no
  job E2E e os tres browsers instalados correspondem aos projetos executados.
- Given uma venda com refund parcial concluido, When o detalhe e consultado,
  Then `refundable_balance` e o saldo restante tenant-safe e o dialog impede
  valor acima dele.
- Given um motivo com padding ou somente whitespace, When return/refund/cancel
  e processado, Then o motivo persistido e normalizado ou a operacao rejeita
  sem efeitos.
- Given uma linha de `line_total=18.00`, quantidade vendida `2` e desconto,
  When `1` unidade e devolvida, Then o credito e `9.00` com precisao Decimal;
  com precisao de unidade 6 o input usa `step=0.000001`.
- Given um modal em loading, When o operador usa close, Escape ou teclado,
  Then pode cancelar com foco confinado e o foco retorna ao opener.
- Given uma venda seedada distinta, When return/refund/cancel sao executados,
  Then as tres mutacoes reais retornam `201`; os tres 404 de dialog sao bordas
  de UI com mock de rede explicito e nao substituem os testes API cross-tenant
  reais (`404` para os tres comandos).

### Raw outputs finais desta continuacao

RED frontend original preservado, sem exit registrado na execucao interrompida:

```text
npm.cmd test -- --run src/salesManagement/compensations.test.tsx
18 failed | 11 passed (29)
Duration 23.80s
```

RED reproduzivel desta continuacao, antes da ultima correcao de fixture:

```text
npm.cmd test -- --run src/salesManagement/compensations.test.tsx
34 passed | 9 failed
Duration 7.75s
EXIT=1
```

Backend/API/servicos/CI focado:

```text
........................................................................ [ 64%]
.......................................                                  [100%]
111 passed in 84.06s (0:01:24)
EXIT=0
```

Workflow contract:

```text
..........                                                               [100%]
10 passed in 0.28s
EXIT=0
```

Frontend focado:

```text
Test Files 1 passed (1)
Tests 44 passed (44)
Duration 7.08s
EXIT=0
```

Vitest completo:

```text
Test Files 22 passed (22)
Tests 356 passed (356)
Duration 24.96s
EXIT=0
```

O `Error: test error` exibido no output completo vem do componente de teste
intencional em `AppShell.test.tsx`; o runner terminou com zero falhas e exit 0.

Qualidade estatica e build:

```text
Ruff: All checks passed! - EXIT=0
mypy: Success: no issues found in 4 source files - EXIT=0
typecheck: tsc --noEmit - EXIT=0
lint: EXIT=0, 0 errors, 4 warnings preexistentes fora do escopo
build: built in 3.60s - EXIT=0
git diff --check: EXIT=0 (somente avisos LF/CRLF do Git)
```

E2E real, `cwd=...\\frontend`:

```text
npx.cmd playwright test e2e/pdv-management-financial.spec.ts --project=chromium --grep "[R9]"
6 passed (40.5s)
EXIT=0

npx.cmd playwright test e2e/pdv-management-financial.spec.ts --project=chromium
14 passed (1.6m)
EXIT=0

npx.cmd playwright test e2e/pdv-management-financial.spec.ts --project=firefox --project=webkit
Running 28 tests using 1 worker
28 skipped
EXIT=0
```

O teste inicial de readiness falhou com `Timed out waiting 60000ms from
config.webServer`; a causa foi o binding local sem host explicito. Apos
`--host 127.0.0.1`, o foco ficou verde. Uma tentativa posterior de semear uma
nova geracao retornou o guard esperado:

```text
CommandError: Limite de 16 geracoes da venda R9 atingido; resete o banco E2E dedicado antes de semear novamente.
```

Nenhum reset foi feito; os fatos auditaveis e o limite fail-closed foram
preservados.

### Impeccable e commits completos

O detector final nos quatro alvos (`Modal`, `CancellationDialog`,
`RefundDialog`, `ReturnDialog`) retornou `[]`. Audit e polish foram feitos em
bounded pass manual conforme o sistema incumbente; a critique final foi
armazenada em `.impeccable/critique/2026-08-13T19-03-48Z__r9-sales-compensation-dialogs.md`,
score `39/40`, `P0=0`, `P1=0`. A execucao foi single-context porque
`spawn_agent` nao esta exposto nesta sessao.

Hashes completos e escopos:

```text
a43701a902aff628139520931491441a0a47bf35
  fix(r9): close finalization contract gaps - implementacao inicial dos gaps de contrato R9.
0ac90a7b4590cd83e88471000c28a4264a0361b2
  fix(r9): close spec review gaps - codigo/testes/CI da revisao de especificacao.
621ef807dfdb3be6b77e8fd991c70d49a1b926f6
  docs(r9): record final remediation evidence - evidencia documental anterior.
4d5dfbf59ea3f98a210c79945da9e9febdd47def
  docs(r9): record spec review evidence - evidencia documental da spec review.
145bb26cd27b5aa6f577994f9e0ad7a6beb0ca46
  docs(r9): record final post-commit gates - gates documentais anteriores.
31d8bfc114735b3e15fc6486d1c948ca5f576365
  fix(r9): close quality review blockers - codigo, testes e CI desta continuacao.
```

O commit documental deste adendo e separado do commit `31d8bfc`; os artefatos
dirty `frontend/playwright-report/index.html`,
`frontend/test-results/.last-run.json` e `graphify-out/` continuam fora dos
commits. Nenhum push foi realizado.
