# Universal Sprint Runner Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Criar um PRD operacional acompanhável e um prompt universal que execute uma sprint do TJSys por vez, marcando tarefas somente após validação objetiva.

**Architecture:** `docs/PRD.md` será o rastreador operacional ligado aos documentos normativos existentes. `docs/PROMPT_EXECUCAO_SPRINT.md` será uma instrução independente de ferramenta que recebe a sprint na mensagem do usuário, lê a documentação e o código, executa apenas tarefas abertas e atualiza o checklist com evidências.

**Tech Stack:** Markdown, Git, Django/DRF, PostgreSQL, Redis, Docker Compose, pytest ou Django TestCase, CI

---

### Task 1: Criar o PRD operacional

**Files:**
- Create: `docs/PRD.md`

- [ ] **Step 1: Criar cabeçalho e protocolo de acompanhamento**

Adicionar título `PRD Operacional — Roadmap de Sprints do TJSys`, status, data, links para o PRD mestre e arquitetura. Definir `- [ ]` como pendente, `- [x]` como concluído com validação e `BLOQUEADO:` como impedimento que mantém a caixa aberta.

- [ ] **Step 2: Criar Sprint 0 granular**

Incluir objetivo, entregável, dependências, critérios de aceite e estas subseções:

1. `0.1 Repositório e ambiente`: diretórios `backend/`, `frontend/`, `pdv/`, `infra/`; Python 3.12+; ambiente virtual; dependências; `.env.example`; configurações por ambiente.
2. `0.2 Infraestrutura local`: Docker Compose com PostgreSQL e Redis; health checks; volumes locais ignorados; comandos de subida e parada.
3. `0.3 Backend Django`: projeto `config`; DRF; apps `core`, `accounts`, `tenancy`, `audit`, `outbox`; timezone e idioma; settings separados; endpoint de saúde.
4. `0.4 Identidade e tenancy`: usuário customizado antes das migrations; `Tenant`, `Company`, `Branch`, membership e escopo ativo; `tenant_id` obrigatório.
5. `0.5 Isolamento e RLS`: contexto transacional do tenant; policies PostgreSQL; negação segura sem contexto; testes cross-tenant e IDOR.
6. `0.6 Auditoria e Outbox`: correlation ID; logs estruturados; registro de auditoria; evento Outbox na mesma transação.
7. `0.7 Qualidade e CI`: formatter, lint, testes, análise de segurança, CI, migrations e documentação local.
8. `0.8 Aceite e commit`: checks Django, migrations, testes, ambiente local e commit `feat: sprint 0 - fundação técnica`.

Cada item deverá usar `- [ ]` e descrever um resultado observável, sem pré-marcar tarefas.

- [ ] **Step 3: Criar roadmap macro posterior**

Adicionar Sprints 1 a 8, todas sem checkboxes granulares e com a observação `Detalhar e aprovar antes de executar`:

- Sprint 1: autenticação, onboarding e autorização;
- Sprint 2: catálogo de produtos e cadastros-base;
- Sprint 3: estoque e movimentações;
- Sprint 4: vendas, pedidos e caixa web;
- Sprint 5: PDV Electron online;
- Sprint 6: contingência offline e sincronização;
- Sprint 7: integração fiscal via `FiscalProvider`;
- Sprint 8: piloto, observabilidade e hardening.

- [ ] **Step 4: Validar estrutura do PRD**

Run:

```powershell
rg -n '^### Sprint [0-8]' docs/PRD.md
rg -n '^- \[ \]' docs/PRD.md
rg -n 'tenant|RLS|IDOR|Outbox|health|CI' docs/PRD.md
```

Expected: 9 sprints, tarefas abertas no Sprint 0 e cobertura dos controles críticos.

- [ ] **Step 5: Commit**

```powershell
git add docs/PRD.md
git commit -m "docs: add operational sprint roadmap"
```

### Task 2: Criar o prompt universal

**Files:**
- Create: `docs/PROMPT_EXECUCAO_SPRINT.md`

- [ ] **Step 1: Criar instrução parametrizada**

Começar com:

```markdown
# Prompt universal para execução de sprint

Execute exclusivamente a **Sprint {NUMERO_DA_SPRINT}** descrita na seção correspondente do `@docs/PRD.md`.
```

Explicar que `{NUMERO_DA_SPRINT}` é informado na mensagem do usuário e não deve ser substituído permanentemente no arquivo.

- [ ] **Step 2: Definir leitura e análise obrigatórias**

Ordenar a leitura do PRD operacional, PRD mestre, SAD, ADRs, domínio, requisitos, API, testes, segurança, repositório e histórico Git. Exigir verificação condicional de `design_system/design-system.html` sem inventar o arquivo quando ausente.

- [ ] **Step 3: Definir regras de execução e checkboxes**

Exigir uma tarefa por vez, testes aplicáveis, evidência antes de `- [x]`, manutenção de itens parciais como `- [ ]`, anotação `BLOQUEADO:`, commits pequenos e proibição de iniciar outra sprint.

- [ ] **Step 4: Definir segurança e relatório final**

Proibir segredos, certificados reais, produção, exclusão de dados, migrations destrutivas e mudança arquitetural sem ADR. Exigir relatório com tarefas concluídas, pendentes, testes, migrations, commits, riscos e próximo passo recomendado.

- [ ] **Step 5: Adicionar exemplo de invocação**

```text
Leia @docs/PROMPT_EXECUCAO_SPRINT.md e execute a Sprint 0 de @docs/PRD.md.
Atualize os checkboxes somente após validar cada tarefa e pare ao concluir a sprint.
```

- [ ] **Step 6: Validar portabilidade**

Run:

```powershell
rg -n 'NUMERO_DA_SPRINT|docs/PRD.md|\- \[x\]|BLOQUEADO|não inicie|design_system' docs/PROMPT_EXECUCAO_SPRINT.md
rg -n 'Codex-only|Claude-only|cursor rule' docs/PROMPT_EXECUCAO_SPRINT.md
```

Expected: primeiro comando encontra todas as regras; segundo não encontra sintaxe proprietária.

- [ ] **Step 7: Commit**

```powershell
git add docs/PROMPT_EXECUCAO_SPRINT.md
git commit -m "docs: add universal sprint prompt"
```

### Task 3: Integrar à governança documental

**Files:**
- Modify: `docs/DOCUMENT_INDEX.md`
- Modify: `docs/CHANGELOG.md`
- Modify: `docs/10_Releases/MILESTONE-001_MANIFEST.txt`

- [ ] **Step 1: Indexar os documentos**

Adicionar `PRD-OPS-001 | Operational Sprint Roadmap` apontando para `PRD.md` e `PROMPT-SPRINT-001 | Universal Sprint Execution Prompt` apontando para `PROMPT_EXECUCAO_SPRINT.md`, ambos na versão `0.1.0` e status `Review`.

- [ ] **Step 2: Atualizar changelog**

Registrar em `Added` o PRD operacional acompanhável e o prompt universal independente de agente.

- [ ] **Step 3: Regenerar manifesto**

Recalcular caminho relativo, tamanho e SHA-256 de todos os arquivos em `docs`, exceto o próprio manifesto.

- [ ] **Step 4: Verificar caminhos e hashes**

Validar que cada caminho do índice existe e cada entrada do manifesto corresponde ao arquivo atual.

- [ ] **Step 5: Commit**

```powershell
git add docs/DOCUMENT_INDEX.md docs/CHANGELOG.md docs/10_Releases/MILESTONE-001_MANIFEST.txt
git commit -m "docs: index sprint execution artifacts"
```

### Task 4: Verificação final

**Files:**
- Verify: `docs/PRD.md`
- Verify: `docs/PROMPT_EXECUCAO_SPRINT.md`
- Verify: `docs/DOCUMENT_INDEX.md`

- [ ] **Step 1: Confirmar que nenhuma tarefa nasceu concluída**

Run: `rg -n '\- \[x\]' docs/PRD.md`

Expected: nenhuma ocorrência.

- [ ] **Step 2: Confirmar referências essenciais**

Run:

```powershell
rg -n 'PRD-001_Master|SAD-001|ADR|TST-001|SEC-001' docs/PRD.md docs/PROMPT_EXECUCAO_SPRINT.md
```

Expected: documentos normativos citados pelo roadmap ou pelo prompt.

- [ ] **Step 3: Confirmar formatação e estado Git**

Run:

```powershell
git diff --check
git status --short
git log --oneline -4
```

Expected: sem erros de formatação, worktree limpa e commits do plano e dos três artefatos.

