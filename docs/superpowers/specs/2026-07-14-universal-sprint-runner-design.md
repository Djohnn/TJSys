# Design — PRD operacional e prompt universal de sprints

**Status:** Approved for review  
**Data:** 2026-07-14  
**Produto:** TJSys

## Objetivo

Criar um mecanismo simples, legível e independente de ferramenta para que qualquer agente de terminal consiga executar uma sprint do TJSys com base na documentação oficial, enquanto o usuário acompanha o progresso por checkboxes no próprio PRD operacional.

## Artefatos

### `docs/PRD.md`

Documento operacional vivo contendo:

- instruções de uso e legenda dos estados;
- referências ao PRD mestre, arquitetura, ADRs, requisitos, segurança e testes;
- roadmap ordenado de sprints;
- objetivo, entregável verificável e critérios de aceite de cada sprint;
- tarefas pequenas identificadas e representadas por `- [ ]` e `- [x]`;
- comandos de validação e commit esperado;
- registro de bloqueios e evidências de conclusão.

O Sprint 0 será detalhado em nível executável. Sprints posteriores terão inicialmente objetivo, entregável e escopo macro; serão detalhadas antes de sua execução para incorporar o aprendizado das etapas anteriores.

### `docs/PROMPT_EXECUCAO_SPRINT.md`

Prompt reutilizável por Codex CLI, Claude Code, Cursor ou outro agente capaz de ler arquivos e operar um terminal. O texto não dependerá de comandos proprietários e receberá a sprint desejada por instrução do usuário.

## Ordem obrigatória de leitura

O agente deverá consultar, nesta ordem:

1. `docs/PRD.md`;
2. `docs/01_Product/PRD-001_Master_v0.1.0.md`;
3. `docs/02_Architecture/SAD-001_Software_Architecture_v0.1.0.md`;
4. `docs/02_Architecture/ADR/`;
5. `docs/03_Domain/`;
6. `docs/04_Requirements/`;
7. `docs/05_API/`;
8. `docs/07_Testing/`;
9. `docs/08_Security/`;
10. código, testes, configuração e histórico Git existentes.

Referências adicionais, como `design_system/design-system.html`, tornam-se obrigatórias somente quando existirem e forem aplicáveis à sprint.

## Protocolo de execução

1. Confirmar a sprint solicitada e localizar sua seção no PRD operacional.
2. Verificar branch, status Git, dependências, arquivos existentes e tarefas já concluídas.
3. Apresentar um plano curto baseado nas tarefas ainda abertas.
4. Executar somente uma tarefa por vez.
5. Aplicar testes antes ou junto da implementação, conforme o tipo de mudança.
6. Rodar a validação específica da tarefa.
7. Trocar `- [ ]` por `- [x]` somente após evidência objetiva de conclusão.
8. Registrar evidência resumida e qualquer desvio autorizado.
9. Ao final, executar todos os critérios de aceite da sprint.
10. Criar o commit definido no PRD somente quando as verificações passarem.
11. Apresentar relatório final e parar sem iniciar a próxima sprint.

## Integridade dos checkboxes

- Uma tarefa parcialmente implementada permanece `- [ ]`.
- Uma tarefa bloqueada permanece `- [ ]` e recebe uma nota `BLOQUEADO:` com causa e evidência.
- O agente não marca tarefas apenas porque criou arquivos ou escreveu testes; os testes precisam passar.
- Alterações manuais no checklist devem fazer parte do mesmo commit da implementação correspondente ou do commit final da sprint.
- Tarefas já marcadas serão verificadas por amostragem antes de serem consideradas confiáveis.

## Limites de autonomia

O agente poderá criar e modificar arquivos, instalar dependências previstas, executar migrations locais, testes, linters e commits da sprint. Deverá parar antes de:

- alterar decisões arquiteturais aceitas sem novo ADR;
- publicar em produção;
- usar credenciais ou certificados reais;
- apagar dados persistentes;
- executar migrations destrutivas;
- contratar ou integrar um provedor fiscal não aprovado;
- iniciar outra sprint.

## Sprint 0 — direção

O Sprint 0 estabelecerá a fundação técnica do TJSys:

- monorepositório preparado para backend, frontend, PDV e infraestrutura;
- backend Django e DRF configurado por ambiente;
- PostgreSQL e Redis para desenvolvimento local;
- usuário customizado criado antes das migrations funcionais;
- estrutura inicial de tenancy `Tenant → Empresa → Filial`;
- isolamento por `tenant_id` e base para RLS;
- auditoria, correlation ID, health checks e Outbox inicial;
- CI, lint e testes de isolamento multi-tenant;
- documentação de execução local.

O entregável será considerado válido quando o ambiente subir de forma reproduzível e os testes demonstrarem que um tenant não consegue acessar dados de outro.

## Design system

O projeto ainda não possui `design_system/design-system.html`. O prompt verificará sua existência: se ausente e não exigido pela sprint, seguirá sem ele; se a sprint exigir interface visual, registrará bloqueio ou executará a tarefa explícita de criação aprovada no PRD. Nenhum agente deverá inventar silenciosamente um design system e tratá-lo como decisão oficial.

## Critérios de aceite

- Os dois arquivos ficam dentro de `docs` e são indexados em `docs/DOCUMENT_INDEX.md`.
- O prompt funciona sem sintaxe exclusiva de um agente.
- O número da sprint é fornecido na instrução de execução, sem editar o prompt-base.
- O Sprint 0 possui checklist granular, validações e commit esperado.
- O PRD operacional aponta para documentos normativos, sem duplicar decisões conflitantes.
- Checkboxes só podem ser marcados após validação objetiva.
- O agente encerra depois de uma sprint.

