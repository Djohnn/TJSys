# Sprint 25 — Categorias, Subcategorias, Marcas e Unidades de Medida

## Objetivo

Entregar CRUDs tenant-scoped completos para todos os classificadores usados pelo produto.

## Escopo

- categorias hierárquicas e subcategorias sem ciclos;
- marcas com nome normalizado, estado e associação a produtos;
- unidades com símbolo, nome, precisão e conversões comerciais por produto;
- pesquisa, paginação, inativação, reativação e proteção de vínculos históricos;
- modais rápidos reutilizando os mesmos serviços e validações dos CRUDs completos;
- atualização imediata dos caches React Query com chaves padronizadas.

## Regras

- nome/código único por tenant conforme tipo;
- não excluir fisicamente classificador referenciado; usar inativação;
- pai e filho pertencem ao mesmo tenant; ciclos são rejeitados;
- fatores de conversão são decimais positivos e versionados.

## BDD e testes

Criar, editar, inativar, impedir ciclo, impedir cross-tenant, preservar produto vinculado e provar
que criação rápida aparece imediatamente no produto. Testes de modelo, API, RLS/IDOR, React,
Playwright e acessibilidade são obrigatórios.

## Adiado

Serviços usam estes classificadores na Sprint 26; etiquetas consomem unidades/códigos na Sprint 28.

