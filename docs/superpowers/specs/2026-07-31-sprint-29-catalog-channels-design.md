# Sprint 29 — Canais, Galeria e Dados de Publicação

## Objetivo

Preparar dados de produto para canais digitais sem tornar marketplace externo fonte da verdade.

## Escopo

- galeria ordenada, imagem principal/secundária e metadados acessíveis;
- nome e descrição comercial por canal;
- preço de lista e preço de venda por canal usando resolução comercial explícita;
- dimensões, peso, categoria/subcategoria do canal e estado de publicação;
- projeção versionada e fila/outbox para futuras integrações;
- preview interno do conteúdo publicado.

## Regras

- segredos de provedores nunca entram no frontend nem nos dados do produto;
- publicação externa requer adapter/port e idempotência;
- falha de canal não bloqueia o cadastro central nem altera histórico de vendas.

## BDD e testes

Preparar publicação, validar campos obrigatórios, ordenar imagens, impedir cross-tenant, reprocessar
evento sem duplicidade e provar que falha externa não corrompe Catalog.

## Adiado

Integrações reais com marketplaces, sincronização de pedidos e estoque externo exigem specs próprias.

