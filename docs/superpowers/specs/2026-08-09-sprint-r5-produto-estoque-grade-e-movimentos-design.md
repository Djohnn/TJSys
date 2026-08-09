# Sprint R5 — Produto: estoque, grade e movimentos

**Programa:** Redesign integral do TJSys
**Onda:** Onda A
**Estado:** `planned`
**Dependências:** R4

## Objetivo

Entregar produto: estoque, grade e movimentos como incremento vertical, tenant-safe, acessível e verificável, sem quebrar os fluxos já publicados.

## Escopo

- Reproduzir tab Estoque.
- Persistir política, filial, local, mínimo/máximo e saldo inicial.
- Modelar variantes de grade e movimentos atômicos.

## Fora do escopo

- Produção e mapa de estoque.
- Inventário contado completo da F6.

## Contrato funcional

Comando agregado cria ou atualiza política e movimento inicial idempotente; quantidade respeita precisão da unidade.

Todas as escritas usam transação, validação de tenant, versão quando houver edição concorrente e chave idempotente quando produzirem efeitos financeiros, fiscais ou de estoque. Erros de campo seguem Problem Details e preservam os dados digitados na interface.

## UX e acessibilidade

A interface usa exclusivamente os tokens e componentes aprovados nas sprints R0/R1. Controles possuem nome acessível, foco visível, navegação por teclado e alvos de pelo menos 44 × 44 px. Estados loading, vazio, erro, sucesso, conflito e permissão negada são explícitos.

## Dados, segurança e observabilidade

- Novas tabelas com tenant recebem RLS com `USING` e `WITH CHECK`.
- Migrations seguem expandir → migrar → validar → contrair.
- Eventos relevantes entram em audit/outbox sem dados sensíveis desnecessários.
- Métricas registram sucesso, falha, conflito e duração das operações críticas.

## Cenário de aceite

> Quando estoque 10 é salvo e uma saída 3 é confirmada, saldo fica 7 sem duplicação em replay.

## Evidências obrigatórias

- Testes unitários de domínio/componentes.
- Testes API positivos, negativos, isolamento tenant, concorrência e idempotência aplicáveis.
- Teste de migration quando houver mudança de schema.
- Playwright do caminho crítico com `retries: 0`.
- Axe, comparação visual, typecheck, build, Django check e lint aplicáveis.

## Gate de conclusão

A sprint só pode ser marcada `done` quando o cenário de aceite, os testes de regressão e a documentação operacional estiverem verdes. Para sprints F1–F12, esta spec não autoriza execução: o estado muda de `planned-future` para `ready` somente após revisão no início da respectiva onda.
