# Especificação — Fluxo universal de produto, preço, estoque e PDV

**Data:** 2026-08-08  
**Status:** Aprovada para planejamento  
**Escopo:** Catálogo web, imagens, preço-base, estoque, catálogo do PDV, venda e apresentação de quantidades

## 1. Contexto

O teste manual criou o produto `QA-PDV-20260808-001` com controle de estoque e saldo inicial de 10 unidades. O produto foi persistido e apareceu em saldos como `10.000000`, mas o editor quebrou logo após a criação:

```text
TypeError: images.filter is not a function
at ProductMediaPanel.tsx:61
```

A API de imagens usa a paginação padrão do catálogo, enquanto `fetchProductImages` declara que sempre receberá um array. A quebra impede acessar a etapa de preços. Além disso, a tela atual manipula faixas de preço, mas a lista de produtos e o PDV resolvem o preço-base efetivo em `ProductPrice`. Assim, corrigir apenas o `.filter()` não garante que um produto genérico fique vendável.

Esta especificação corrige o contrato para qualquer produto aplicável, sem depender de SKU, seed ou tenant específico.

## 2. Objetivo

Garantir o fluxo determinístico:

```text
Criar produto
  → persistir identidade e estoque inicial
  → continuar em URL estável de edição
  → cadastrar preço-base efetivo
  → opcionalmente cadastrar faixas por quantidade
  → localizar o produto no PDV
  → vender
  → baixar estoque quando aplicável
  → apresentar a quantidade conforme a unidade
```

## 3. Escopo funcional

### 3.1 Incluído

- Normalização das respostas paginadas da galeria de imagens.
- Isolamento do erro da galeria para que ele não derrube o editor.
- Continuidade do editor após a criação, com URL persistente contendo o ID.
- Cadastro e atualização de preço-base efetivo.
- Faixas por quantidade opcionais, vinculadas ao preço-base.
- Contrato explícito para produtos sem preço.
- Pesquisa e venda no PDV de qualquer produto ativo e precificado.
- Baixa transacional para produtos que controlam estoque.
- Ausência de movimento para produtos que não controlam estoque.
- Formatação de quantidade baseada na unidade do produto.
- Testes unitários, de API, integração e E2E do fluxo completo.

### 3.2 Fora do escopo

- Mudança de identidade visual do catálogo ou PDV.
- Conversão automática entre embalagens diferentes.
- Cálculo fiscal, emissão NFC-e ou impressão além da exibição correta da quantidade.
- Alteração retroativa de vendas concluídas.
- Reescrita geral dos modelos de catálogo e estoque.

## 4. Decisões de arquitetura

### 4.1 Imagens: manter paginação e normalizar no cliente

O backend continuará retornando a coleção de imagens conforme o contrato paginado do catálogo. O cliente aceitará explicitamente:

```ts
type ProductImagesResponse = PaginatedResponse<ProductImage> | ProductImage[]
```

`fetchProductImages` converterá qualquer uma das formas válidas para `ProductImage[]`. Resposta malformada produzirá erro de domínio controlado; o componente exibirá a mensagem dentro do painel de mídia e o restante do editor continuará utilizável.

O componente não chamará `.filter()`, `.map()` ou spread antes de garantir que o valor é um array.

### 4.2 Editor: produto criado passa a ter endereço estável

Após `applyProduct` retornar sucesso, o frontend navegará com `replace` para:

```text
/catalog/products/{productId}/edit
```

O editor carregará o produto persistido e habilitará as etapas. A identificação não dependerá de `createdProductId` mantido apenas em memória. Recarregar a página ou voltar da etapa de preços não perderá o contexto.

O sucesso da criação não dependerá do upload de imagem ou do cadastro do código de barras. Falhas não bloqueantes serão exibidas de forma específica, sem apagar o ID já criado.

### 4.3 Preço: uma fonte principal e faixas opcionais

`ProductPrice` será a fonte do preço-base efetivo exibido na lista de produtos e no PDV. A etapa “Preços” terá duas áreas:

1. **Preço-base:** valor, vigência inicial, vigência final opcional e status.
2. **Faixas por quantidade:** opcionais e vinculadas ao preço-base selecionado.

O preço-base deve existir e estar ativo para a faixa ser criada. O frontend enviará o ID de `ProductPrice` ao criar `ProductPriceTier`; não inferirá nem duplicará esse relacionamento.

O resolvedor de preço seguirá a precedência já definida pelo domínio. Esta correção não criará um segundo algoritmo no PDV.

### 4.4 Produtos sem preço

Produtos ativos sem preço efetivo continuarão visíveis nas interfaces administrativas. No PDV, poderão aparecer na pesquisa com o estado “Sem preço”, mas não poderão ser adicionados ao carrinho.

É proibido converter preço ausente em zero silenciosamente. A interface mostrará:

```text
Produto sem preço de venda vigente.
```

### 4.5 Estoque e venda

- Produto com `tracks_inventory=true`: a confirmação da venda deve validar e baixar o saldo na mesma transação.
- Produto com `tracks_inventory=false`: a venda não cria movimento nem altera saldo.
- Produto indivisível: quantidade fracionada será rejeitada antes da confirmação.
- Saldo insuficiente e estoque negativo não permitido: resposta `409` com problema de domínio claro.
- Falha de estoque não poderá deixar venda confirmada ou pagamento persistido parcialmente.
- Repetição da mesma requisição com a mesma chave de idempotência não causará segunda baixa.

## 5. Formatação universal de quantidades

### 5.1 Princípio

O banco continuará usando `Decimal` com a precisão necessária. A apresentação removerá zeros irrelevantes conforme a unidade. A formatação não alterará o valor persistido nem será usada para cálculos.

Uma única função compartilhada no frontend web definirá a representação administrativa. O PDV terá uma implementação equivalente coberta pelo mesmo conjunto de casos contratuais. Nenhuma tela deverá aplicar `toFixed()` diretamente para quantidade de domínio.

### 5.2 Unidades indivisíveis

Produtos vendidos por unidade, peça ou outra unidade indivisível aceitarão somente inteiros.

| Valor armazenado | Exibição |
|---:|---:|
| `0.000000` | `0` |
| `10.000000` | `10` |
| `100.000000` | `100` |
| `101.000000` | `101` |
| `1000.000000` | `1000` |

Entradas como `1.5` serão rejeitadas para unidades indivisíveis.

### 5.3 Quilogramas

Produtos cuja unidade de medida seja quilograma aceitarão até três casas decimais na interface.

| Valor armazenado | Exibição |
|---:|---:|
| `0.000000` | `0kg` |
| `0.500000` | `0.500kg` |
| `1.000000` | `1kg` |
| `1.250000` | `1.250kg` |
| `10.000000` | `10kg` |

Frações significativas serão preservadas com três casas. Valores inteiros não terão sufixo decimal. A aplicação não converterá automaticamente `0.500kg` para gramas.

### 5.4 Metadado da unidade

A decisão entre quantidade inteira e fracionada não dependerá do nome visível digitado livremente. A unidade deve expor metadado estável de código/tipo e precisão, por exemplo:

```json
{
  "code": "KG",
  "decimal_places": 3,
  "is_fractional": true
}
```

Para unidades legadas sem metadado, a regra conservadora será não alterar validações existentes e remover apenas zeros finais na apresentação. A migração de dados preencherá os metadados conhecidos sem renomear unidades do cliente.

### 5.5 Superfícies obrigatórias

A mesma regra deverá aparecer em:

- formulário e resumo do produto;
- saldo e movimentos de estoque;
- recebimento e ajustes;
- pesquisa e carrinho do PDV;
- confirmação da venda;
- comprovante não fiscal;
- tabelas administrativas que exibem quantidade.

## 6. Fluxo de dados

### 6.1 Cadastro

1. Usuário informa identidade e configuração de estoque.
2. Frontend valida quantidade conforme a unidade.
3. `applyProduct` cria produto, política, saldo e movimento inicial de forma idempotente.
4. Frontend recebe o ID e navega para a URL de edição.
5. Galeria consulta imagens; paginação é normalizada.
6. Usuário cadastra o preço-base.
7. Produto passa a ter preço efetivo consumível pelo PDV.

### 6.2 Venda

1. PDV pesquisa o produto no backend usando o tenant e dispositivo autenticados.
2. Resposta contém preço efetivo ou estado explícito sem preço.
3. PDV valida a precisão da quantidade conforme a unidade.
4. Confirmação envia itens e pagamentos com chave de idempotência.
5. Backend confirma venda, pagamento e baixa de estoque numa transação.
6. Resposta e telas formatam a quantidade conforme esta especificação.

## 7. Tratamento de erros

| Situação | Comportamento |
|---|---|
| Imagens paginadas | Normalizar para array e renderizar normalmente |
| Resposta de imagens inválida | Mensagem no painel; editor permanece funcional |
| Upload falha | Remover preview temporário e permitir nova tentativa |
| Produto criado, código de barras falha | Preservar produto e informar falha específica |
| Preço-base inválido | Manter etapa aberta e destacar campos |
| Produto sem preço no PDV | Mostrar “Sem preço” e bloquear inclusão |
| Fração em unidade indivisível | Rejeitar com mensagem de precisão da unidade |
| Saldo insuficiente | `409`, sem venda ou pagamento parcial |
| Requisição repetida | Retornar resultado idempotente, sem nova baixa |

## 8. Estratégia de testes

### 8.1 Frontend web

- `fetchProductImages` com array legado, página com `results`, página vazia e payload inválido.
- `ProductMediaPanel` não derruba o editor quando a consulta falha.
- Criação navega para URL de edição e libera “Preços”.
- Preço-base é criado e atualizado antes das faixas.
- Formatação de inteiros e quilogramas em todas as funções compartilhadas.

### 8.2 Backend

- Contrato paginado de imagens e isolamento por tenant.
- CRUD de preço-base com vigência e resolução efetiva.
- Faixa exige preço-base do mesmo produto e tenant.
- Unidade indivisível rejeita fração.
- Quilograma aceita três casas.
- Venda baixa estoque controlado e preserva produto não controlado.
- Saldo insuficiente e idempotência.

### 8.3 PDV

- Pesquisa retorna produto ativo com preço efetivo.
- Produto sem preço fica visível, mas não entra no carrinho.
- Quantidades `10`, `100`, `101`, `1000`, `0.500kg`, `1kg` e `1.250kg` são exibidas corretamente.
- Venda de três unidades calcula total, confirma e exibe quantidade inteira.

### 8.4 E2E

O cenário deve gerar identificadores únicos e executar pela interface:

```gherkin
Dado um produto ativo, unitário, com preço-base e saldo inicial de 10 unidades
Quando o operador localiza o produto no PDV e vende 3 unidades
Então a venda é confirmada com quantidade 3
E o saldo do produto passa a ser 7
E nenhuma quantidade é exibida com zeros decimais irrelevantes
```

Um cenário adicional cobrirá quilogramas:

```gherkin
Dado um produto ativo em quilogramas com saldo de 1.500kg
Quando ocorre uma venda de 1kg
Então o saldo é exibido como 0.500kg
```

## 9. Critérios de aceitação

1. Nenhuma resposta válida de imagens causa `images.filter is not a function`.
2. Falha da galeria não deixa a página do editor em branco.
3. Produto recém-criado continua editável após reload.
4. Preço-base criado na interface é o preço retornado ao PDV.
5. Faixas por quantidade não substituem nem desconectam o preço-base.
6. Produto sem preço nunca é vendido por zero.
7. Qualquer produto ativo, precificado e permitido ao tenant pode ser vendido no PDV.
8. Venda de 3 unidades sobre saldo 10 termina com saldo 7.
9. Produtos indivisíveis exibem inteiros sem casas decimais.
10. Quilogramas seguem exatamente `1kg`, `0.500kg` e `1.250kg`.
11. Venda acima do saldo não produz efeitos parciais.
12. Suites unitárias, de API, integração e E2E passam sem retries artificiais.

## 10. Observabilidade e implantação

- Erros de contrato de coleção deverão registrar endpoint, correlation ID e tipo recebido, sem dados sensíveis.
- Falhas de preço e estoque usarão códigos de domínio pesquisáveis.
- Migrações de unidade deverão ser compatíveis com dados existentes e verificadas antes do deploy.
- O rollout será bloqueado se os testes de catálogo, estoque ou venda falharem.
- Após a implementação, executar `graphify update .` e registrar o resultado da suíte E2E.
