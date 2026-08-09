# Sprint F6 — Estoque operacional complementar

**Programa:** Redesign integral do TJSys
**Onda:** Onda B
**Estado:** `planned-future`
**Dependências:** R5

## Processo obrigatório de implementação e revisão

A sprint deve ser executada com `subagent-driven-development` em worktree isolado. Cada task recebe um subagente implementador novo, seguido obrigatoriamente por um subagente revisor de conformidade com esta spec e, somente depois da aprovação funcional, um subagente revisor de qualidade. Achados são corrigidos pelo implementador e revisados novamente; nenhuma task avança com issue aberta. Ao final, um quarto papel independente revisa a integração completa da sprint. Execução manual sem essas revisões não satisfaz o gate de conclusão.

## Objetivo

Entregar estoque operacional complementar como incremento vertical, tenant-safe, acessível e verificável, sem quebrar os fluxos já publicados.

## Escopo

- Locais, tipos de estocagem e motivos.
- Reposição e inventário contado.
- Consulta e movimentações avançadas.

## Fora do escopo

- Produção.
- Otimização por IA.

## Contrato funcional

StockCount congela snapshot, recebe contagens idempotentes e gera ajustes apenas após aprovação.

Todas as escritas usam transação, validação de tenant, versão quando houver edição concorrente e chave idempotente quando produzirem efeitos financeiros, fiscais ou de estoque. Erros de campo seguem Problem Details e preservam os dados digitados na interface.

## UX e acessibilidade

A interface usa exclusivamente os tokens e componentes aprovados nas sprints R0/R1. Controles possuem nome acessível, foco visível, navegação por teclado e alvos de pelo menos 44 × 44 px. Estados loading, vazio, erro, sucesso, conflito e permissão negada são explícitos.

## Dados, segurança e observabilidade

- Novas tabelas com tenant recebem RLS com `USING` e `WITH CHECK`.
- Migrations seguem expandir → migrar → validar → contrair.
- Eventos relevantes entram em audit/outbox sem dados sensíveis desnecessários.
- Métricas registram sucesso, falha, conflito e duração das operações críticas.

## Cenário de aceite

> Quando um inventário é aprovado, diferenças geram movimentos auditados e o replay não duplica ajustes.

## Evidências obrigatórias

- Testes unitários de domínio/componentes.
- Testes API positivos, negativos, isolamento tenant, concorrência e idempotência aplicáveis.
- Teste de migration quando houver mudança de schema.
- Playwright do caminho crítico com `retries: 0`.
- Axe, comparação visual, typecheck, build, Django check e lint aplicáveis.

## Gate de conclusão

A sprint só pode ser marcada `done` quando o cenário de aceite, os testes de regressão e a documentação operacional estiverem verdes. Para sprints F1–F12, esta spec não autoriza execução: o estado muda de `planned-future` para `ready` somente após revisão no início da respectiva onda.
