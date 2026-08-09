# Sprint R7 — Produto: fragmentação e integração PDV

**Programa:** Redesign integral do TJSys
**Onda:** Onda A
**Estado:** `planned`
**Dependências:** R6

## Objetivo

Entregar produto: fragmentação e integração pdv como incremento vertical, tenant-safe, acessível e verificável, sem quebrar os fluxos já publicados.

## Escopo

- Reproduzir tab Fragmentação.
- Persistir fator, unidade fracionada, preço e estoque de consumo.
- Converter venda PDV para unidade-base na mesma transação.

## Fora do escopo

- Produção.
- Canais digitais.

## Contrato funcional

SaleItem registra unidade vendida, fator e quantidade-base; estoque baixa quantidade-base, preço usa unidade vendida.

Todas as escritas usam transação, validação de tenant, versão quando houver edição concorrente e chave idempotente quando produzirem efeitos financeiros, fiscais ou de estoque. Erros de campo seguem Problem Details e preservam os dados digitados na interface.

## UX e acessibilidade

A interface usa exclusivamente os tokens e componentes aprovados nas sprints R0/R1. Controles possuem nome acessível, foco visível, navegação por teclado e alvos de pelo menos 44 × 44 px. Estados loading, vazio, erro, sucesso, conflito e permissão negada são explícitos.

## Dados, segurança e observabilidade

- Novas tabelas com tenant recebem RLS com `USING` e `WITH CHECK`.
- Migrations seguem expandir → migrar → validar → contrair.
- Eventos relevantes entram em audit/outbox sem dados sensíveis desnecessários.
- Métricas registram sucesso, falha, conflito e duração das operações críticas.

## Cenário de aceite

> Quando 0.500kg é vendido, cupom mostra 0.500kg e estoque reduz exatamente 0.500 da unidade-base.

## Evidências obrigatórias

- Testes unitários de domínio/componentes.
- Testes API positivos, negativos, isolamento tenant, concorrência e idempotência aplicáveis.
- Teste de migration quando houver mudança de schema.
- Playwright do caminho crítico com `retries: 0`.
- Axe, comparação visual, typecheck, build, Django check e lint aplicáveis.

## Gate de conclusão

A sprint só pode ser marcada `done` quando o cenário de aceite, os testes de regressão e a documentação operacional estiverem verdes. Para sprints F1–F12, esta spec não autoriza execução: o estado muda de `planned-future` para `ready` somente após revisão no início da respectiva onda.
