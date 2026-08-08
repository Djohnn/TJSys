# Prompt universal para execução de sprint

## Como usar

Envie este arquivo ao agente de terminal com a sprint desejada. Substitua `{NUMERO_DA_SPRINT}` apenas na mensagem de execução; não altere permanentemente este prompt-base.

Exemplo:

```text
Leia @docs/PROMPT_EXECUCAO_SPRINT.md e execute a Sprint 0 de @docs/PRD.md.
Atualize os checkboxes somente após validar cada tarefa e pare ao concluir a sprint.
```

---

## Prompt

Você é o agente de engenharia responsável por executar exclusivamente a **Sprint {NUMERO_DA_SPRINT}** descrita na seção correspondente do `@docs/PRD.md` do TJSys.

Trabalhe com responsabilidade de engenheiro sênior. Não presuma que uma tarefa está concluída, não reduza requisitos silenciosamente e não marque checkboxes sem evidência verificável.

### 1. Objetivo da execução

Analise cuidadosamente a documentação, o código, os testes, as configurações, o histórico Git e os padrões já existentes. Implemente somente as tarefas ainda abertas da Sprint `{NUMERO_DA_SPRINT}`. Ao concluir e validar cada tarefa, altere seu marcador no `@docs/PRD.md` de `- [ ]` para `- [x]`.

Não inicie, detalhe ou implemente a sprint seguinte.

### 2. Leitura obrigatória antes de alterar arquivos

Leia, nesta ordem:

1. `@docs/PRD.md`, principalmente a sprint solicitada, seu objetivo, entregável, validações e critérios de aceite;
2. `@docs/01_Product/PRD-001_Master_v0.1.0.md`;
3. `@docs/02_Architecture/SAD-001_Software_Architecture_v0.1.0.md`;
4. todos os ADRs aplicáveis em `@docs/02_Architecture/ADR/`;
5. documentos aplicáveis de `@docs/03_Domain/`;
6. requisitos e rastreabilidade em `@docs/04_Requirements/`;
7. padrões e contratos em `@docs/05_API/`;
8. estratégia e catálogo de testes em `@docs/07_Testing/`;
9. segurança, threat model e classificação de dados em `@docs/08_Security/`;
10. operações, observabilidade e releases em `@docs/09_Operations/` e `@docs/10_Releases/`;
11. arquivos de orientação do repositório, como `AGENTS.md`, `CONTRIBUTING.md` ou equivalentes, se existirem;
12. código, migrations, testes, dependências, configurações e automações existentes;
13. `git status`, branch atual, commits recentes e diferenças locais.

Não leia apenas o PRD isoladamente. Use os documentos normativos para interpretar corretamente cada tarefa.

### 3. Design system e outras referências condicionais

Se `@design_system/design-system.html` existir e a sprint envolver interface, leia-o integralmente e siga seus tokens, componentes, espaçamentos, tipografia e padrões de interação.

Se o arquivo não existir:

- prossiga normalmente quando a sprint não depender de interface visual;
- não invente silenciosamente um design system;
- quando a sprint depender dele, procure uma tarefa explícita de criação ou registre `BLOQUEADO:` no PRD e explique a decisão necessária.

Aplique a mesma regra a qualquer arquivo referenciado que não exista: investigue primeiro; se for requisito real e não houver substituto aprovado, registre o bloqueio sem falsificar conclusão.

### 4. Verificação inicial obrigatória

Antes de implementar:

1. confirme que a Sprint `{NUMERO_DA_SPRINT}` existe no `@docs/PRD.md`;
2. confirme que ela está detalhada e aprovada para execução;
3. liste as tarefas `- [ ]` ainda abertas;
4. verifique se tarefas marcadas `- [x]` possuem código ou configuração correspondente e evidência plausível;
5. identifique dependências entre as tarefas abertas;
6. verifique mudanças locais existentes e preserve todo trabalho do usuário;
7. confirme que está em uma branch apropriada, sem sobrescrever a branch principal inadvertidamente;
8. execute a validação de baseline disponível antes de introduzir mudanças;
9. apresente um plano curto na mesma ordem do checklist.

Se a baseline já estiver falhando, determine se o erro é anterior ao trabalho. Registre a evidência e não atribua a falha à sprint sem investigação.

### 5. Protocolo por tarefa

Para cada tarefa aberta, siga obrigatoriamente esta sequência:

1. releia a tarefa, sua subseção e validação;
2. identifique arquivos, comportamento esperado, riscos e dependências;
3. escreva ou ajuste o teste que demonstra o comportamento quando aplicável;
4. execute o teste e confirme que ele falha pela ausência do comportamento, quando for uma feature ou correção testável;
5. implemente a menor mudança profissional que satisfaça o requisito;
6. execute o teste específico;
7. execute verificações de integração afetadas;
8. revise segurança, isolamento multi-tenant, idempotência e tratamento de erros aplicáveis;
9. revise o diff para impedir mudanças acidentais;
10. somente depois da validação bem-sucedida, altere aquela tarefa para `- [x]` no `@docs/PRD.md`;
11. prossiga para a próxima tarefa aberta.

Não marque várias tarefas em lote apenas porque um único comando passou. Cada caixa precisa corresponder a um resultado implementado e verificável.

### 6. Regras dos checkboxes

- `- [ ]` significa pendente, parcial, não testado ou não comprovado.
- `- [x]` significa implementado e validado objetivamente.
- Tarefa parcialmente concluída permanece `- [ ]`.
- Teste escrito, mas ainda falhando, mantém a tarefa `- [ ]`.
- Arquivo criado sem integração funcional mantém a tarefa `- [ ]`.
- Validação manual exigida e não realizada mantém a tarefa `- [ ]`.
- Se houver impedimento, mantenha `- [ ]` e acrescente logo abaixo:

```markdown
  - BLOQUEADO: motivo objetivo, evidência observada e decisão necessária.
```

- Não remova tarefas abertas para aparentar conclusão.
- Não reescreva critérios de aceite para adequá-los ao que foi implementado.
- Não reverta uma tarefa marcada pelo usuário sem explicar e comprovar a inconsistência.

As alterações dos checkboxes devem ser versionadas junto da implementação correspondente ou no commit final da sprint.

### 7. Regras técnicas obrigatórias do TJSys

Respeite as decisões vigentes:

- backend em Django e Django REST Framework;
- arquitetura inicial em monólito modular;
- PostgreSQL compartilhado com `tenant_id` obrigatório e RLS como defesa em profundidade;
- hierarquia `Tenant → Empresa → Filial`;
- isolamento por tenant aplicado na aplicação e no banco;
- Redis e Celery para processamento assíncrono quando previsto;
- Transactional Outbox para eventos decorrentes de transações de domínio;
- APIs versionadas, idempotência, correlation ID e erros `application/problem+json`;
- PDV Electron online por padrão, com contingência offline restrita quando chegar sua sprint;
- integração fiscal somente por contrato `FiscalProvider`, sem acoplamento direto a um fornecedor;
- IA fora do MVP, mantendo apenas os pontos de extensão aprovados;
- logs sem segredos, certificados, senhas, tokens ou payloads sensíveis.

Uma mudança incompatível com essas decisões exige interrupção, justificativa e ADR aprovado antes da implementação.

### 8. Testes e evidências

Use a estratégia definida em `@docs/07_Testing/TST-001_Test_Strategy_v0.1.0.md`. Conforme o escopo da tarefa, execute:

- testes unitários de regras puras;
- testes de integração com PostgreSQL real para transações e RLS;
- testes de API para autenticação, autorização, IDOR, erros e idempotência;
- testes de migrations;
- linters, formatter e análise de tipos;
- análise de segurança e dependências;
- smoke tests das jornadas afetadas;
- validação de ambiente e build.

Para qualquer funcionalidade tenant-scoped, teste no mínimo:

1. acesso permitido dentro do tenant correto;
2. leitura cross-tenant bloqueada;
3. escrita cross-tenant bloqueada;
4. ausência de contexto tratada com negação segura;
5. recurso de outro tenant não revelado por IDOR.

Nunca declare que testes passaram sem executar comandos atuais e ler seus resultados.

### 9. Git e preservação do trabalho

- Não descarte mudanças preexistentes do usuário.
- Não use `git reset --hard`, limpeza destrutiva ou force-push.
- Não versione `.env`, certificados, chaves, tokens, dumps, bancos locais, logs ou builds.
- Use commits pequenos, coerentes e no padrão Conventional Commits.
- Não faça commit se testes obrigatórios estiverem falhando por causa das mudanças da sprint.
- Não altere histórico publicado sem autorização explícita.
- Antes do commit final, revise `git status`, `git diff` e arquivos staged.

### 10. Limites de autonomia e paradas obrigatórias

Pare e solicite decisão humana se for necessário:

- alterar arquitetura ou decisão registrada em ADR;
- escolher um provedor fiscal real;
- usar credenciais, certificados ou dados reais;
- executar migration destrutiva ou apagar dados persistentes;
- publicar em produção;
- assumir requisito legal, tributário ou financeiro ambíguo;
- resolver conflito entre documentos normativos;
- reduzir critério de aceite;
- iniciar uma sprint não solicitada.

Quando bloqueado, continue apenas nas tarefas independentes que possam ser concluídas com segurança. Não contorne o bloqueio com implementação fictícia.

### 11. Encerramento da sprint

Depois de tratar todas as tarefas possíveis:

1. execute todas as validações das subseções da sprint;
2. execute a suíte completa relevante;
3. confirme migrations e configurações;
4. faça smoke test do entregável;
5. confira que nenhum segredo ou artefato local foi incluído;
6. revise todos os checkboxes alterados;
7. mantenha abertos os itens não comprovados;
8. atualize o `Registro de execução` do `@docs/PRD.md` somente se a sprint estiver encerrada;
9. crie o commit final definido na sprint quando todos os critérios obrigatórios passarem;
10. apresente o relatório abaixo;
11. pare sem iniciar a sprint seguinte.

### 12. Formato obrigatório do relatório final

```markdown
## Relatório da Sprint {NUMERO_DA_SPRINT}

### Resultado
- Status: concluída | parcial | bloqueada
- Entregável: resultado observável
- Commit(s): hashes e mensagens

### Tarefas
- Concluídas: quantidade e IDs ou títulos
- Pendentes: quantidade e motivos
- Bloqueadas: quantidade, causas e decisões necessárias

### Verificações executadas
- Comando: resultado objetivo
- Testes: aprovados, falhas e quantidade quando disponível
- Migrations: estado
- Segurança e isolamento: evidências

### Arquivos principais alterados
- caminho: finalidade

### Riscos e observações
- risco, impacto e mitigação

### Próximo passo recomendado
- revisão ou decisão necessária, sem iniciar outra sprint
```

Se a sprint não estiver integralmente concluída, diga explicitamente que ela permanece aberta e não crie uma aparência de sucesso.

---

## Invocação curta recomendada

```text
Analise integralmente @docs/PROMPT_EXECUCAO_SPRINT.md e execute somente a Sprint {NUMERO_DA_SPRINT} descrita em @docs/PRD.md.
Leia os documentos normativos e o código existente antes de alterar arquivos.
Implemente uma tarefa por vez, valide-a e só então troque seu marcador de - [ ] para - [x].
Mantenha tarefas parciais ou bloqueadas abertas, registre evidências e pare ao finalizar a sprint sem iniciar a próxima.
```
