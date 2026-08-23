# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

O público principal são pequenos e médios varejistas brasileiros. A pessoa que
avalia ou opera o produto precisa coordenar vendas, estoque, compras, financeiro
e PDV sem depender de controles desconectados.

## Product Purpose

O TJSys. integra a operação comercial em um único ERP, do atendimento no PDV ao
controle administrativo. O produto existe para reduzir divergências de estoque,
retrabalho operacional e perda de visibilidade entre loja, compras e financeiro.

## Positioning

O TJSys. conecta PDV, estoque, compras, vendas, financeiro e relatórios no mesmo
fluxo operacional, com rastreabilidade entre os módulos e contexto organizacional
por tenant, empresa e filial.

## Operating Context

- Operação diária de varejo com painel administrativo React e PDV Electron.
- Gestão multiempresa e multifilial com backend Django/DRF e PostgreSQL.
- Jornadas centrais: vender, receber mercadoria, movimentar estoque, acompanhar
  contas e consultar resultados.
- A avaliação comercial inicial acontece por demonstração guiada no WhatsApp.

## Capabilities and Constraints

- Módulos confirmados: PDV, catálogo, estoque, compras, vendas, financeiro,
  fiscal, pessoas, relatórios e administração.
- O cadastro público de organização existe, mas cobrança automatizada e checkout
  comercial não fazem parte desta landing page.
- A solicitação de demonstração da primeira versão abre o WhatsApp; não cria nem
  persiste lead no backend.
- Planos são comunicados como sob medida, sem preço ou condição comercial
  inventada.
- A landing pública ocupa `/`; a aplicação autenticada fica sob `/app`.

## Brand Commitments

- Nome público: **TJSys.**, sempre com ponto final.
- Voz: direta, confiável e orientada a resultados concretos do varejo.
- Promessa principal aprovada: “Venda mais, sem perder o controle do estoque.”
- Não usar afirmações superlativas, métricas, clientes ou depoimentos sem
  evidência real.

## Evidence on Hand

- O repositório contém módulos operacionais e seus testes, além do design system
  em `docs/02_Architecture/design-system/reference/`.
- Os tokens atuais estão em `frontend/src/styles/tokens.css`.
- Não há logos de clientes, estudos de caso, depoimentos ou métricas comerciais
  aprovadas; a landing não deve fabricá-los.

## Product Principles

1. Explicar valor pelo resultado operacional, não por jargão técnico.
2. Manter a integração entre módulos visível e compreensível.
3. Mostrar somente capacidades e provas existentes.
4. Levar o visitante a uma demonstração com o mínimo de atrito.
5. Preservar clareza, acessibilidade e confiança em qualquer viewport.

## Accessibility & Inclusion

A experiência web deve manter navegação por teclado, foco visível, contraste
WCAG AA, semântica de landmarks, mensagens de erro associadas aos campos,
movimento reduzido quando solicitado e alvos de toque de pelo menos 48 px.
