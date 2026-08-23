# Sprint 10 — Compras, Recebimento e Contas a Pagar — Relatório Final

**Data de conclusão:** 2026-07-21

**Branch histórica:** `feat/on-demand-fiscal`

**Reconciliação com a master:** 2026-08-17, commit `df39d2a`

## Resumo

Sprint concluída com o fluxo fornecedor → pedido de compra → aprovação → recebimento
parcial ou total → entrada de estoque → conta a pagar. Operações transacionais usam
idempotência, escopo por tenant, auditoria e eventos Outbox.

### Revalidação da consolidação — 2026-08-17

A remediação `6f7a783` foi reconciliada sobre a `master` pós-R9 sem conflitos e
sem trazer mudanças fora de `purchasing`, `financial`, migrations, testes e
documentação da R10. Três testes legados usavam `MagicMock` como pedido de compra
e deixaram de representar o contrato real depois do lock/reload obrigatório; os
testes foram convertidos para pedidos persistidos, mantendo a proteção concorrente
do serviço.

Evidência fresca:

```text
Baseline antes da R10: 23 passed in 38.85s
Matriz R10 integrada: 84 passed in 64.36s
Matriz final com compatibilidade legada: 87 passed in 29.99s
Ruff focal: All checks passed!
mypy focal: Success: no issues found in 9 source files
Django check: System check identified no issues (0 silenced).
Migrations: No changes detected
```

A suíte backend global encontrou `1849 passed, 64 failed in 1118.32s` antes do
alinhamento dos três testes legados da R10. A reexecução exclusiva dos failures
confirmou os três casos corrigidos e deixou `61 failed, 398 deselected in 43.80s`.
As 61 falhas residuais estão fora do diff da R10 e permanecem registradas para a
etapa separada de saneamento global. Da mesma forma, os gates globais registram
`474` erros Ruff e `29` erros mypy em catálogo e PDV; os gates focais da R10 estão
limpos, mas esses resultados globais não são declarados como sucesso.

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
