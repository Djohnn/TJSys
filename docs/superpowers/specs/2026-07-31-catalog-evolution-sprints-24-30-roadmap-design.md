# Evolução do Catálogo — Roadmap das Sprints 24–30

## 1. Contexto e decisões aprovadas

Este roadmap transforma a referência visual e funcional analisada nos três HTMLs
`MarketUP - [Produtos]*.html` em uma evolução própria do Zyrp. A referência é usada
somente para levantamento de jornadas e hierarquia; código, marca, logotipo e ativos
de terceiros não serão copiados.

Decisões aprovadas pelo usuário em 31/07/2026:

- preservar a Sprint 23 existente como antecessora, dedicada à composição de kits;
- iniciar a nova evolução na Sprint 24;
- usar o padrão visual B, mantendo a paleta atual do Zyrp;
- no cadastro de produto, posicionar imagem/galeria à esquerda e identificação à direita;
- dividir o formulário nas etapas Identificação, Preços, Estoque, Fiscal, Composição e Canais;
- criar specs e plans separados, explícitos e rastreáveis para todas as sprints seguintes.

## 2. Princípios arquiteturais

- `Catalog` mantém identidade comercial, classificação, códigos, unidades, preços e imagens.
- `Inventory` continua dono de movimentos e saldos; nenhum formulário altera saldo diretamente.
- `Fiscal` mantém regras fiscais contextuais; Catalog armazena apenas configuração fiscal do item.
- `Sales` vende produtos, serviços, kits e combos sem absorver regras internas dos outros módulos.
- Valores monetários e quantidades permanecem decimais; `float` é proibido.
- Toda entidade operacional é tenant-scoped, auditável e protegida contra IDOR/RLS.
- Erros seguem `application/problem+json` e são mostrados no campo/etapa correspondente.

## 3. Sequência e dependências

| Sprint | Objetivo | Dependências | Entrega principal |
|---:|---|---|---|
| 23 | Kit e baixa de componentes | Sprint 22 | Composição física/virtual versionada |
| 24 | Catálogo visual e Produto completo | Sprints 22–23 | Jornada completa de produto pela web |
| 25 | Cadastros classificadores | Sprint 24 | Categoria, subcategoria, marca e unidade |
| 26 | Serviços | Sprints 24–25 | Item não estocável, preço e fiscal de serviço |
| 27 | Combos comerciais | Sprints 23–26 | Agrupamento promocional com vigência e preço |
| 28 | Etiquetas | Sprints 24–25 | Seleção em lote, preview e PDF |
| 29 | Canais | Sprints 24–28 | Dados e imagens para loja/marketplace futuros |
| 30 | Hardening e aceite | Sprints 23–29 | Regressão, segurança, acessibilidade e release |

## 4. Definições para evitar sobreposição

- **Produto:** item vendável que pode ou não controlar estoque.
- **Kit (Sprint 23):** produto composto cuja venda baixa componentes no Inventory.
- **Serviço (Sprint 26):** item vendável sem saldo físico, preparado para tributação/NFS-e.
- **Combo (Sprint 27):** oferta comercial temporária ou permanente que agrupa itens com preço próprio;
  não representa montagem nem saldo físico.
- **Canal (Sprint 29):** projeção/publicação de dados do catálogo; não é fonte da verdade do produto.

## 5. Padrão obrigatório de cada spec e plan

Cada sprint deve registrar objetivo, escopo incluído/excluído, dependências, decisões bloqueantes,
modelos, migrations, APIs, UI, autorização, auditoria, cenários BDD, testes, comandos de verificação,
critérios de aceite, riscos e itens explicitamente adiados. Uma sprint parcialmente concluída
permanece aberta no `docs/PRD.md`.

## 6. Qualidade transversal

- testes unitários/modelo para invariantes;
- testes API para sucesso, validação, permissões, IDOR e RLS;
- testes React para componentes, abas, modais e erros;
- Playwright para jornadas reais e determinísticas;
- axe/WCAG, teclado, foco e responsividade;
- regressão de Catalog, Inventory, Sales, PDV, Purchasing e Fiscal;
- relatório final com saída bruta dos comandos antes de marcar qualquer sprint concluída.

