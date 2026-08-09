# Sprint R4 — Produto: custo, varejo, atacado e margens

**Programa:** Redesign integral do TJSys
**Onda:** Onda A
**Estado:** `planned`
**Dependências:** R3

## Objetivo

Entregar produto: custo, varejo, atacado e margens como incremento vertical, tenant-safe, acessível e verificável, sem quebrar os fluxos já publicados.

## Escopo

- Reproduzir card de preços.
- Derivar custo da última entrada confirmada.
- Persistir preço base e tier atacado; calcular margens.

## Fora do escopo

- Motor promocional.
- Listas de preço avançadas da F4.

## Contrato funcional

Produto expõe exatamente zero ou um preço efetivo; ambiguidade retorna sem preço e bloqueia PDV.

Todas as escritas usam transação, validação de tenant, versão quando houver edição concorrente e chave idempotente quando produzirem efeitos financeiros, fiscais ou de estoque. Erros de campo seguem Problem Details e preservam os dados digitados na interface.

## UX e acessibilidade

A interface usa exclusivamente os tokens e componentes aprovados nas sprints R0/R1. Controles possuem nome acessível, foco visível, navegação por teclado e alvos de pelo menos 44 × 44 px. Estados loading, vazio, erro, sucesso, conflito e permissão negada são explícitos.

## Dados, segurança e observabilidade

- Novas tabelas com tenant recebem RLS com `USING` e `WITH CHECK`.
- Migrations seguem expandir → migrar → validar → contrair.
- Eventos relevantes entram em audit/outbox sem dados sensíveis desnecessários.
- Métricas registram sucesso, falha, conflito e duração das operações críticas.

## Cenário de aceite

> Quando custo, varejo e atacado são informados, a API persiste os preços e a tela recalcula margens sem duplicar custo.

## Evidências obrigatórias

- Testes unitários de domínio/componentes.
- Testes API positivos, negativos, isolamento tenant, concorrência e idempotência aplicáveis.
- Teste de migration quando houver mudança de schema.
- Playwright do caminho crítico com `retries: 0`.
- Axe, comparação visual, typecheck, build, Django check e lint aplicáveis.

## Gate de conclusão

A sprint só pode ser marcada `done` quando o cenário de aceite, os testes de regressão e a documentação operacional estiverem verdes. Para sprints F1–F12, esta spec não autoriza execução: o estado muda de `planned-future` para `ready` somente após revisão no início da respectiva onda.
