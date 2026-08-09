# Programa de Redesign Integral do TJSys

**Data:** 2026-08-09
**Status:** Aprovado para planejamento
**Plataforma:** React 18 + TypeScript no frontend, Django/DRF no backend e Electron/React no PDV

## 1. Objetivo

Reestruturar o frontend do TJSys com fidelidade visual ao arquivo de referência
`Desingn-System/redesign.html`, transformar a paleta v1.1 na fonte oficial de todas as cores e
adequar backend, APIs e PDV para que o cadastro de produto representado no HTML seja integralmente
funcional.

O programa será entregue em sprints verticais. Cada sprint fecha banco, domínio, API, interface,
acessibilidade e testes antes da próxima. O sistema atual permanece utilizável durante a migração.

## 2. Decisões aprovadas

1. React será mantido. Uma migração para Angular não agrega valor proporcional ao custo e
   duplicaria o risco do redesign.
2. A referência visual do cadastro é o HTML original, sem reinterpretar layout, dimensões, ordem,
   agrupamento ou hierarquia.
3. A única alteração visual autorizada na referência é substituir o logo demonstrativo pelo arquivo
   `Desingn-System/logo_fundo_azul.png.png` na topbar.
4. O backend será ampliado para sustentar todas as funções do cadastro; a entrega não será uma
   fachada visual.
5. Migrations devem preservar os dados. Reset de banco não é estratégia de implementação.
6. Destinos de menu sem módulo de negócio atual permanecerão registrados em uma segunda onda de
   sprints futuras, em sequência explícita.

## 3. Referências imutáveis de entrada

| Artefato | SHA-256 em 2026-08-09 | Uso |
|---|---|---|
| `Desingn-System/redesign.html` | `2E52F8BA91E418EAA0E31AE0E48C125998DC2D69E08697358FBFB447C1C1AF45` | Estrutura visual e comportamento do shell/cadastro |
| `Desingn-System/design-system-paleta-cor.md` | `7D9486F1164B39A004C7744A9301D2953BEDAE4B7206A9790562569899C80D53` | Cores, espaçamento, tipografia e regras de uso |
| `Desingn-System/logo_fundo_azul.png.png` | `8DF077FA7F5F87D51C9F0A940F5AE6B670B555A41EB51EA1DE0F90BE1AEA59C2` | Logo oficial da topbar azul |
| `Desingn-System/logo_fundo_branco.png.png` | `FC8D7F1E8A0D4882CED8F1996FE4ED829D9EDBD5CEA611ED1DFD44CC23D23BA5` | Logo oficial sobre superfícies claras |

Na Sprint R0, cópias versionadas desses artefatos serão incorporadas a
`docs/02_Architecture/design-system/reference/`. Depois disso, a cópia em `docs` será a fonte
normativa. Alterações futuras exigirão nova versão, changelog e atualização dos hashes.

## 4. Arquitetura visual

### 4.1 Tokens e componentes

- `frontend/src/styles/tokens.css` conterá os únicos valores cromáticos autorizados.
- O bloco `@theme` do Tailwind mapeará tokens semânticos, sem duplicar HEX em componentes.
- `frontend/src/design-system/tokens.ts` disponibilizará os mesmos nomes para gráficos e código
  TypeScript.
- Botões, campos, selects, textareas, switches, tabs, cards, alertas, badges, modais e tabelas serão
  componentes reutilizáveis.
- Um teste de governança recusará literais HEX fora dos arquivos de tokens e fixtures autorizadas.
- `docs/README.md`, `docs/DOCUMENT_INDEX.md`, `frontend/README.md` e as instruções de contribuição
  apontarão para a fonte normativa.

### 4.2 Shell

O React reproduzirá o shell do HTML:

- topbar com 56 px;
- célula inicial de 84 px com ação de início;
- rail lateral de 84 px;
- topbar e rail com azul institucional;
- logo oficial de fundo azul no lugar do logo demonstrativo;
- busca global, data e controles existentes de tenant, filial e usuário;
- flyouts dos módulos, backdrop, fechamento por clique externo e `Escape`;
- drawer responsivo em telas menores;
- foco visível, ordem de teclado e alvos de interação de pelo menos 44 × 44 px.

Itens cujo módulo já existe serão ligados às rotas reais. Itens da segunda onda permanecerão
catalogados no modelo de navegação com estado `planned`, sem criar módulos fictícios ou páginas que
simulem funcionalidade inexistente.

### 4.3 Cadastro de produto

A página React seguirá exatamente a sequência visual do HTML:

1. Cabeçalho `Catálogo / Produtos` e ações Listagem, Imprimir e Duplicar.
2. Card principal com código de barras, imagem, status e download à esquerda.
3. Dados de produto próprio à direita, mantendo o grid e a ordem dos campos.
4. Card de preços com custo, varejo, margem, quantidade mínima e atacado.
5. Seção Características com tabs Estoque, Fiscal e Fragmentação.
6. Card de ajuda.
7. Barra final Salvar e voltar / Salvar.

Composição e Canais continuarão disponíveis em suas rotas atuais durante a primeira onda. Eles não
serão inseridos visualmente no cadastro aprovado, pois isso quebraria a fidelidade ao HTML.

## 5. Contrato funcional do produto

### 5.1 Identidade

O agregado de produto terá:

- descrição/nome;
- SKU ou código interno;
- tipo de item;
- unidade-base;
- categoria e subcategoria;
- marca;
- modelo;
- tags;
- código de balança;
- status ativo/inativo;
- imagem principal;
- código de barras principal.

`Category.parent` continuará representando a hierarquia. O agregado passará a persistir categoria e
subcategoria separadamente e validará que a subcategoria é filha da categoria selecionada.

`Product.brand`, hoje textual, será migrado para uma relação com `Brand`. A migration criará ou
reutilizará marcas por tenant e preservará os valores atuais antes de remover a fonte textual.

### 5.2 Código de barras automático

Quando o usuário criar um produto sem código:

1. o backend bloqueará transacionalmente uma sequência por tenant;
2. reservará o próximo número da faixa EAN-13 interna iniciada por `20`;
3. calculará o dígito verificador EAN-13;
4. verificará colisão com códigos manuais existentes;
5. persistirá um `ProductCode` ativo, principal e pesquisável;
6. devolverá o código no resultado do comando agregado.

Cadastros simultâneos não poderão receber o mesmo número. Código informado manualmente continuará
passando pela validação GTIN. Na edição, esvaziar o campo não substituirá silenciosamente o código;
regeneração será uma ação explícita e auditada.

### 5.3 Imagem

`ProductImage` será a fonte oficial. A interface permitirá upload, troca, exclusão e download. O
arquivo será validado por tipo e tamanho. Falha de leitura da mídia não impedirá a edição dos demais
dados; falha de upload afetará somente a operação da imagem.

### 5.4 Preços e margem

- Custo exibido: último `PurchaseReceiptItem` confirmado do produto, normalizado para a unidade-base.
- Venda varejo: preço efetivo único em `ProductPrice`.
- Venda atacado: `ProductPriceTier` associado ao produto e à quantidade mínima.
- Margens: valores calculados, não persistidos em duplicidade.
- Sem custo válido, a margem será exibida como `N/D`.
- O PDV só aceitará produto com preço efetivo único e positivo.

### 5.5 Estoque

- `Product.tracks_inventory` controla o switch principal.
- `StockBalance` fornece saldo atual.
- `ProductStockPolicy` fornece mínimo, máximo, ponto de reposição, filial e local.
- Entrada, saída, ajuste e transferência usam os serviços transacionais existentes.
- Será adicionada a opção de movimentar o estoque da composição.
- Estoque do tipo `grade` será modelado por variantes e atributos próprios, sem codificar grade em
  texto livre.
- Quantidades respeitarão a precisão da unidade-base.
- Desativar controle de estoque exigirá saldo zero ou uma decisão explícita de tratamento já
  suportada pelo fluxo de controle.

### 5.6 Fiscal

`ProductFiscalData` será a fonte canônica para tipo fiscal, NCM, origem, CEST e classificação. Os
enums corresponderão às opções exibidas no HTML. Campos duplicados em `Product` e
`FiscalProductConfig` serão migrados com regra de precedência documentada; nenhum dado será apagado
antes da validação da migration.

### 5.7 Fragmentação

`ProductUnit` será ampliado para representar:

- fator de conversão;
- unidade fracionada;
- preço de venda fracionado;
- ativo/inativo;
- flag booleana de estoque de consumo.

O PDV converterá a quantidade vendida para a unidade-base e baixará estoque pelo fator dentro da
mesma transação da venda. O preço fracionado nunca substituirá silenciosamente o preço-base.

## 6. Persistência, concorrência e erros

O botão Salvar enviará um comando agregado com identidade, preços, estoque, fiscal e fragmentação.
O backend executará o comando em `transaction.atomic`, com `command_id` idempotente e controle de
versão. Qualquer falha desfará todas as mudanças daquele salvamento.

- Validação de campo retorna Problem Details com ponteiros para os campos.
- A tela preserva valores digitados e mostra erro junto ao campo e resumo no topo.
- Versão desatualizada retorna `409 Conflict` e não sobrescreve outro usuário.
- Reenvio do mesmo `command_id` devolve o mesmo resultado sem duplicar efeitos.
- Operações de estoque usam locks e idempotência existentes.
- Novas tabelas tenant-scoped recebem RLS com `USING` e `WITH CHECK`.
- Ações de gerar código, duplicar, movimentar estoque e alterar fiscal são auditadas.

## 7. Estratégia de dados

Cada migration seguirá expandir → migrar → validar → contrair:

1. adicionar nova estrutura sem remover a antiga;
2. copiar dados por tenant;
3. comparar contagens e valores;
4. mudar aplicação para a nova fonte;
5. remover estrutura antiga somente em sprint posterior e reversível.

O reset de banco fica fora do fluxo normal. Mesmo que os dados atuais sejam de desenvolvimento, a
capacidade de migrá-los é requisito de qualidade para produção futura.

## 8. Qualidade e aceite

Cada sprint inclui:

- testes unitários de domínio e componentes;
- testes de API positivos, negativos, concorrência, idempotência e isolamento tenant;
- testes de migrations com dados anteriores;
- testes React com Testing Library e MSW;
- Playwright sem retries para o caminho crítico;
- axe-core para WCAG, foco, labels e navegação por teclado;
- comparação visual em desktop e viewport responsivo;
- build, typecheck, Django check e lint aplicáveis.

O aceite vertical final deve provar:

> Dado um usuário autenticado no tenant correto, quando ele cadastra um produto sem código de barras,
> habilita estoque com saldo 10 e define preço, então o backend gera um EAN-13 único; quando o PDV
> localiza esse produto e vende 3 unidades, a venda é confirmada uma única vez e o saldo administrativo
> passa para 7.

## 9. Onda A — sequência de sprints do redesign

### Sprint R0 — Baseline e governança do Design System

**Entrega:** versionar referências em `docs`, registrar hashes, corrigir nomes dos assets, atualizar
índices e criar regra de contribuição.
**Saída:** qualquer desenvolvedor encontra a fonte oficial; nenhum artefato depende da pasta local
ignorada.

### Sprint R1 — Tokens e componentes fundamentais

**Entrega:** tokens CSS/TypeScript, mapeamento Tailwind, logos, Button, Input, Select, Textarea,
Switch, Tabs, Card, Alert, Badge, Modal e Table.
**Saída:** teste de cores literais, contraste e catálogo de estados verde.

### Sprint R2 — Shell, navegação e responsividade

**Entrega:** topbar, home, rail, flyouts, busca, tenant/filial/usuário, fechamento por Escape e drawer
mobile visualmente equivalentes ao HTML.
**Saída:** rotas existentes navegáveis, teclado/axe e Playwright desktop/mobile verdes.

### Sprint R3 — Produto: identidade, mídia e EAN automático

**Entrega:** card principal idêntico, categoria/subcategoria, marca relacional, tags, imagem, status,
download, código manual e geração EAN-13 interna transacional.
**Saída:** criação e edição persistem; concorrência não duplica EAN; migrations preservam marcas.

### Sprint R4 — Produto: custo, varejo, atacado e margens

**Entrega:** card de preços idêntico, custo da última compra, preço-base, tier atacado e margens
calculadas.
**Saída:** preço efetivo sem ambiguidade e contrato consumido corretamente pelo PDV.

### Sprint R5 — Produto: estoque único, grade e movimentos

**Entrega:** tab Estoque idêntica, switches, política, saldo, mínimo, entrada/saída/ajuste/transferência,
composição e variantes de grade.
**Saída:** movimentos são atômicos, precisos por unidade e auditados.

### Sprint R6 — Produto: contrato fiscal único

**Entrega:** tab Fiscal idêntica, enums completos, migration das fontes antigas e helper de dúvidas.
**Saída:** dados fiscais round-trip, tenant isolation e validações NCM/CEST/origem verdes.

### Sprint R7 — Produto: fragmentação e integração PDV

**Entrega:** tab Fragmentação idêntica, conversões, preço fracionado, estoque de consumo e baixa no
PDV.
**Saída:** venda fracionada calcula preço e estoque sem arredondamento indevido.

### Sprint R8 — Consolidação visual e expansão às telas existentes

**Entrega:** Listagem, Imprimir, Duplicar, ajuda, Salvar/Salvar e voltar, remoção do editor visual
antigo e aplicação dos tokens/componentes às telas React existentes.
**Saída:** fluxo vertical completo, regressão geral, Playwright/axe e aceite visual contra o HTML.

## 10. Onda B — sequência futura dos módulos citados nos flyouts

Cada item abaixo exige sua própria spec e plano antes de implementação. A ordem evita construir
canais e relatórios antes dos domínios transacionais necessários.

Esta onda constitui um **backlog futuro ordenado**, não uma autorização para implementação dentro
da Onda A. Todos os itens começam com o estado `planned`; só podem mudar para `ready` depois da
aprovação de sua spec, dependências, critérios de aceite e estratégia de dados. A sequência oficial
é F1 → F2 → F3 → F4 → F5 → F6 → F7 → F8 → F9 → F10 → F11 → F12.

| Sprint | Destinos do HTML cobertos | Dependência mínima | Estado inicial |
|---|---|---|---|
| F1 | Favoritos e atalhos; busca global | R2 | `planned` |
| F2 | Subcategorias, tags e catálogo complementar | R8 | `planned` |
| F3 | Orçamentos, pedidos e cupons de venda | R4, R8 | `planned` |
| F4 | Consignados, comissões, listas de preço e serviços | F3 | `planned` |
| F5 | Clientes e CRM | F3 | `planned` |
| F6 | Consulta e movimentações de estoque, locais, tipos de estocagem, inventário e motivos | R5 | `planned` |
| F7 | Produção e mapa de estoque | F6 | `planned` |
| F8 | Orçamentos e pedidos de compra, fornecedores, devoluções e compras em aberto | F6 | `planned` |
| F9 | Fluxo e movimentação de caixa, conciliação, pagamentos, recebimentos, saldo e extrato | F3, F8 | `planned` |
| F10 | Faturamento e documentos fiscais | R6, F3, F9 | `planned` |
| F11 | Relatórios de vendas, estoque, compras, financeiro e DRE | F10 | `planned` |
| F12 | Loja virtual, marketplaces, pedidos online e configurações de canais | F4, F6, F10 | `planned` |

Produtos, Categorias, Marcas, Unidades, Estoque básico, Compras básicas, Devoluções existentes e
demais destinos que já possuam implementação serão apenas ligados às rotas reais na Onda A. Sua
presença no HTML não autoriza duplicar módulos; qualquer lacuna funcional encontrada será anexada à
sprint futura correspondente.

### Sprint F1 — Favoritos e busca global

Favoritos persistentes por usuário, busca global autorizada e atalhos para Financeiro, Vendas,
Produtos, Estoque e Clientes.

### Sprint F2 — Catálogo complementar

Gestão dedicada de subcategorias e tags, pesquisa avançada e integração completa com listas de
preços e serviços já existentes.

### Sprint F3 — Vendas pré-venda

Orçamentos, pedidos comerciais e conversão idempotente para venda/cupom.

### Sprint F4 — Vendas avançadas

Consignados, comissões e listas de preço por público/condição.

### Sprint F5 — CRM e jornada do cliente

Pipeline, atividades, histórico do cliente e vínculo com vendas, devoluções e recebimentos.

### Sprint F6 — Estoque operacional complementar

Locais, tipos de estocagem, motivos de movimentação, reposição e inventário contado.

### Sprint F7 — Produção e mapa de estoque

Ordens de produção, consumo de composição, produto acabado e mapa consolidado por local/grade.

### Sprint F8 — Compras avançadas

Orçamentos de fornecedores, compras em aberto e devoluções de compra integradas ao estoque e
financeiro.

### Sprint F9 — Financeiro bancário

Conciliação bancária, conta corrente, saldo/extrato integrado, pagamentos e recebimentos.

### Sprint F10 — Faturamento e documentos fiscais

Faturamento por pedido, vínculo com notas fiscais e compensações financeiras.

### Sprint F11 — Relatórios e DRE

Relatórios de Vendas, Estoque, Compras e Financeiro, culminando em DRE rastreável.

### Sprint F12 — Loja virtual e marketplaces

Loja virtual, configuração de canais, marketplaces e pedidos online com estoque e preço
sincronizados.

## 11. Critério de conclusão do programa

A Onda A termina somente quando o cadastro React é visualmente equivalente ao HTML aprovado,
utiliza a logo azul oficial, persiste todos os blocos em contratos reais e fecha o fluxo produto →
estoque → PDV. A Onda B termina quando todos os itens dos flyouts possuem módulos funcionais,
autorizados, tenant-safe, documentados e testados; a simples presença de links não conta como
conclusão.
