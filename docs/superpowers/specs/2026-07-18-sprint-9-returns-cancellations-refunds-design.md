# Sprint 9 — Devoluções, Cancelamentos e Estornos Design

## Objetivo

Completar o ciclo pós-venda do TJSys com devolução parcial/total, cancelamento de venda, reentrada de estoque, reflexo em caixa/pagamentos e integração com estado fiscal quando aplicável.

## Escopo

A Sprint 9 trata correções posteriores a uma venda confirmada. Venda continua imutável; qualquer correção gera fato compensatório auditável.

## Arquitetura

Adicionar serviços transacionais no contexto `sales` e, quando necessário, colaboração explícita com `inventory`, `cash`/movimentos de caixa e `fiscal`.

Fluxo base:

1. operador solicita devolução ou cancelamento;
2. sistema valida venda, itens, quantidades já devolvidas, caixa e estado fiscal;
3. cria `Return`/`ReturnItem` ou `SaleCancellation`;
4. gera movimento de estoque de entrada ou reversão da operação de saída;
5. registra reembolso/estorno conforme método original;
6. solicita cancelamento fiscal quando permitido;
7. emite auditoria e Outbox.

## Regras de negócio

- Venda confirmada não é editada.
- Devolução parcial não cancela a venda inteira.
- Item não pode ser devolvido acima da quantidade vendida líquida.
- Reembolso em dinheiro gera saída de caixa quando houver caixa aberto autorizado.
- Pix/cartão externo registram estorno operacional sem assumir integração real.
- Cartão integrado futuro deve usar adapter próprio.
- NFC-e autorizada pode exigir cancelamento fiscal dentro do prazo legal; fora disso, registrar pendência de tratamento fiscal.
- Reentrada de estoque usa operação auditável e idempotente.

## Modelos previstos

- `SaleReturn`
- `SaleReturnItem`
- `SaleRefund`
- `SaleCancellation`
- vínculo opcional com `FiscalDocument`

## APIs previstas

- `POST /api/v1/sales/{id}/returns/`
- `POST /api/v1/sales/{id}/cancel/`
- `GET /api/v1/sales/{id}/returns/`
- `GET /api/v1/sale-refunds/`

## Fora do escopo

- Integração real com operadoras de cartão para estorno automático.
- Nota de entrada fiscal completa para todo cenário de devolução.
- Regras estaduais avançadas além do contrato com `FiscalProvider`.
- Troca por outro produto no mesmo fluxo.

## Critérios de aceite

- Devolução parcial baixa saldo devolvível e reentra estoque.
- Devolução total reentra todos os itens válidos.
- Reembolso em dinheiro impacta caixa.
- Estorno Pix/cartão fica rastreável sem alterar dinheiro físico.
- Cancelamento idempotente não duplica estoque, caixa ou fiscal.
- Cross-tenant é bloqueado por API e serviço.
