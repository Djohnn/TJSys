# R9 Finalization Audit Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Corrigir os gaps comprovados da R9 e encerrar o pós-venda com devoluções, reembolsos e cancelamentos atômicos, idempotentes, concorrentes, auditáveis e integrados à interface existente.

**Architecture:** Todos os comandos de compensação serializam pelo agregado `Sale` com `select_for_update()` dentro de `transaction.atomic`, validam o estado e o tenant após obter o lock e só então criam fatos compensatórios. `SaleReturn`, `SaleRefund` e `SaleCancellation` permanecem os registros de domínio; estoque, caixa, auditoria e Outbox são efeitos na mesma transação. A API DRF mantém `/returns/` e `/cancel/`, acrescenta `/refund/`, e a UI da Sprint 19 passa a consumir exatamente esse contrato.

**Tech Stack:** Python 3.12, Django 5, Django REST Framework, PostgreSQL/RLS, pytest-django, Ruff, mypy, React 18, TypeScript, TanStack Query, Vitest/MSW e Playwright.

---

**Execution note:** Execute cada bloco a partir da raiz `C:\ERP\.worktrees\r9-finalization`, exceto quando o próprio bloco usar `Set-Location`. Cada bloco deve ser tratado como uma nova sessão de shell.

## Cenários de aceite (BDD/EARS)

- **Devolução concorrente:** Given uma venda confirmada com duas unidades devolvíveis, when duas solicitações concorrentes tentam devolver duas unidades cada, then uma conclui e a outra recebe `insufficient_returnable`, com uma única reentrada de estoque.
- **Replay idempotente:** Given uma compensação concluída, when a mesma `Idempotency-Key` e o mesmo payload são repetidos, then o sistema retorna o mesmo fato sem novos movimentos, auditorias ou eventos.
- **Conflito idempotente:** Given uma chave já consumida, when ela é repetida com payload diferente, then o sistema retorna `409 idempotency_conflict`.
- **Reembolso limitado:** Given uma venda parcialmente reembolsada, when o valor solicitado ultrapassa o saldo reembolsável, then o sistema rejeita toda a transação sem efeito parcial.
- **Cancelamento incompatível:** Given uma venda com devolução concluída, when o operador solicita cancelamento total, then o sistema retorna conflito e não duplica estoque nem financeiro.
- **Fiscal manual:** Given uma venda com NFC-e concluída, when a venda é cancelada comercialmente, then nenhum serviço fiscal é invocado automaticamente.
- **Isolamento:** Given um identificador de venda de outro tenant, when uma ação pós-venda é solicitada, then a resposta é `404` e nenhum dado do outro tenant é revelado.
- **Contrato web:** Given uma venda confirmada na tela de detalhes, when o operador devolve um item, then a UI envia `sale_item_id` para `/sales/{id}/returns/`, recebe `201` e apresenta o estado atualizado sem wait fixo.

### Task 1: Tornar o reembolso um fato auditável completo

**Files:**
- Modify: `backend/sales/models.py:295`
- Create: `backend/sales/migrations/0005_salerefund_reason.py`
- Modify: `backend/tests/test_sales_returns_models.py:137`

- [ ] Escrever primeiro um teste de modelo que cria `SaleRefund` com `reason='Produto avariado'`, recarrega o objeto e comprova a persistência do motivo.
- [ ] Executar o teste isolado e confirmar a falha esperada por campo inexistente:

  ```powershell
  Set-Location backend
  C:\ERP\.venv\Scripts\python.exe -m pytest tests/test_sales_returns_models.py::TestSaleRefundModel::test_refund_persists_reason -q --no-cov
  ```

  Expected: `1 failed` com `TypeError: SaleRefund() got unexpected keyword argument 'reason'`.

- [ ] Adicionar ao modelo um campo obrigatório de rastreabilidade:

  ```python
  reason = models.TextField()
  ```

- [ ] Criar a migration `0005_salerefund_reason.py` em duas operações seguras para dados existentes: adicionar `reason` com default temporário `'Legacy refund'`, depois remover o default do estado do modelo. Não editar migrations históricas.
- [ ] Atualizar as factories/fixtures e criações diretas de `SaleRefund` nos testes para fornecer um motivo explícito; cancelamentos usarão o próprio motivo do cancelamento.
- [ ] Executar modelos e migration check:

  ```powershell
  Set-Location backend
  C:\ERP\.venv\Scripts\python.exe -m pytest tests/test_sales_returns_models.py -q --no-cov
  C:\ERP\.venv\Scripts\python.exe manage.py makemigrations --check --dry-run
  ```

  Expected: testes verdes e `No changes detected`.

- [ ] Commit:

  ```powershell
  git add backend/sales/models.py backend/sales/migrations/0005_salerefund_reason.py backend/tests/test_sales_returns_models.py
  git commit -m "feat(r9): record refund reason"
  ```

### Task 2: Serializar devoluções e proteger o saldo devolvível

**Files:**
- Modify: `backend/sales/services.py:409-535`
- Modify: `backend/tests/test_sales_returns_services.py:22`
- Create: `backend/tests/test_sales_compensation_concurrency.py`

- [ ] Adicionar testes de serviço para rejeitar quantidade `0`, negativa e devolução de venda com status diferente de `confirmed`; cada teste deve também afirmar zero `SaleReturn`, zero `StockOperation`, zero `AuditRecord` e zero `OutboxMessage` com a correlation ID usada.
- [ ] Adicionar teste `@pytest.mark.django_db(transaction=True)` com `ThreadPoolExecutor(max_workers=2)` e `threading.Barrier(2)`: duas chaves diferentes tentam consumir simultaneamente o mesmo saldo devolvível. Cada thread deve abrir sua própria conexão, executar `SET app.current_tenant_id`, fechar a conexão no `finally` e retornar sucesso ou exceção de domínio.
- [ ] Executar os testes novos e confirmar que a implementação atual aceita quantidade não positiva e permite a corrida de saldo:

  ```powershell
  Set-Location backend
  C:\ERP\.venv\Scripts\python.exe -m pytest tests/test_sales_returns_services.py tests/test_sales_compensation_concurrency.py -q --no-cov
  ```

  Expected antes da correção: pelo menos um teste falha; nenhuma falha pode ser mascarada com retry.

- [ ] Implementar um helper privado compartilhado que sempre relê e bloqueia a venda no tenant ativo:

  ```python
  def _lock_compensable_sale(*, tenant, sale):
      locked_sale = Sale.all_objects.select_for_update().get(
          tenant=tenant,
          pk=sale.pk,
      )
      if locked_sale.status != 'confirmed':
          raise SaleNotCompensable('Only confirmed sales can be compensated.')
      return locked_sale
  ```

- [ ] Em `create_sale_return()`, adquirir o lock antes da consulta idempotente e antes de calcular `_already_returned_quantity()`. Validar `quantity > 0`, substituir o objeto recebido pela venda bloqueada e manter o hash baseado no payload canônico.
- [ ] Garantir que replay da mesma chave seja consultado depois do lock e antes da validação de saldo, para que um retry legítimo retorne o mesmo `SaleReturn` mesmo que o saldo tenha sido consumido pela primeira chamada.
- [ ] Adicionar ao teste concorrente um segundo cenário com a mesma chave e payload: ambas as threads retornam o mesmo ID e as contagens finais são exatamente uma devolução, um item, uma operação de entrada, uma auditoria e uma mensagem Outbox.
- [ ] Executar novamente as duas suítes e esperar `passed` para todos os casos.
- [ ] Commit:

  ```powershell
  git add backend/sales/services.py backend/tests/test_sales_returns_services.py backend/tests/test_sales_compensation_concurrency.py
  git commit -m "fix(r9): serialize sale returns"
  ```

### Task 3: Limitar e tornar idempotentes os reembolsos

**Files:**
- Modify: `backend/sales/services.py:538-623`
- Modify: `backend/tests/test_sales_refunds_services.py:21`
- Modify: `backend/tests/test_sales_compensation_concurrency.py`

- [ ] Escrever testes para: método inválido; valor zero/negativo; valor superior ao total líquido; soma de dois reembolsos superior ao total; venda cancelada; caixa fechado com rollback completo; replay com payload diferente; Pix/cartão sem `CashMovement`.
- [ ] Para cada erro posterior ao início da operação, afirmar que não sobraram `SaleRefund`, `CashMovement`, `AuditRecord` ou `OutboxMessage` com a chave da tentativa.
- [ ] Adicionar teste concorrente de duas solicitações que, somadas, excedem o total. Expected: somente uma conclui e o total de refunds nunca ultrapassa `sale.total`.
- [ ] Executar a suíte de reembolso e confirmar as falhas esperadas:

  ```powershell
  Set-Location backend
  C:\ERP\.venv\Scripts\python.exe -m pytest tests/test_sales_refunds_services.py tests/test_sales_compensation_concurrency.py -q --no-cov
  ```

- [ ] Alterar a assinatura para exigir motivo e normalizar o valor antes do fingerprint:

  ```python
  def create_sale_refund(
      *, tenant, sale, method, amount, reason, idempotency_key,
      sale_return=None, actor=None,
  ):
      amount = _money(Decimal(str(amount)))
      locked_sale = _lock_compensable_sale(tenant=tenant, sale=sale)
  ```

- [ ] Validar `method` contra `dict(SaleRefund.METHOD_CHOICES)`, `reason.strip()`, vínculo `sale_return` no mesmo tenant/venda e saldo reembolsável calculado por `Sum('amount')` apenas de refunds `completed`.
- [ ] Criar `RefundAmountExceeded` e mapear a regra como conflito. Para dinheiro, exigir sessão aberta antes de criar o refund; para Pix/cartão externo, nunca criar `CashMovement`.
- [ ] Incluir `reason` no `payload_hash`, `AuditRecord.detail` e `OutboxMessage.payload`.
- [ ] Adicionar concorrência com mesma chave/payload e afirmar um refund, um `cash_out`, uma auditoria e um evento. O lock da venda deve resolver a corrida sem capturar `IntegrityError` em uma transação quebrada.
- [ ] Executar a suíte até ficar verde.
- [ ] Commit:

  ```powershell
  git add backend/sales/services.py backend/tests/test_sales_refunds_services.py backend/tests/test_sales_compensation_concurrency.py
  git commit -m "fix(r9): bound concurrent refunds"
  ```

### Task 4: Tornar o cancelamento incompatível seguro e estritamente não fiscal

**Files:**
- Modify: `backend/sales/services.py:627-753`
- Modify: `backend/tests/test_sales_cancellations_services.py:22`
- Modify: `backend/tests/test_sales_compensation_concurrency.py`

- [ ] Escrever testes para cancelar: venda com devolução concluída; venda já cancelada com chave nova; venda em dinheiro com caixa fechado; replay igual; replay divergente; duas solicitações concorrentes com a mesma chave.
- [ ] No teste de venda com devolução, comparar estoque antes/depois e afirmar ausência de `SaleCancellation`, refunds automáticos, auditoria e Outbox do cancelamento.
- [ ] No teste fiscal negativo, criar `FiscalDocument` concluído para a venda e usar `unittest.mock.patch('fiscal.adapters.fake.DeterministicFiscalAdapter.cancel')`; depois do cancelamento comercial, afirmar `assert_not_called()` e documento fiscal ainda `CONCLUDED`.
- [ ] Executar os testes e registrar as falhas esperadas da implementação atual:

  ```powershell
  Set-Location backend
  C:\ERP\.venv\Scripts\python.exe -m pytest tests/test_sales_cancellations_services.py tests/test_sales_compensation_concurrency.py -q --no-cov
  ```

- [ ] Em `cancel_sale()`, bloquear a venda antes do replay/validações, retornar o fato existente para replay idêntico e rejeitar uma nova operação sobre venda cancelada.
- [ ] Criar `SaleHasReturns` e rejeitar cancelamento quando existir `SaleReturn` em `draft` ou `completed`; esta política impede reentrada dupla de estoque.
- [ ] Fazer o preflight financeiro antes de criar qualquer fato: se houver pagamento em dinheiro, `sale.cash_session` deve existir e permanecer aberta. Somente depois criar cancelamento, receipts e refunds automáticos.
- [ ] Preencher `reason` e `payload_hash` nos refunds automáticos. Preservar itens, pagamentos, totais e referências comerciais da venda; alterar apenas `Sale.status` e `version` como projeção explícita do ciclo de vida.
- [ ] Adicionar asserts de contagem exata por pagamento, item, auditoria e Outbox. Não adicionar import nem chamada para `fiscal.services`.
- [ ] Executar as suítes de cancelamento/concorrência até ficarem verdes.
- [ ] Commit:

  ```powershell
  git add backend/sales/services.py backend/tests/test_sales_cancellations_services.py backend/tests/test_sales_compensation_concurrency.py
  git commit -m "fix(r9): harden sale cancellation"
  ```

### Task 5: Fechar o contrato DRF de returns, refund e cancel

**Files:**
- Modify: `backend/sales/serializers.py:422-451`
- Modify: `backend/sales/views.py:221-342`
- Modify: `backend/tests/test_sales_returns_api.py:103`

- [ ] Expandir os testes de API com cenários Given/When/Then para:
  - `POST /sales/{id}/returns/` com `sale_item_id`, `201` e replay;
  - quantidade zero/negativa como Problem Details;
  - `POST /sales/{id}/refund/` parcial e total, ambos `201`;
  - método inválido, valor acima do saldo e caixa fechado;
  - `POST /sales/{id}/cancel/` incompatível com devolução;
  - ausência de `Idempotency-Key` nos três comandos;
  - autenticação, capability e tenant ativo;
  - IDs cross-tenant retornando o mesmo `404 not_found` de um UUID inexistente.
- [ ] Em cada erro de domínio, afirmar `Content-Type: application/problem+json`, `status`, `type`, `title`, `detail` e o campo `code` estável (`invalid_quantity`, `refund_amount_exceeded`, `sale_has_returns`, `idempotency_conflict`, `cash_session_required`).
- [ ] Executar a suíte e confirmar que o endpoint refund ainda retorna `404`:

  ```powershell
  Set-Location backend
  C:\ERP\.venv\Scripts\python.exe -m pytest tests/test_sales_returns_api.py -q --no-cov
  ```

- [ ] Fortalecer os serializers:

  ```python
  class ReturnItemInputSerializer(serializers.Serializer):
      sale_item_id = serializers.UUIDField()
      quantity = serializers.DecimalField(
          max_digits=18,
          decimal_places=6,
          min_value=Decimal('0.000001'),
      )

  class CreateSaleRefundSerializer(serializers.Serializer):
      method = serializers.ChoiceField(choices=SaleRefund.METHOD_CHOICES)
      amount = serializers.DecimalField(
          max_digits=18, decimal_places=2, min_value=Decimal('0.01'), required=False,
      )
      reason = serializers.CharField(min_length=1, max_length=500)
  ```

- [ ] Adicionar `@action(detail=True, methods=['post']) def refund(...)`, calcular o valor total restante quando `amount` for omitido e retornar `SaleRefundSerializer` com `201`.
- [ ] Manter `/returns/` como rota canônica e retrocompatível. Não criar uma segunda rota singular no backend; o consumidor web será corrigido na Task 6.
- [ ] Fazer `_problem()` incluir `'code': code`. Converter validações dos comandos para Problem Details, sem deixar `ValidationError` do DRF voltar como `application/json`; usar `422 validation_error` para payload inválido e manter `400` para header idempotente ausente.
- [ ] Mapear as novas exceções no `_handle_sales_error()` e passar `actor=request.user` ao refund.
- [ ] Executar a suíte de API e a suíte R9 focada completa:

  ```powershell
  Set-Location backend
  C:\ERP\.venv\Scripts\python.exe -m pytest tests/test_sales_returns_models.py tests/test_sales_returns_services.py tests/test_sales_refunds_services.py tests/test_sales_cancellations_services.py tests/test_sales_compensation_concurrency.py tests/test_sales_returns_api.py -q --no-cov
  ```

  Expected: todos `passed`, sem warning de retry/flakiness.

- [ ] Commit:

  ```powershell
  git add backend/sales/serializers.py backend/sales/views.py backend/tests/test_sales_returns_api.py
  git commit -m "feat(r9): expose refund API contract"
  ```

### Task 6: Alinhar a interface pós-venda ao contrato real

**Files:**
- Modify: `frontend/src/salesManagement/ReturnDialog.tsx:52-70`
- Modify: `frontend/src/salesManagement/RefundDialog.tsx:7-75`
- Modify: `frontend/src/salesManagement/compensations.test.tsx:70-460`
- Modify: `frontend/src/test/handlers.ts:603-657`

- [ ] Primeiro alterar os testes MSW para esperar `POST /sales/{id}/returns/` e capturar o corpo. Afirmar `items: [{ sale_item_id: 'item-1', quantity: '1' }]` e ausência do campo legado `product`.
- [ ] Adicionar testes do diálogo de refund para método selecionado, motivo, valor parcial e valor vazio (reembolso total), sempre verificando `Idempotency-Key` não vazia.
- [ ] Executar o arquivo isolado e confirmar a falha de contrato:

  ```powershell
  Set-Location frontend
  npm.cmd test -- --run src/salesManagement/compensations.test.tsx
  ```

  Expected antes da correção: falha porque a UI usa `/return/` e envia `product`.

- [ ] Alterar `ReturnDialog` para chamar `/sales/${saleId}/returns/` e enviar `sale_item_id: item.id`.
- [ ] Estender o tipo local de venda do `RefundDialog` com pagamentos; apresentar um `<select aria-label="Método do reembolso">` usando somente `cash`, `pix` e `card_external`, e enviar `{ method, amount?, reason }`.
- [ ] Manter o valor vazio como solicitação de saldo total; não converter silenciosamente valor igual ao total em campo ausente quando o usuário digitou um valor.
- [ ] Atualizar os handlers MSW para o payload e status reais (`201`) e preservar Problem Details nos conflitos.
- [ ] Executar unitários, typecheck, lint e build:

  ```powershell
  Set-Location frontend
  npm.cmd test -- --run src/salesManagement/compensations.test.tsx
  npm.cmd run typecheck
  npm.cmd run lint
  npm.cmd run build
  ```

  Expected: todos os comandos com exit code `0`.

- [ ] Commit:

  ```powershell
  git add frontend/src/salesManagement/ReturnDialog.tsx frontend/src/salesManagement/RefundDialog.tsx frontend/src/salesManagement/compensations.test.tsx frontend/src/test/handlers.ts
  git commit -m "fix(r9): align compensation UI contract"
  ```

### Task 7: Provar a jornada real com Playwright

**Files:**
- Modify: `backend/tenancy/management/commands/seed_e2e.py:197`
- Modify: `frontend/e2e/pdv-management-financial.spec.ts:4`

- [ ] Estender o seed com uma venda confirmada dedicada à devolução da R9, usando chave estável `e2e-r9-return-sale` e dados claramente falsos. O seed deve ser idempotente e não compartilhar essa venda com cenários mutáveis de cancelamento/refund.
- [ ] Escrever um cenário Playwright único para a jornada real de devolução: autenticar, localizar a venda seedada, abrir detalhes, clicar `Devolver itens`, preencher quantidade e motivo por label/test id, iniciar `page.waitForResponse()` para `POST **/sales/*/returns/`, confirmar, exigir `201` e aguardar o diálogo desaparecer com `expect(...).not.toBeVisible()`.
- [ ] Não usar `waitForTimeout`, seletor XPath, texto frágil de linha nem retry local. Usar `getByRole`, `getByLabel`, `getByTestId` e assertion web-first.
- [ ] Preparar backend e frontend conforme o fluxo E2E já documentado no repositório; então executar somente Chromium:

  ```powershell
  Set-Location frontend
  npm.cmd exec playwright test e2e/pdv-management-financial.spec.ts -- --project=chromium --grep "R9"
  ```

  Expected: `1 passed`, com duração real registrada; se dependências externas impedirem a execução, corrigir o ambiente e repetir, sem classificar falha funcional como sucesso.

- [ ] Executar o spec inteiro uma vez para detectar interferência de estado:

  ```powershell
  npm.cmd exec playwright test e2e/pdv-management-financial.spec.ts -- --project=chromium
  ```

- [ ] Commit:

  ```powershell
  git add backend/tenancy/management/commands/seed_e2e.py frontend/e2e/pdv-management-financial.spec.ts
  git commit -m "test(r9): cover real return journey"
  ```

### Task 8: Verificar migrations, rollback e qualidade global

**Files:**
- Modify: `backend/tests/test_sales_returns_services.py`
- Modify: `backend/tests/test_sales_refunds_services.py`
- Modify: `backend/tests/test_sales_cancellations_services.py`
- Modify: `backend/tests/test_sales_compensation_concurrency.py`

- [ ] Adicionar fault-injection com `unittest.mock.patch('sales.services.create_outbox_message', side_effect=RuntimeError('outbox unavailable'))` em return, refund e cancel. Após cada exceção, afirmar rollback de fato, estoque, caixa e auditoria.
- [ ] Executar a suíte focada em banco recém-criado para provar migrations desde schema vazio:

  ```powershell
  Set-Location backend
  C:\ERP\.venv\Scripts\python.exe -m pytest tests/test_sales_returns_models.py tests/test_sales_returns_services.py tests/test_sales_refunds_services.py tests/test_sales_cancellations_services.py tests/test_sales_compensation_concurrency.py tests/test_sales_returns_api.py -q --no-cov --create-db
  ```

- [ ] Executar gates backend globais, um por vez, preservando o output bruto:

  ```powershell
  C:\ERP\.venv\Scripts\python.exe -m pytest -q
  C:\ERP\.venv\Scripts\ruff.exe check .
  C:\ERP\.venv\Scripts\mypy.exe .
  C:\ERP\.venv\Scripts\python.exe manage.py makemigrations --check --dry-run
  C:\ERP\.venv\Scripts\python.exe manage.py migrate --check --settings=config.settings.migration
  C:\ERP\.venv\Scripts\python.exe manage.py check
  C:\ERP\.venv\Scripts\python.exe manage.py check --deploy --settings=config.settings.production
  ```

- [ ] Executar gates frontend globais:

  ```powershell
  Set-Location ..\frontend
  npm.cmd test -- --run
  npm.cmd run lint
  npm.cmd run typecheck
  npm.cmd run build
  ```

- [ ] Se algum gate falhar, classificar com evidência. Corrigir toda regressão R9; não registrar como aprovado enquanto houver falha funcional, migração pendente ou teste flaky.
- [ ] Atualizar o grafo após a última alteração de código:

  ```powershell
  Set-Location ..
  graphify update .
  git diff --check
  ```

- [ ] Commit de eventuais ajustes de teste/qualidade:

  ```powershell
  git add backend/tests/test_sales_returns_services.py backend/tests/test_sales_refunds_services.py backend/tests/test_sales_cancellations_services.py backend/tests/test_sales_compensation_concurrency.py
  git commit -m "test(r9): prove compensation atomicity"
  ```

### Task 9: Atualizar evidências e criar o commit final isolado

**Files:**
- Modify: `docs/10_Releases/SPRINT-009_Returns_Cancellations_Refunds_Final_Report.md`
- Modify: `docs/PRD.md:774-810`

- [ ] Atualizar o relatório com a base `e7a0a8a`, branch `codex/r9-finalization`, commits corretivos, decisões de concorrência, rota `/refund/`, compatibilidade `/returns/`, política fiscal manual e outputs brutos reais de cada gate.
- [ ] Substituir as antigas afirmações de “269 passed com 2 falhas preexistentes” pelos resultados atuais. Nenhuma contagem pode ser estimada ou copiada do baseline.
- [ ] Atualizar o PRD para apontar o design e este plano de auditoria, mantendo a R9 como concluída somente se todos os gates obrigatórios estiverem verdes.
- [ ] Conferir isolamento do worktree:

  ```powershell
  git status --short
  git diff --check
  git diff --stat e7a0a8a..HEAD
  git log --oneline e7a0a8a..HEAD
  ```

- [ ] Revisar o diff final contra o design aprovado: nenhum placeholder/TODO, nenhum segredo, nenhuma alteração fiscal automática e nenhum arquivo de outra frente.
- [ ] Criar o commit documental final, sem push:

  ```powershell
  git add docs/10_Releases/SPRINT-009_Returns_Cancellations_Refunds_Final_Report.md docs/PRD.md
  git commit -m "docs(r9): close finalization audit"
  ```

- [ ] Entregar o resumo em PT-BR com arquivos/linhas, outputs brutos (pass/fail, duração e exit code), hashes dos commits, ressalvas reais e confirmação explícita de que nenhum push foi feito.

## Definition of Done

- [ ] Return, refund e cancel passam nos testes de unidade/serviço, API, concorrência, rollback e E2E.
- [ ] Mesma chave/payload produz um único fato; mesma chave/payload diferente produz conflito estável.
- [ ] Estoque, caixa, auditoria e Outbox têm contagens exatas e rollback integral.
- [ ] Cross-tenant permanece indistinguível de inexistente.
- [ ] A UI usa `/returns/`, `sale_item_id` e o endpoint real `/refund/`.
- [ ] Cancelamento comercial não chama o domínio fiscal.
- [ ] Suítes globais, Ruff, mypy, migrations, Django checks, frontend e build estão verdes.
- [ ] Relatório final contém somente evidência executada nesta branch.
- [ ] Commits são isolados em `codex/r9-finalization`; nenhum push é realizado.
