# Controle de Estoque no Produto e Persistência do Editor

**Data:** 2026-08-01  
**Status:** Aprovada com correções de auditoria em 2026-08-02
**Escopo:** Catálogo de produtos, configuração de estoque, saldo inicial, preços, fiscal e canais

## 1. Contexto

O editor atual permite cadastrar a identificação do produto e habilita as etapas Preços, Estoque, Fiscal, Composição e Canais. O teste manual no navegador confirmou a persistência da identificação, categoria e marca, mas revelou quatro lacunas:

1. A etapa Identificação não expõe claramente a opção **Controlar estoque**.
2. A etapa Estoque mostra apenas um saldo indefinido (`--`) e um link para o módulo de Inventário.
3. Preços, dados fiscais e canais não oferecem confirmação ou erro confiável após uma tentativa de gravação.
4. Não existe configuração operacional de estoque mínimo, máximo, ponto de reposição ou política de saldo negativo por produto e local.

## 2. Objetivo

Quando o usuário marcar **Controlar estoque**, o cadastro deverá coletar os dados necessários para integrar o produto ao módulo de Inventário. A quantidade atual será derivada exclusivamente das movimentações de estoque. Uma quantidade inicial informada no cadastro produzirá uma movimentação auditável de entrada, nunca uma alteração direta do saldo.

O mesmo ciclo deve tornar explícito o sucesso ou a falha das gravações de preço, fiscal e canais.

## 3. Decisões aprovadas

- A quantidade atual não será armazenada no produto nem editada diretamente.
- O saldo continuará sendo a soma das movimentações mantidas pelo módulo de Inventário.
- Uma quantidade inicial maior que zero exigirá filial e local de estoque e criará uma operação de entrada com motivo `Estoque inicial do produto`.
- Os limites de estoque serão configurados por combinação de produto, filial e local.
- Serviços não poderão controlar estoque.
- Desmarcar o controle de estoque não apagará movimentos nem saldos históricos.
- A primeira entrega não incluirá previsão de demanda, compra automática ou múltiplos fornecedores.

## 4. Experiência do usuário

### 4.1 Etapa Identificação

O formulário exibirá o controle **Controlar estoque** para produtos que não sejam serviços. Quando desmarcado, os campos operacionais permanecerão ocultos.

Ao marcar o controle, será aberto o bloco **Configuração inicial de estoque** com:

| Campo | Regra |
|---|---|
| Filial | Obrigatória; selecionar entre as filiais às quais o usuário tem acesso |
| Local de estoque | Obrigatório; filtrado pela filial selecionada |
| Quantidade atual | Somente leitura; `0` para produto novo e saldo agregado para produto existente |
| Quantidade inicial | Decimal maior ou igual a zero; padrão `0` |
| Quantidade mínima | Decimal maior ou igual a zero; padrão `0` |
| Quantidade máxima | Decimal opcional; quando informada, deve ser maior ou igual à mínima |
| Ponto de reposição | Decimal maior ou igual a zero; padrão igual à quantidade mínima |
| Permitir estoque negativo | Booleano; padrão `false` |

Ao trocar a filial, o local será limpo. Ao desmarcar **Controlar estoque**, os valores não serão enviados, mas permanecerão no estado do formulário até o usuário sair da tela, evitando perda acidental durante a edição.

### 4.2 Salvamento atômico

Para produto novo, o frontend enviará um único comando de aplicação contendo identificação e configuração inicial. O backend executará em uma transação:

1. criar o produto;
2. criar a configuração de estoque por filial/local;
3. quando `initial_quantity > 0`, criar uma operação e um movimento de entrada;
4. atualizar o saldo por meio do serviço normal de Inventário;
5. registrar eventos de auditoria/outbox.

Se qualquer etapa falhar, nenhuma parte do comando será persistida. O frontend manterá os dados preenchidos e mostrará o erro associado ao campo ou à operação.

### 4.3 Etapa Estoque

A etapa Estoque deixará de ser apenas um redirecionamento e mostrará:

- Filial e local selecionados.
- Quantidade atual.
- Quantidade reservada.
- Quantidade disponível.
- Quantidade mínima.
- Quantidade máxima, quando configurada.
- Ponto de reposição.
- Situação: **Normal**, **Estoque baixo**, **Zerado** ou **Negativo**.
- Data e origem da última movimentação.
- Ação **Ajustar estoque**, direcionando ao fluxo auditável do Inventário com produto, filial e local preenchidos.
- Ação **Ver movimentações**, com os mesmos filtros aplicados.

A configuração poderá ser editada nessa etapa. Alterar mínimo, máximo ou ponto de reposição não criará movimento. Alterar quantidade atual somente será possível pelo fluxo de ajuste do Inventário.

### 4.4 Preços, fiscal e canais

Todas as mutações deverão ter estados explícitos:

- botão desabilitado e rótulo de processamento enquanto a requisição estiver pendente;
- confirmação visível após persistência;
- erro `role="alert"` com mensagem do backend em falhas de validação;
- invalidação e nova consulta da chave correta do React Query após sucesso;
- o item só poderá aparecer na interface depois da resposta persistida do backend.

Preços devem exibir a faixa criada na tabela. Fiscal deve recarregar os valores salvos. Canais devem exibir o perfil persistido e seu estado real.

## 5. Modelo de domínio

### 5.1 Nova entidade `ProductStockPolicy`

Entidade pertencente ao app `inventory`, pois representa política operacional e não classificação comercial.

| Campo | Tipo/regra |
|---|---|
| `id` | UUID |
| `tenant` | tenant obrigatório |
| `product` | produto obrigatório |
| `branch` | filial obrigatória |
| `location` | local obrigatório e pertencente à filial/tenant |
| `minimum_quantity` | decimal 18,6; mínimo zero |
| `maximum_quantity` | decimal 18,6; nulo ou maior/igual ao mínimo |
| `reorder_point` | decimal 18,6; mínimo zero |
| `allow_negative` | booleano; padrão falso |
| `is_active` | booleano; padrão verdadeiro |
| `version` | controle otimista |
| timestamps | criação e atualização |

Restrição única: `(tenant, product, branch, location)`.

Validações:

- produto, filial e local devem pertencer ao mesmo tenant;
- o local deve pertencer à filial;
- serviços são rejeitados;
- `maximum_quantity`, quando presente, não pode ser menor que `minimum_quantity`;
- `reorder_point` não pode ser negativo.

### 5.2 Quantidade inicial

`initial_quantity` é um campo de comando e não integra `ProductStockPolicy`. Após o comando ser executado, a fonte de verdade será `StockMovement`/`StockBalance`.

A operação deverá usar uma chave idempotente derivada do comando de criação para impedir saldo duplicado em repetição de requisição.

### 5.3 Comando idempotente

`command_id` identifica o comando inteiro, e não somente a movimentação. O backend armazenará, por tenant, o identificador, o hash canônico do payload, o estado e a resposta persistida.

- A primeira requisição executa produto, política, entrada, auditoria e outbox na mesma transação.
- Uma repetição com o mesmo `command_id` e o mesmo hash retorna a resposta original, sem novas gravações.
- O mesmo `command_id` com payload diferente retorna `409 COMMAND_PAYLOAD_MISMATCH`.
- Uma falha transacional não deixa um comando concluído nem uma resposta parcial.

## 6. Contratos de API

### 6.1 Aplicar produto com estoque

`POST /api/v1/catalog/products/apply/`

```json
{
  "product": {
    "name": "Produto Teste",
    "sku": "PROD-001",
    "base_unit": "uuid",
    "tracks_inventory": true
  },
  "stock": {
    "branch": "uuid",
    "location": "uuid",
    "initial_quantity": "25.000000",
    "minimum_quantity": "5.000000",
    "maximum_quantity": "100.000000",
    "reorder_point": "10.000000",
    "allow_negative": false
  }
}
```

Resposta `201`:

```json
{
  "product": { "id": "uuid", "tracks_inventory": true },
  "stock_policy": {
    "id": "uuid",
    "minimum_quantity": "5.000000",
    "maximum_quantity": "100.000000",
    "reorder_point": "10.000000",
    "allow_negative": false
  },
  "stock_summary": {
    "quantity": "25.000000",
    "reserved": "0.000000",
    "available": "25.000000",
    "status": "normal"
  }
}
```

### 6.2 Consultar e editar política

- `GET /api/v1/inventory/product-policies/?product=<id>`
- `PATCH /api/v1/inventory/product-policies/<id>/` com `If-Match` baseado em `version`.
- `GET /api/v1/inventory/product-summary/<product-id>/?branch=<id>&location=<id>` para saldo e situação consolidados.

Quando filial e local não forem informados, o resumo retornará `locations`, uma coleção ordenada por filial e local. O backend não escolherá implicitamente a primeira política. Para editar uma política ou iniciar um ajuste, filial e local são obrigatórios.

Erros seguirão `application/problem+json`, com `errors` por campo e códigos estáveis, incluindo:

- `STOCK_LOCATION_BRANCH_MISMATCH`
- `STOCK_MAX_BELOW_MINIMUM`
- `STOCK_SERVICE_NOT_ALLOWED`
- `STOCK_NEGATIVE_NOT_ALLOWED`
- `CONFLICT_VERSION_MISMATCH`
- `COMMAND_PAYLOAD_MISMATCH`
- `STOCK_CONTROL_ACTIVE_BALANCE`

Todos os erros de validação e conflito usarão `Content-Type: application/problem+json` e conterão `type`, `title`, `status`, `detail`, `code` e `errors`. `errors` será um objeto cujas chaves correspondem aos caminhos dos campos do comando.

## 7. Regras de transição

- Produto novo sem controle: cria somente o produto.
- Produto novo com controle e quantidade zero: cria produto e política, sem movimento.
- Produto novo com controle e quantidade positiva: cria produto, política, operação, movimento e saldo.
- Produto existente que passa a controlar estoque: exige política; quantidade inicial só poderá ser usada quando não houver movimentos anteriores naquele local.
- Produto existente que deixa de controlar estoque: política fica inativa; histórico e saldo permanecem consultáveis; novas operações são bloqueadas até reativação.
- Produto com saldo ou reserva diferente de zero não poderá deixar de controlar estoque sem confirmação e tratamento operacional no módulo Inventário.

Ativar, desativar ou reativar controle em produto existente usará um comando próprio e versionado. A desativação somente será aceita quando quantidade e reserva forem zero em todos os locais. A política será inativada, nunca removida. A reativação reutilizará ou atualizará uma política existente; quantidade inicial continuará proibida se já houver movimentos no local.

## 8. Segurança, auditoria e concorrência

- Todas as consultas e gravações respeitarão tenant e permissões da filial.
- O comando será protegido por MFA verificado e capacidades de Catálogo/Inventário.
- Produto, política, operação e movimento compartilharão um `correlation_id`.
- Atualizações de política usarão `version`/`If-Match`.
- A entrada inicial será idempotente e auditável; nenhuma escrita direta em `StockBalance` será permitida.
- A autorização validará tanto a capacidade do módulo quanto o acesso do usuário à filial informada.
- O registro do comando, os eventos de auditoria e os eventos de outbox serão gravados na mesma transação das entidades de domínio.
- A migração de `ProductStockPolicy` habilitará e forçará RLS com `RunSQL` e `reverse_sql` explícitos; um teste PostgreSQL comprovará leitura e escrita isoladas entre tenants.

## 9. Estados e mensagens

- Sucesso na identificação: `Produto e configuração de estoque salvos.`
- Sucesso em preço: `Faixa de preço adicionada.`
- Sucesso fiscal: `Dados fiscais salvos.`
- Sucesso em canal: `Canal adicionado como rascunho.`
- Falha geral: mensagem do problema retornado pelo backend, sem descartar o formulário.
- Quando o saldo estiver abaixo ou igual ao ponto de reposição, a etapa Estoque mostrará aviso persistente.

## 10. Cenários de aceite

### Cenário A — produto sem controle de estoque

**Dado** um novo produto com **Controlar estoque** desmarcado  
**Quando** o usuário salvar a identificação  
**Então** o produto será criado sem política, movimento ou saldo de estoque.

### Cenário B — produto com saldo inicial

**Dado** um produto de revenda com controle de estoque, filial, local, quantidade inicial `25`, mínima `5` e ponto de reposição `10`  
**Quando** o usuário salvar  
**Então** o produto e a política serão persistidos atomicamente  
**E** uma entrada de `25` será registrada  
**E** a etapa Estoque mostrará atual `25`, reservado `0`, disponível `25` e situação normal.

### Cenário C — estoque baixo

**Dado** saldo disponível `4` e ponto de reposição `10`  
**Quando** a etapa Estoque for aberta  
**Então** o sistema mostrará **Estoque baixo**.

### Cenário D — serviço

**Dado** um produto do tipo serviço  
**Quando** o usuário tentar ativar controle de estoque  
**Então** o frontend ocultará ou desabilitará o controle  
**E** o backend rejeitará qualquer payload incompatível.

### Cenário E — falha atômica

**Dado** um local que não pertence à filial  
**Quando** o usuário tentar criar o produto com estoque inicial  
**Então** a API responderá com erro por campo  
**E** nenhum produto, política ou movimento será criado.

### Cenário F — persistência das etapas

**Dado** um produto já criado  
**Quando** preço, fiscal ou canal forem salvos  
**Então** a interface exibirá confirmação  
**E** uma nova consulta mostrará os dados persistidos.

## 11. Estratégia de testes

- Modelo: validações de tenant, filial/local, limites e serviço.
- Serviço: transação, idempotência e rollback do comando de aplicação.
- API: contratos de criação, consulta, atualização, permissões, MFA e concorrência.
- Frontend unitário: exibição condicional, validações, mensagens e invalidação de queries.
- E2E Playwright: criação completa com categoria, marca, política e saldo inicial; reabertura do produto; preço, fiscal e canal persistidos; cenário sem controle; cenário móvel.
- Auditoria: consulta ao banco com contexto de tenant confirmando produto, política, movimento, saldo e eventos.
- Idempotência: repetir o comando com payload igual retorna a mesma resposta; payload divergente retorna conflito.
- Transições: ativar, desativar e reativar, incluindo bloqueio com saldo/reserva e proibição de saldo inicial após movimentos.
- Múltiplos locais: consulta sem filtros retorna coleção ordenada e nunca seleciona uma política arbitrária.

## 12. Migração e compatibilidade

- Produtos existentes com `tracks_inventory=true` não receberão quantidade inicial automática.
- Uma rotina de backfill criará políticas padrão apenas quando houver saldo por local, usando mínimo e ponto de reposição zero.
- Nenhum saldo existente será reescrito.
- A migração deverá ser reversível quanto às políticas; movimentos históricos nunca serão removidos no rollback.

## 13. Fora do escopo

- Compra automática ao atingir o ponto de reposição.
- Previsão estatística de demanda.
- Lote econômico de compra.
- Estoque em trânsito como campo editável no produto.
- Upload de imagem de teste nesta entrega, salvo cobertura de regressão do comportamento já existente.
