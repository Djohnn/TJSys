# Sprint 22 — Refatoração do Catálogo — Design

## 1. Objetivo

Estender o modelo de catálogo entregue na Sprint 2 (e consumido pela Sprint 18) para
cobrir atributos comerciais adicionais de produto — atributos descritivos, tipo de item,
tabela de preço por quantidade, dados fiscais de cadastro e sinalização de controle de
estoque — sem quebrar contratos, eventos ou dados já existentes.

Esta sprint é de **refatoração aditiva**: nenhuma entidade, endpoint ou evento do modelo
atual é removido. Extensões são adicionadas ao lado do que já existe, respeitando as
invariantes fixadas em DDD-001 e SAD-001.

## 2. Escopo

Inclui:

- decisão e registro formal dos pontos de conflito abertos (Seção 3);
- extensão do agregado `Product` com atributos descritivos adicionais aprovados;
- modelo de tabela de preço por quantidade mínima (D2=aprovado);
- modelo de dado cadastral fiscal do produto (D3=aprovado);
- flag de controle de estoque no produto (D4=aprovado como flag de leitura);
- migrações backward-compatible e atualização de OpenAPI/tipos gerados;
- atualização de `ProductForm.tsx`/`catalogSchemas.ts`.

Não inclui:

- composição de kit/variante complexa como agregado novo (D1=só rótulo);
- qualquer lógica de saldo, movimento ou reserva de estoque;
- emissão fiscal/processo `Fiscal`;
- promoções, tabelas comerciais além da extensão aprovada.

## 3. Decisões pendentes (resolvidas nesta sprint)

| ID | Conflito | Opções | Decisão recomendada | Justificativa | Aprovador |
|---|---|---|---|---|---|
| D1 | `tipo: kit, insumo, brinde` não existe no modelo (Sprint 2 exclui kit/composição) | (a) campo simples `product_kind` sem composição real; (b) agregado completo; (c) adiar | **(a)** — `product_kind` é só rótulo/classificação. Se "kit" precisar baixar estoque dos componentes, isto exige sprint dedicada com `Inventory`/`Sales`. | Atende a necessidade imediata de classificar/filtrar sem inventar feature de composição não coberta pela arquitetura atual. | qa-expert |
| D2 | Preço de atacado por quantidade mínima e custo não existem em `ProductPrice` (que é só vigência/filial) | (a) nova tabela `ProductPriceTier` associada a `ProductPrice`; (b) campo `cost` isolado sem versionamento; (c) adiar | **(a)** — `ProductPriceTier` segue vigência/filial já existente e considera quantidade; o usuário optou por (a) em ambos. | Preço de venda deve seguir a disciplina de vigência/filial (auditoria, histórico). | qa-expert |
| D3 | Dado cadastral fiscal (NCM, CEST, origem, classificação) não existe no Catalog nem no `Fiscal` | (a) novo submodelo `ProductFiscalData` dentro de Catalog; (b) campo direto em `Product`; (c) confirmar módulo não revisado antes de criar | **(a)** — `ProductFiscalData` 1:1 com Product via FK | Dado cadastral pertence à identidade comercial do produto (Catalog), não ao evento de emissão fiscal (Fiscal). Casa com a regra da Sprint 18 de não bloquear edição não-fiscal. | qa-expert |
| D4 | Controle de estoque foi desenhado como parte do cadastro, mas Sprint 2 não acopla estoque ao Catalog | (a) flag `tracks_inventory` em Product; (b) tela de estoque em Inventory, Catalog linka | **(a)** — flag simples `tracks_inventory` | Preserva direção de dependência (Inventory depende de Catalog), sem duplicar lógica de saldo/movimento. | qa-expert |
| D5 | Marca, modelo, tag, código de balança não existem em nenhuma entidade | (a) campos simples em `Product`; (b) `Marca` como entidade própria | **(a)** — `brand` (str), `model` (str), `tags` (lista), `scale_code` (str) | Não criar abstração sem regra real comprovada; promover `brand` para entidade depois é barato caso surja necessidade. | qa-expert |
| D6 | Unidade foi desenhada como enum fixo, mas `Unit` já é entidade configurável por tenant | Confirmar: manter `Unit` como está; cadastro de produto passa a **selecionar** uma `Unit` existente | Resolvido nesta sprint | Reaproveita modelo existente e testado desde a Sprint 2. | — |
| D7 | Sub-categoria foi desenhada como campo separado, mas `Category` já é hierárquica | Confirmar: usar `Category.parent`; não criar campo novo | Resolvido nesta sprint | Reaproveita modelo existente e testado desde a Sprint 2. | — |

## 4. Arquitetura

Toda extensão permanece dentro do bounded context `Catalog` (DDD-001), exceto o flag `tracks_inventory` (escrito em Catalog e lido por `Inventory` via contrato público).

`Fiscal` continua responsável apenas pelo documento emitido (`FiscalDocument`); o dado cadastral fiscal do produto (D3) é atributo do Catalog.

## 5. Modelo de domínio (extensões)

### 5.1 Product (campos adicionais — D1, D4, D5)

- `product_kind` (str, opcional, valores: `insumo`, `revenda`, `servico`, `brinde`, `kit` — rótulo, sem regra de composição);
- `tracks_inventory` (bool, default `True` — flag consumido por `Inventory`);
- `brand` (str, opcional);
- `model` (str, opcional);
- `tags` (JSONField lista de strings, opcional);
- `scale_code` (str, opcional, código de balança).

### 5.2 ProductFiscalData (novo submodelo — D3)

- produto (FK 1:1), `fiscal_type`, `ncm` (8 dígitos), `cest`, `origin_code` (0–8), `fiscal_class`;
- alterações auditadas e publicadas via Outbox (`catalog.product.fiscal_data_updated`);
- ausência deste registro não bloqueia edição não-fiscal (regra Sprint 18).

### 5.3 ProductPriceTier (novo submodelo — D2)

- produto, `ProductPrice` de referência, `min_quantity` (Decimal), `amount` (Decimal);
- períodos não sobrepostos dentro do mesmo escopo (mesma regra de `ProductPrice`);
- resolução de preço passa a considerar `min_quantity` → tier mais alto cuja `min_quantity ≤ quantidade`.

### 5.4 Invariantes adicionais

- Nenhum campo novo aceita `float` para dinheiro ou quantidade — mesma regra do DDD-001.
- `ProductFiscalData` e `ProductPriceTier` seguem o mesmo padrão de auditoria e Outbox do Catalog.
- Produto inativo não aceita criação de novo tier de preço ou dado fiscal.

## 6. Autorização

Reaproveita `catalog.manage` e `pricing.manage` já existentes (Sprint 2). Nenhuma capability nova prevista.

## 7. API

Extensão do endpoint `/api/v1/products/{id}/` com PATCH suportando os novos campos opcionais. Novos subrecursos:

- `/products/{id}/fiscal-data/` (D3);
- `/products/{id}/price-tiers/` (D2, com `POST`, `GET`, `DELETE` para{mg item}).

Erros novos seguem RFC 9457 com códigos `invalid_price_tier_quantity`, `duplicate_fiscal_data`.

## 8. Outbox events

- `catalog.product.fiscal_data_updated` (D3);
- `catalog.product.price_tier_added` (D2).

## 9. Qualidade e segurança

- testes unitários para cada campo/submodelo novo;
- testes de API para novos subrecursos, incluindo RLS e cross-tenant;
- regressão completa das Sprints 2 e 18 (nenhum contrato existente pode quebrar);
- migrations backward-compatible.

## 10. Critérios de aceite

- D1–D5 com aprovador registrado;
- produto existente continua válido sem campos novos preenchidos;
- estoque continua em `Inventory`; Catalog apenas expõe `tracks_inventory`;
- dado fiscal não bloqueia edição não-fiscal;
- suíte completa (Sprints 0–21) + regressão Sprint 2/18 sem falhas.

## 11. Histórico

| Versão | Data | Alteração |
|---|---|---|
| 0.1.0 | 2026-07-24 | Design inicial da refatoração do catálogo. |
| 0.2.0 | 2026-07-24 | Decisões D1–D5 registradas com aprovador qa-expert. |
