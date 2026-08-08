# Sprint 4 — Vendas, Pedidos e Caixa Web Design

## Objetivo

Implementar o primeiro ciclo comercial online do TJSys: venda balcão web com pagamento registrado, baixa imediata de estoque e movimento de caixa na mesma transação.

## Escopo aprovado

A Sprint 4 entrega venda direta de balcão via API Django. O fluxo não depende de PDV Electron, contingência offline, emissão fiscal, maquineta integrada, devolução ou cancelamento; esses itens ficam para sprints futuras.

## Decisão de arquitetura

Criar o app `sales` para concentrar caixa e venda. A venda confirmada será fato imutável e será criada por um serviço transacional que:

1. valida tenant, filial, caixa aberto, itens, preços e pagamentos;
2. cria `Sale`, `SaleItem` e `SalePayment`;
3. chama `inventory.services.create_issue()` para baixar estoque imediatamente;
4. cria `CashMovement` para registrar entrada por forma de pagamento;
5. publica auditoria e Outbox;
6. garante idempotência com `Idempotency-Key`.

## Modelos

- `CashSession`: sessão de caixa por tenant, filial e operador, com status `open` ou `closed`, saldo inicial, saldo esperado e fechamento informado.
- `CashMovement`: movimento imutável de caixa ligado a uma sessão, com tipo `opening`, `sale_payment`, `cash_in`, `cash_out` ou `closing_adjustment`.
- `Sale`: venda balcão confirmada, ligada a tenant, filial, sessão de caixa, operador, idempotência e totais.
- `SaleItem`: item imutável da venda com produto, unidade, fator, quantidade, preço unitário, desconto e operação de estoque gerada.
- `SalePayment`: pagamento registrado da venda por dinheiro, pix, cartão externo ou cartão integrado futuro.

## Regras de negócio

- Não existe venda confirmada sem caixa aberto.
- A Sprint 4 aceita somente venda com pagamento registrado no mesmo request.
- Soma dos pagamentos deve ser igual ao total líquido da venda.
- Estoque é baixado imediatamente na mesma transação da venda.
- Estoque negativo permanece proibido pelo serviço de inventory.
- `Idempotency-Key` é obrigatório para criar venda e abertura/fechamento de caixa.
- Retry com mesma chave e mesmo payload retorna o mesmo recurso.
- Retry com mesma chave e payload diferente retorna conflito.
- Venda confirmada não pode ser alterada ou excluída via API.

## API

- `POST /api/v1/cash-sessions/open/`: abre caixa da filial.
- `POST /api/v1/cash-sessions/{id}/close/`: fecha caixa.
- `GET /api/v1/cash-sessions/current/?branch=<id>`: retorna caixa aberto da filial para o operador.
- `POST /api/v1/sales/counter/`: cria venda balcão confirmada.
- `GET /api/v1/sales/`: lista vendas do tenant.
- `GET /api/v1/sales/{id}/`: consulta venda com itens e pagamentos.

## Fora do escopo

- PDV Electron.
- Offline e sincronização.
- FiscalProvider e NF-e/NFC-e.
- Integração real com maquineta.
- Devolução, cancelamento e estorno.
- Pedido/orçamento como etapa prévia.
- Contas a receber e parcelamento avançado.

## Testes de aceite

- Abrir caixa com idempotência.
- Impedir segundo caixa aberto para mesma filial e operador.
- Criar venda balcão com pagamento exato e baixar estoque.
- Impedir venda sem caixa aberto.
- Impedir venda sem pagamento.
- Impedir venda com pagamento divergente.
- Impedir venda sem estoque.
- Garantir isolamento multi-tenant.
- Garantir retry idempotente e conflito de payload.
- Verificar auditoria e Outbox da venda.
