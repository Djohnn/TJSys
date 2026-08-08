# Sprint 24 — Catálogo Visual e Cadastro Completo de Produto

## Objetivo

Entregar a nova entrada do Catálogo com sete opções e tornar o cadastro de produto utilizável
de ponta a ponta, corrigindo primeiro o contrato incompatível entre frontend e backend.

## Escopo

- hub do Catálogo: Produtos, Serviços, Combo, Categorias, Marcas, Unidades de Medida e Etiquetas;
- listagem, pesquisa, filtros, paginação, criação, edição e inativação de produtos;
- formulário em etapas: Identificação, Preços, Estoque, Fiscal, Composição e Canais;
- imagem/galeria à esquerda e identificação à direita no desktop; empilhamento no mobile;
- imagem principal e secundárias com ordem, tipo, tamanho e validação;
- marca e subcategoria mínimas para sustentar a identificação;
- integração de Composição com a Sprint 23;
- correção dos mapeamentos `unit/base_unit`, códigos de barra via `ProductCode` e tags como lista;
- mensagens detalhadas de `application/problem+json` por etapa/campo.

## Fora do escopo

CRUD administrativo completo de classificadores (Sprint 25), serviço (26), combo comercial (27),
etiquetas (28) e publicação externa de canais (29).

## Backend e API

- preservar `Product` como raiz e reutilizar `ProductCode`, `ProductPrice`, `ProductFiscalData`,
  `ProductPriceTier`, `ProductUnit` e `ProductComposition`;
- adicionar `Brand`, hierarquia de subcategoria e `ProductImage` somente com os campos necessários;
- expor endpoints aninhados para códigos, imagens e recursos dependentes;
- criar produto-base primeiro e usar seu ID nas etapas dependentes;
- operações dependentes idempotentes e transacionais dentro de cada etapa.

## UX aprovada

Padrão B com tokens atuais do TJSys (`primary` azul, superfícies brancas, neutros). Abas/etapas,
ações Salvar/Cancelar persistentes e faixa inferior com status de estoque, fiscal e preço.
Cadastros rápidos atualizam o seletor imediatamente.

## Cenários BDD essenciais

- Dado um administrador, quando cadastra todos os dados válidos, então o produto aparece na lista.
- Dada uma categoria/marca/unidade criada em modal, quando o modal fecha, então ela já está selecionável.
- Dado código repetido no tenant, quando salva, então o campo exibe erro específico e nada é duplicado.
- Dado usuário sem `catalog.manage`, quando tenta alterar produto, então recebe 403 sem vazamento.
- Dado produto de outro tenant, quando acessado por ID, então a API responde sem revelar existência.

## Aceite e verificação

Vitest do catálogo, testes API/RLS, Playwright de cadastro/edição/inativação, axe, typecheck,
build e regressão dos módulos consumidores. O defeito original `POST products = 400` deve possuir
teste de regressão vermelho antes da correção e verde depois.

## Entregas adiadas

Manutenção completa de marcas/subcategorias/unidades para a Sprint 25; Canais permanece somente
como resumo de prontidão até a Sprint 29.

