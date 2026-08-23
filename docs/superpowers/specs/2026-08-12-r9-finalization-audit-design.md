# R9 — Auditoria e Fechamento do Pós-venda

**Data:** 2026-08-12

**Base:** `e7a0a8a` (`codex/r8-finalization`)

**Branch:** `codex/r9-finalization`

## Contexto

A implementação original da Sprint 9 está no commit `fd6147f` e já pertence à
ancestralidade da base atual. Ela introduziu devoluções, reembolsos e
cancelamentos, acompanhados por 34 testes focados. Esta etapa não recria a
funcionalidade: audita os critérios de aceite contra o estado consolidado após
a R8, corrige gaps reais e registra evidências reproduzíveis.

## Objetivo

Encerrar tecnicamente a R9 comprovando que correções pós-venda são fatos
compensatórios atômicos, idempotentes, auditáveis e isolados por tenant, sem
alterar os fatos comerciais da venda confirmada.

## Escopo funcional

### Devoluções

- Permitir devolução parcial ou total de itens de venda confirmada.
- Calcular a quantidade devolvível líquida considerando devoluções anteriores.
- Rejeitar quantidade zero, negativa ou superior ao saldo devolvível.
- Reentrar estoque por operação auditável e idempotente.
- Impedir que replay ou concorrência duplique devolução ou estoque.

### Reembolsos

- Dinheiro gera `cash_out` somente com sessão de caixa válida e aberta.
- Pix e cartão externo geram registro operacional rastreável sem movimentar o
  dinheiro físico do caixa.
- Repetição da mesma chave idempotente retorna o mesmo fato; mesma chave com
  payload diferente retorna conflito.
- Valores não positivos e reembolso superior ao permitido são rejeitados.

### Cancelamentos

- Cancelamento total gera fatos compensatórios de estoque e financeiro sem
  apagar ou reescrever a venda original.
- Replay e concorrência não duplicam movimentos, reembolsos ou eventos.
- Uma venda já cancelada ou incompatível com devoluções existentes retorna
  conflito de domínio documentado.
- Cancelamento fiscal permanece explicitamente manual/on-demand. O serviço de
  vendas não deve cancelar NFC-e automaticamente.

## Arquitetura e limites

O agregado de venda permanece no contexto `sales`. `SaleReturn`,
`SaleReturnItem`, `SaleRefund` e `SaleCancellation` representam fatos
compensatórios. Serviços de aplicação coordenam `sales`, `inventory`, caixa,
`audit` e `outbox` dentro de `transaction.atomic`.

Chamadas entre contextos devem usar serviços públicos existentes. A auditoria
pode separar responsabilidades em módulos menores se isso for indispensável
para segurança transacional ou testabilidade, mas não fará refatoração alheia
ao pós-venda.

## API e erros

Rotas existentes permanecem compatíveis:

- `POST /api/v1/sales/{id}/returns/`
- `GET /api/v1/sales/{id}/returns/`
- `POST /api/v1/sales/{id}/cancel/`

Erros de regra devem usar `application/problem+json`, status coerente e código
estável. A API deve exigir autenticação, tenant ativo, capacidade apropriada e
`Idempotency-Key` nos comandos mutáveis. Recursos de outro tenant devem ser
indistinguíveis de recursos inexistentes.

## Auditoria e eventos

Cada operação concluída deve produzir auditoria e Outbox com tenant,
correlation ID, agregado e identificadores suficientes para rastreamento. Uma
transação que falha não pode deixar evento, auditoria, estoque ou caixa parcial.
Replay idempotente não publica eventos duplicados.

## Estratégia de testes

Os 34 testes existentes são o baseline. A auditoria adicionará, quando ausente:

- concorrência com duas requisições para a mesma chave idempotente;
- replay com payload igual e conflito com payload diferente;
- rollback integral após falha em estoque, caixa ou Outbox;
- contagem exata de movimentos, auditorias e eventos;
- isolamento cross-tenant no serviço e na API;
- garantia negativa de que cancelamento fiscal não ocorre automaticamente;
- migrations partindo de schema vazio e `makemigrations --check`.

O nível de teste mais barato será preferido: domínio/serviço antes da API, e
E2E somente se houver uma interface pós-venda versionada e utilizável.

## Gates de aprovação

A R9 poderá ser encerrada quando todos estes gates estiverem verdes:

1. suíte R9 focada sem falhas ou retries ocultando flakiness;
2. suíte backend global sem falhas;
3. Ruff global sem erros;
4. mypy global sem erros;
5. `makemigrations --check --dry-run`, `migrate --check` e Django `check` verdes;
6. testes frontend e E2E pós-venda, se a interface estiver no branch;
7. `git diff --check` sem erros;
8. relatório final atualizado com outputs reais e limitações;
9. commit isolado da R9, sem push.

## Fora do escopo

- Integração automática com adquirentes de cartão.
- Cancelamento automático de NFC-e.
- Nota fiscal de entrada completa para devolução.
- Troca de produto no mesmo fluxo.
- Mudanças de catálogo, compras ou financeiro sem relação direta com os fatos
  compensatórios da R9.

## Resultado esperado

O fechamento autoriza avançar para a R10 quando a implementação pós-venda e os
gates globais estiverem comprovadamente verdes. Limitações externas ou fiscais
serão registradas, nunca convertidas silenciosamente em sucesso.
