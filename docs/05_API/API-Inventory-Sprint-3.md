# API de Estoque — Sprint 3

Base path: `/api/v1/`

Todas as rotas tenant-scoped exigem:

- sessão autenticada;
- header `X-Tenant-ID`;
- capability de estoque;
- MFA verificado para escritas administrativas;
- header `Idempotency-Key` nas operações de escrita.

## Operações idempotentes

### Entrada

`POST /stock-operations/receipt/`

Payload:

```json
{
  "branch": "uuid",
  "product": "uuid",
  "location": "uuid",
  "quantity": "2.000000",
  "unit": "uuid",
  "factor": "1.000000",
  "lot": "uuid",
  "reason": "entrada manual"
}
```

### Saída

`POST /stock-operations/issue/`

Mesmo payload de entrada. Produto configurado com lote/validade exige lote válido e não vencido.

### Ajuste

`POST /stock-operations/adjustment/`

Mesmo payload. Quantidade positiva aumenta saldo; quantidade negativa baixa saldo. Ajuste autorizado pode movimentar lote vencido para baixa administrativa auditada.

### Transferência

`POST /stock-operations/transfer/`

```json
{
  "source_branch": "uuid",
  "target_branch": "uuid",
  "product": "uuid",
  "source_location": "uuid",
  "target_location": "uuid",
  "quantity": "2.000000",
  "unit": "uuid",
  "factor": "1.000000",
  "lot": "uuid",
  "reason": "transferência entre locais"
}
```

### Reversão

`POST /stock-operations/reverse/`

```json
{
  "operation": "uuid",
  "reason": "correção operacional"
}
```

## Regras de idempotência

- A primeira chamada com `Idempotency-Key` cria a operação e armazena o hash do payload.
- Replay com mesma chave e mesmo payload retorna a operação original.
- Replay com mesma chave e payload diferente retorna `409`.
- A chave é única por tenant.

## Erros de estoque

Erros de domínio usam corpo problem-style:

```json
{
  "type": "https://tjsys.local/problems/insufficient_stock",
  "title": "Stock operation rejected",
  "status": 409,
  "detail": "Insufficient stock..."
}
```

Códigos atuais:

- `invalid_stock_operation` — payload/regra inválida;
- `idempotency_conflict` — mesma chave com payload diferente;
- `insufficient_stock` — baixa/transferência excede saldo disponível.

## Saldos e reconciliação

`GET /stock-balances/` lista saldos somente leitura.

`GET /stock-balances/reconcile/` compara o saldo projetado com a soma dos movimentos e retorna divergências sem corrigir silenciosamente.

## Eventos

As operações persistem auditoria e Outbox na mesma transação de domínio:

- `inventory.receipt.created`
- `inventory.issue.created`
- `inventory.adjustment.created`
- `inventory.transfer.created`
- `inventory.reversal.created`
- `inventory.operation.confirmed`

O payload de evento contém `operation_id`, `operation_type` e `status`. O `correlation_id` usa a chave de idempotência da operação.
