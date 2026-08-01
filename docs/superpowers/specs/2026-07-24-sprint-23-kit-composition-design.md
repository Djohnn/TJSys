# Sprint 23 — Composição de Kit e Baixa Automática de Estoque — Design

## 1. Objetivo

Implementar a decisão D1 (deixada em aberto no design da Sprint 22) de forma completa:
permitir que um produto seja vendido como **kit**, composto por outros produtos, e que a
venda de um kit gere baixa de estoque de cada produto componente na quantidade correta —
sem o kit possuir saldo de estoque próprio.

Esta sprint depende da Sprint 22 estar concluída, pois reutiliza o campo `product_kind`
ali criado (valor `kit` passa a ativar composição real, em vez de ser apenas rótulo).

## 2. Escopo

Inclui:

- modelo de composição de kit (`ProductComposition`): produto-kit, produto-componente e
  quantidade necessária por unidade de kit vendida;
- validação de ausência de ciclos (um kit não pode compor a si mesmo, direta ou
  indiretamente);
- versionamento da composição, seguindo o mesmo princípio já aplicado a `ProductUnit`:
  composição usada por uma venda concluída não pode ser alterada retroativamente — uma
  mudança cria nova versão;
- resolução da composição no momento da venda: ao concluir uma venda com item de kit, o
  sistema decompõe em movimentos de estoque para cada componente, na quantidade vendida
  multiplicada pelo fator de composição;
- validação de estoque suficiente de **todos os componentes** antes de confirmar a venda,
  com falha atômica (nenhum componente é baixado se qualquer um estiver insuficiente);
- preço do kit continua independente (mesmo modelo `ProductPrice` já existente),
  sem cálculo automático a partir da soma dos componentes;
- telas de cadastro de composição no Catálogo e exibição de "produto é kit" na venda.

Não inclui:

- kit pré-montado com saldo de estoque próprio (produção/montagem antecipada) — ver
  decisão D-KIT-1;
- kit composto por outro kit (composição aninhada) — ver decisão D-KIT-2;
- cálculo automático de preço do kit a partir dos componentes;
- qualquer alteração em Compras, Caixa ou Fiscal além do necessário para refletir a
  baixa de estoque dos componentes.

## 3. Decisões pendentes (bloqueantes)

| ID | Conflito / questão | Opções | Decisão recomendada | Justificativa | Aprovador |
|---|---|---|---|---|---|
| D-KIT-1 | Kit deve ter saldo de estoque próprio (montado com antecedência) ou é sempre decomposto no momento da venda? | (a) somente virtual: kit nunca tem saldo próprio, sempre decompõe na venda; (b) kit pode ser pré-montado e ter saldo próprio, com processo de montagem/produção separado | **(a)** | Corresponde exatamente ao pedido original ("vender kit baixa 3 produtos"); monta-a-antecedência é um processo de produção/montagem com necessidades próprias (ordem de produção, mão de obra, perda) que merece descoberta e sprint dedicadas se vier a ser necessário. | Aprovado (usuário, 2026-07-24) |
| D-KIT-2 | Um kit pode conter outro kit como componente? | (a) não permitir (apenas produtos simples como componente); (b) permitir composição aninhada com resolução recursiva | **(a)** | Evita ciclos e resolução recursiva complexa antes de existir necessidade real comprovada; mesmo princípio de "não criar abstração sem regra real" já usado no DDD. | Aprovado (usuário, 2026-07-24) |
| D-KIT-3 | Estoque insuficiente em um dos componentes: bloquear a venda inteira ou vender parcialmente? | (a) bloquear a venda inteira, atomicamente; (b) permitir venda parcial dos componentes disponíveis | **(a)** | Consistente com a invariante "Venda concluída não é editada" e com o padrão já usado em Compras/Recebimento (over-receipt é erro, não parcial silencioso); evita estoque negativo ou inconsistência entre item vendido e baixa real. | Aprovado (usuário, 2026-07-24) |
| D-KIT-4 | Composição pode ser alterada livremente a qualquer momento? | (a) versionar como `ProductUnit` — composição usada por venda concluída é imutável, mudança gera nova versão; (b) permitir edição livre, sem histórico | **(a)** | Sem versionamento, uma venda antiga passaria a "mentir" sobre quais produtos foram efetivamente baixados caso a composição mude depois; auditoria e reconstrução de histórico ficariam impossíveis. | Aprovado (usuário, 2026-07-24) |
| D-KIT-5 | Onde vive a lógica de decomposição (gerar movimentos de estoque a partir da composição)? | (a) `Inventory` consome `SaleCompleted`, consulta a composição via contrato público do `Catalog`, e gera um movimento por componente; (b) `Sales` resolve a composição e já envia itens decompostos para o `Inventory` | **(a)** | Preserva a direção de dependência do DDD (`Inventory` depende de `Catalog`; `Sales` não deveria carregar regra de estoque); mantém `Sales` describendo o que foi vendido (o kit), e `Inventory` responsável por como isso afeta saldo. | Aprovado (usuário, 2026-07-24) |

**Gate de execução:** todas as decisões acima estão aprovadas conforme a recomendação
técnica registrada nesta tabela. O Task 1 do plano de implementação está liberado para
início.

## 4. Arquitetura

Nenhum módulo novo. Impacto em três bounded contexts existentes:

- **Catalog:** novo agregado `ProductComposition`, dono da estrutura kit → componentes e
  do versionamento. Expõe contrato de leitura (`resolve_composition(product_id, at)`) para
  outros módulos, sem expor persistência interna.
- **Sales:** nenhuma mudança de modelo. Ao concluir uma venda com item de kit, publica
  `SaleCompleted` como já faz hoje — o item de venda referencia o produto-kit, não os
  componentes.
- **Inventory:** consome `SaleCompleted` (contrato já existente do fluxo de venda),
  identifica itens cujo produto é kit, chama o contrato de resolução do Catalog e gera um
  `StockMovement` de saída por componente, referenciando a versão de composição aplicada.

## 5. Modelo de domínio

### 5.1 ProductComposition (novo agregado, Catalog)

- kit (FK para `Product` com `product_kind = kit`), componente (FK para `Product` sem
  `product_kind = kit`, ver D-KIT-2), quantidade (decimal positiva), versão, vigência
  (início/fim, mesmo padrão de `ProductPrice`/`ProductUnit`);
- validação de ciclo: componente não pode ser, direta ou indiretamente, o próprio kit;
- composição usada por venda concluída não é alterada; nova composição é nova versão
  (D-KIT-4);
- kit sem nenhuma composição ativa não pode ser vendido (erro de validação na venda).

### 5.2 Product (campo já existente na Sprint 22)

- `product_kind = kit` passa a ativar a exigência de ao menos uma `ProductComposition`
  ativa antes de o produto poder ser incluído em uma venda.
- Kit não recebe `tracks_inventory = true` (D-KIT-1): kit nunca tem saldo próprio.

### 5.3 Fluxo de venda com kit

1. Item de venda referencia o produto-kit e quantidade vendida (fluxo inalterado de
   `Sales`).
2. `Sales` conclui a venda e publica `SaleCompleted` (inalterado).
3. `Inventory` consome o evento; para cada item cujo produto é kit, resolve a composição
   vigente no instante da venda via Catalog.
4. `Inventory` valida saldo suficiente de cada componente (quantidade vendida × fator de
   composição). Se qualquer componente for insuficiente, toda a decomposição falha
   atomicamente e o erro é reportado ao chamador (D-KIT-3).
5. Se todos os componentes têm saldo suficiente, `Inventory` gera um `StockMovement` de
   saída por componente, referenciando o kit, a venda e a versão de composição aplicada.
6. Nenhum `StockMovement` é gerado para o kit em si.

### 5.4 Invariantes adicionais

- Quantidade de composição é decimal positiva, sem `float` (mesma regra geral do DDD).
- Evento de decomposição é idempotente por `SaleCompleted.event_id` — reprocessamento do
  mesmo evento não duplica movimentos (mesma disciplina de idempotência já usada em
  Outbox/PDV).
- Kit não pode compor outro kit (D-KIT-2, se aprovada essa opção).

## 6. Autorização

Reaproveita `catalog.manage` para criar/editar composição. Nenhuma capability nova
prevista.

## 7. API

Extensão do Catalog:

- `/products/{id}/composition/` — listar, criar e versionar composição (somente para
  produtos com `product_kind = kit`);
- erro `kit_without_active_composition` ao tentar vender kit sem composição vigente;
- erro `insufficient_component_stock` ao tentar concluir venda com componente
  insuficiente, incluindo lista de componentes afetados no corpo `errors`.

Nenhuma mudança de contrato em `Sales`; a resolução acontece inteiramente do lado do
`Inventory` ao consumir `SaleCompleted`.

## 8. Transações, auditoria e eventos

- Novo evento Outbox: `catalog.product.composition_changed`, publicado na mesma
  transação de criação/versionamento da composição.
- Geração dos `StockMovement`s de componentes ocorre em `transaction.atomic()` único: ou
  todos os componentes são baixados, ou nenhum é (D-KIT-3).
- Auditoria registra a resolução de composição aplicada a cada venda (kit, versão de
  composição, componentes e quantidades baixadas), para reconstrução de histórico.

## 9. Qualidade e segurança

- testes unitários de: detecção de ciclo, versionamento de composição, cálculo de
  quantidade por componente, rejeição de kit sem composição ativa;
- testes de integração para o fluxo completo venda → decomposição → movimentos de
  estoque, incluindo caso de componente insuficiente (falha atômica) e reprocessamento
  idempotente do mesmo evento;
- testes cross-tenant e RLS para o novo agregado `ProductComposition`;
- regressão completa das Sprints 0–22, com atenção especial à Sprint 3/4 (estoque e
  vendas) e Sprint 22 (campo `product_kind`).

## 10. Critérios de aceite

- todas as decisões D-KIT-1 a D-KIT-5 estão registradas com aprovador antes do início do
  Task 1;
- vender um kit gera exatamente um `StockMovement` de saída por componente, na
  quantidade correta, e nenhum movimento para o kit em si;
- venda de kit com qualquer componente insuficiente falha atomicamente, sem baixa
  parcial;
- alterar a composição de um kit não afeta a leitura de vendas já concluídas;
- reenvio do mesmo `SaleCompleted` não duplica movimentos de estoque;
- suíte completa e regressão das Sprints 0–22 aprovadas sem falhas.

## 11. Histórico

| Versão | Data | Alteração |
|---|---|---|
| 0.1.0 | 2026-07-24 | Design inicial da composição de kit, endereçando D1 da Sprint 22. |
