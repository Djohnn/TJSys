# Sprint 10 — Compras, Recebimento e Contas a Pagar — Relatório Final

**Data de conclusão:** 2026-07-21  
**Branch:** `feat/on-demand-fiscal`

## Resumo

Sprint concluída com o fluxo fornecedor → pedido de compra → aprovação → recebimento
parcial ou total → entrada de estoque → conta a pagar. Operações transacionais usam
idempotência, escopo por tenant, auditoria e eventos Outbox.

## Entregas

- App `purchasing` com fornecedores, pedidos, itens, recebimentos e itens recebidos.
- Aprovação com bloqueio de edição após mudança do estado `draft`.
- Recebimento parcial/total e bloqueio de quantidade acima do saldo pendente.
- Entrada de estoque por serviço do domínio de inventário, sem duplicação em replay.
- Geração de `Payable` vinculada ao fornecedor, pedido e recebimento.
- APIs DRF tenant-scoped com MFA/capabilities nas operações de escrita.
- Problem Details para estado inválido, excesso de recebimento e conflito idempotente.
- Teste negativo cross-tenant retornando `404` sem exposição do recurso.

## Evidências de qualidade

```text
Suíte completa: 375 passed in 177.65s
Cobertura: 80.70% (mínimo exigido: 80%)
Ruff: All checks passed!
mypy: Success: no issues found in 194 source files
Django check: System check identified no issues (0 silenced).
Migrations: No changes detected
Cross-tenant focado: 1 passed in 12.76s
```

## Remediação de integridade — 2026-08-14

Auditoria posterior encontrou e corrigiu cinco gaps no aceite original:

- linhas repetidas do mesmo item agora são agregadas antes da validação do saldo;
- o pedido é travado com `select_for_update()` durante recebimento e cancelamento;
- replay compara o payload canônico e rejeita divergência com conflito idempotente;
- pedidos e itens aprovados não aceitam atualização ou exclusão pela API;
- recebimentos vazios ou com decimais inválidos retornam Problem Details, sem `500`;
- `Payable` mantém FKs protegidas para fornecedor, pedido e recebimento de origem.

Evidência TDD e gates focados:

```text
RED funcional:
9 failed, 22 deselected in 27.79s

RED concorrente sem trava (mutação reversível):
1 failed in 27.41s
results = ['confirmed', 'confirmed']

GREEN integrado R10 + financial + cancellations:
84 passed in 50.08s

Ruff:
All checks passed!

mypy:
Success: no issues found in 19 source files

Migrations/Django:
No changes detected
migrate --check: exit 0 com config.settings.migration em test_tjsys
System check identified no issues (0 silenced).
```

A suíte backend global registrou `855 passed, 4 failed` antes do ajuste de
instância stale no cancelamento. A suíte completa de cancelamentos ficou verde
depois do ajuste (`16 passed`). As três falhas restantes foram reproduzidas
isoladamente e são externas à R10: uma validação fiscal de CNPJ e duas asserções
sobre `CREATEDB` do papel PostgreSQL local.

## Decisões e limites

- A obrigação financeira nasce do recebimento confirmado e não do pedido aprovado.
- Registros confirmados recebem compensações; não são reescritos silenciosamente.
- RFQ/cotação, integração bancária e regras avançadas de custeio permanecem fora do escopo.
- A reconciliação fiscal de entrada adicionada na branch é complementar; emissão e
  escrituração fiscal completas não fazem parte do aceite mínimo desta sprint.

## Arquivos principais

- `backend/purchasing/models.py`
- `backend/purchasing/services.py`
- `backend/purchasing/serializers.py`
- `backend/purchasing/views.py`
- `backend/purchasing/urls.py`
- `backend/financial/models.py`
- `backend/financial/services.py`
- `backend/financial/migrations/0004_payable_purchase_order_payable_purchase_receipt_and_more.py`
- `backend/purchasing/migrations/0006_purchaseorder_uniq_purchase_order_idempotency_tenant_and_more.py`
- `backend/tests/test_purchasing_models.py`
- `backend/tests/test_purchasing_services.py`
- `backend/tests/test_purchase_receiving_services.py`
- `backend/tests/test_purchasing_api.py`
