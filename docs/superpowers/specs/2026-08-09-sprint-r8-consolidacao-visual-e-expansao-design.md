# Sprint R8 — Consolidação visual e expansão

**Programa:** Redesign integral do TJSys
**Onda:** Onda A
**Estado:** `planned`
**Dependências:** R7

## Processo obrigatório de implementação e revisão

A sprint deve ser executada com `subagent-driven-development` em worktree isolado. Cada task recebe um subagente implementador novo, seguido obrigatoriamente por um subagente revisor de conformidade com esta spec e, somente depois da aprovação funcional, um subagente revisor de qualidade. Achados são corrigidos pelo implementador e revisados novamente; nenhuma task avança com issue aberta. Ao final, um quarto papel independente revisa a integração completa da sprint. Execução manual sem essas revisões não satisfaz o gate de conclusão.

## Objetivo

Entregar consolidação visual e expansão como incremento vertical, tenant-safe, acessível e verificável, sem quebrar os fluxos já publicados.

## Escopo

- Concluir Listagem, Imprimir, Duplicar, ajuda e ações de salvar.
- Remover editor visual legado após paridade.
- Aplicar tokens às telas React existentes e fechar E2E produto-estoque-PDV.

## Fora do escopo

- Implementar a Onda B.
- Apagar dados para facilitar testes.

## Contrato funcional

Uma única rota/editor é canônica; fluxos antigos redirecionam sem duplicar mutações.

Todas as escritas usam transação, validação de tenant, versão quando houver edição concorrente e chave idempotente quando produzirem efeitos financeiros, fiscais ou de estoque. Erros de campo seguem Problem Details e preservam os dados digitados na interface.

## UX e acessibilidade

A interface usa exclusivamente os tokens e componentes aprovados nas sprints R0/R1. Controles possuem nome acessível, foco visível, navegação por teclado e alvos de pelo menos 44 × 44 px. Estados loading, vazio, erro, sucesso, conflito e permissão negada são explícitos.

## Dados, segurança e observabilidade

- Novas tabelas com tenant recebem RLS com `USING` e `WITH CHECK`.
- Migrations seguem expandir → migrar → validar → contrair.
- Eventos relevantes entram em audit/outbox sem dados sensíveis desnecessários.
- Métricas registram sucesso, falha, conflito e duração das operações críticas.

## Cenário de aceite

> Quando o fluxo crítico cria produto com saldo 10 e vende 3 no PDV, saldo final é 7 e a página é visualmente equivalente ao HTML.

## Evidências obrigatórias

- Testes unitários de domínio/componentes.
- Testes API positivos, negativos, isolamento tenant, concorrência e idempotência aplicáveis.
- Teste de migration quando houver mudança de schema.
- Playwright do caminho crítico com `retries: 0`.
- Axe, comparação visual, typecheck, build, Django check e lint aplicáveis.

## Gate de conclusão

A sprint só pode ser marcada `done` quando o cenário de aceite, os testes de regressão e a documentação operacional estiverem verdes. Para sprints F1–F12, esta spec não autoriza execução: o estado muda de `planned-future` para `ready` somente após revisão no início da respectiva onda.
