# Documentation Baseline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Criar uma baseline documental profissional, consistente e rastreável para iniciar o TJSys sem produzir código nesta fase.

**Architecture:** Toda a documentação vigente ficará em `C:\ERP\docs`, organizada por governança, produto, arquitetura, domínio, requisitos, API, diagramas, testes, segurança, operações e releases. Os rascunhos anteriores permanecerão imutáveis em `docs/99_Archive`; novos documentos começarão como `v0.1.0 Draft` e usarão identificadores rastreáveis.

**Tech Stack:** Markdown, Mermaid, Git, PowerShell, `rg`, contratos OpenAPI em YAML e JSON Schema para validação futura.

---

## Mapa de arquivos

| Caminho | Responsabilidade |
|---|---|
| `docs/README.md` | Porta de entrada da documentação |
| `docs/DOCUMENT_INDEX.md` | Registro oficial de documentos, versões e estados |
| `docs/CHANGELOG.md` | Histórico consolidado da documentação |
| `docs/00_Governance/PG-001_Product_Governance_v0.1.0.md` | Ciclo de vida, aprovação e controle de mudanças |
| `docs/00_Governance/PC-001_Project_Charter_v0.1.0.md` | Mandato, objetivos, escopo e stakeholders |
| `docs/00_Governance/DOC-STD-001_Documentation_Standard_v0.1.0.md` | Padrão de metadados, IDs e versionamento |
| `docs/01_Product/PV-001_Product_Vision_v0.1.0.md` | Visão e resultados esperados |
| `docs/01_Product/PS-001_Product_Strategy_v0.1.0.md` | Estratégia de entrada e evolução |
| `docs/01_Product/PB-001_Product_Bible_v0.1.0.md` | Vocabulário, princípios e regras canônicas |
| `docs/01_Product/PRD-001_Master_v0.1.0.md` | Requisitos mestres do produto |
| `docs/02_Architecture/SAD-001_Software_Architecture_v0.1.0.md` | Arquitetura lógica e física |
| `docs/02_Architecture/EH-001_Engineering_Handbook_v0.1.0.md` | Práticas de engenharia |
| `docs/02_Architecture/ADR/*.md` | Decisões arquiteturais aprovadas |
| `docs/03_Domain/DDD-001_Domain_Design_v0.1.0.md` | Bounded contexts, agregados e eventos |
| `docs/04_Requirements/SRS-001_System_Requirements_v0.1.0.md` | Requisitos funcionais e não funcionais |
| `docs/04_Requirements/TRACEABILITY_MATRIX.md` | Relação requisito → caso de uso → teste |
| `docs/05_API/API-001_API_Standards_v0.1.0.md` | Convenções REST, erros e idempotência |
| `docs/05_API/openapi.yaml` | Esqueleto versionado do contrato público |
| `docs/06_Diagrams/*.md` | Diagramas Mermaid versionáveis |
| `docs/07_Testing/TST-001_Test_Strategy_v0.1.0.md` | Estratégia e gates de qualidade |
| `docs/08_Security/SEC-001_Security_Multitenancy_v0.1.0.md` | Segurança, RLS, LGPD e segredos |
| `docs/09_Operations/OPS-001_Operations_Observability_v0.1.0.md` | Operação, SLOs, backup e resposta a incidentes |
| `docs/10_Releases/REL-001_Release_Strategy_v0.1.0.md` | Ambientes, releases e rollback |

### Task 1: Criar fundação e padrão documental

**Files:**
- Create: `docs/README.md`
- Create: `docs/DOCUMENT_INDEX.md`
- Create: `docs/CHANGELOG.md`
- Create: `docs/00_Governance/DOC-STD-001_Documentation_Standard_v0.1.0.md`
- Modify: `docs/superpowers/specs/2026-07-14-enterprise-commerce-platform-foundation-design.md`

- [ ] **Step 1: Criar os diretórios oficiais**

Criar `00_Governance`, `01_Product`, `02_Architecture/ADR`, `03_Domain`, `04_Requirements`, `05_API`, `06_Diagrams`, `07_Testing`, `08_Security`, `09_Operations` e `10_Releases` dentro de `docs`. Não mover nem modificar `99_Archive`.

- [ ] **Step 2: Definir o cabeçalho obrigatório**

Registrar em `DOC-STD-001` esta tabela obrigatória em todos os documentos controlados:

```markdown
| Campo | Valor |
|---|---|
| Código | PG-001 |
| Título | Product Governance |
| Versão | 0.1.0 |
| Status | Draft |
| Autor | Arquitetura de Software |
| Aprovador | Product Owner |
| Última atualização | 2026-07-14 |
| Dependências | DESIGN-FOUNDATION-001 |
| Documentos relacionados | DOCUMENT_INDEX |
```

Definir os estados `Draft → Review → Approved → Baseline → Superseded` e reservar `1.0.0` à primeira baseline.

- [ ] **Step 3: Criar README, índice e changelog**

O README deve explicar produto, navegação, estados e ordem de leitura. O índice deve listar todos os arquivos deste plano como `Planned`, exceto o design aprovado e os arquivos de arquivo morto. O changelog deve registrar a recuperação da conversa, o arquivamento dos rascunhos e a aprovação do foundation design.

- [ ] **Step 4: Validar a fundação**

Run:

```powershell
rg -n "Draft|Review|Approved|Baseline|Superseded" docs/00_Governance/DOC-STD-001_Documentation_Standard_v0.1.0.md
rg -n "PG-001|PC-001|PV-001|PRD-001|SAD-001|DDD-001|SRS-001" docs/DOCUMENT_INDEX.md
```

Expected: os cinco estados aparecem no padrão e todos os documentos fundamentais aparecem no índice.

- [ ] **Step 5: Commit**

```text
docs: establish documentation governance
```

### Task 2: Produzir governança e charter

**Files:**
- Create: `docs/00_Governance/PG-001_Product_Governance_v0.1.0.md`
- Create: `docs/00_Governance/PC-001_Project_Charter_v0.1.0.md`
- Modify: `docs/DOCUMENT_INDEX.md`
- Modify: `docs/CHANGELOG.md`

- [ ] **Step 1: Escrever PG-001**

Incluir papéis Product Owner, Architecture Owner, Security Owner e Document Owner; matriz RACI; processo de RFC/ADR; critérios de aprovação; versionamento; Definition of Ready; Definition of Done; gestão de riscos; exceções e auditoria de mudanças.

- [ ] **Step 2: Escrever PC-001**

Registrar problema, oportunidade, objetivos, não objetivos, nicho inicial, stakeholders, premissas, restrições, riscos, métricas de sucesso, escopo do MVP e modelo de responsabilidade fiscal no qual o cliente paga provedor e certificado.

- [ ] **Step 3: Validar decisões obrigatórias**

Run:

```powershell
rg -ni "monólito modular|multiempresa|multifilial|cliente.*provedor|IA.*futur" docs/00_Governance docs/01_Product docs/superpowers/specs
```

Expected: cada decisão aparece ao menos uma vez em fonte vigente ou no design aprovado.

- [ ] **Step 4: Atualizar índice e changelog**

Marcar PG-001 e PC-001 como `0.1.0 / Draft`, apontando seus caminhos exatos.

- [ ] **Step 5: Commit**

```text
docs: define governance and project charter
```

### Task 3: Consolidar visão, estratégia e Product Bible

**Files:**
- Create: `docs/01_Product/PV-001_Product_Vision_v0.1.0.md`
- Create: `docs/01_Product/PS-001_Product_Strategy_v0.1.0.md`
- Create: `docs/01_Product/PB-001_Product_Bible_v0.1.0.md`
- Modify: `docs/DOCUMENT_INDEX.md`
- Modify: `docs/CHANGELOG.md`

- [ ] **Step 1: Escrever visão e estratégia**

Definir casas de rações como beachhead market; expansão futura; proposta de valor; personas proprietário, gerente, caixa, estoquista, comprador, financeiro, contador e administrador SaaS; diferenciais; resultados e métricas.

- [ ] **Step 2: Escrever Product Bible**

Consolidar terminologia canônica para Tenant, Empresa, Filial, Usuário, Produto, Unidade, Estoque, Compra, Venda, Caixa, Documento Fiscal e Dispositivo PDV. Registrar princípios `Core ERP + módulos por segmento`, online por padrão, contingência restrita, fiscal desacoplado e IA futura.

- [ ] **Step 3: Verificar vocabulário**

Run:

```powershell
rg -n "^## .*Tenant|^## .*Empresa|^## .*Filial|^## .*Produto|^## .*Venda|^## .*Documento Fiscal" docs/01_Product/PB-001_Product_Bible_v0.1.0.md
```

Expected: todos os conceitos possuem definição própria e não contraditória.

- [ ] **Step 4: Atualizar índice, changelog e commit**

```text
docs: define product vision and vocabulary
```

### Task 4: Registrar decisões arquiteturais

**Files:**
- Create: `docs/02_Architecture/ADR/ADR-001_Modular_Monolith.md`
- Create: `docs/02_Architecture/ADR/ADR-002_Shared_Database_RLS.md`
- Create: `docs/02_Architecture/ADR/ADR-003_PDV_Online_Offline_Contingency.md`
- Create: `docs/02_Architecture/ADR/ADR-004_External_Fiscal_Provider.md`
- Create: `docs/02_Architecture/ADR/ADR-005_AI_Future_Capability.md`
- Create: `docs/02_Architecture/ADR/ADR-006_Transactional_Outbox.md`

- [ ] **Step 1: Usar estrutura ADR uniforme**

Cada ADR deve conter Contexto, Forças, Opções, Decisão, Consequências positivas, Consequências negativas, Riscos, Mitigações e Critérios de revisão.

- [ ] **Step 2: Registrar alternativas rejeitadas**

Documentar microsserviços, schema por tenant, banco por tenant, PDV totalmente offline, integração fiscal direta e IA no MVP, explicando por que não foram escolhidos agora.

- [ ] **Step 3: Validar ADRs**

Run:

```powershell
rg -L "## Consequências negativas" docs/02_Architecture/ADR/*.md
```

Expected: nenhum arquivo listado.

- [ ] **Step 4: Atualizar índice, changelog e commit**

```text
docs: record foundational architecture decisions
```

### Task 5: Criar SAD e Engineering Handbook

**Files:**
- Create: `docs/02_Architecture/SAD-001_Software_Architecture_v0.1.0.md`
- Create: `docs/02_Architecture/EH-001_Engineering_Handbook_v0.1.0.md`
- Modify: `docs/DOCUMENT_INDEX.md`
- Modify: `docs/CHANGELOG.md`

- [ ] **Step 1: Escrever SAD-001**

Cobrir contexto, containers, módulos Django, dependências permitidas, fluxo HTTP, Celery, Outbox, PostgreSQL/RLS, Redis, S3, frontend React, PDV Electron/SQLite, fiscal, observabilidade, implantação e evolução futura.

- [ ] **Step 2: Escrever EH-001**

Definir estilo Python, typing, lint, formatação, arquitetura por módulo, transações, dinheiro, datas, migrations, APIs, eventos, logging, segurança, testes, revisão, commits e política de dependências.

- [ ] **Step 3: Validar cobertura técnica**

Run:

```powershell
rg -ni "Django|DRF|PostgreSQL|RLS|Redis|Celery|Outbox|React|Electron|SQLite|OpenAPI|OpenTelemetry" docs/02_Architecture/SAD-001_Software_Architecture_v0.1.0.md
```

Expected: todas as tecnologias e mecanismos aparecem com responsabilidade explícita.

- [ ] **Step 4: Atualizar controles e commit**

```text
docs: define software and engineering architecture
```

### Task 6: Modelar domínio e eventos

**Files:**
- Create: `docs/03_Domain/DDD-001_Domain_Design_v0.1.0.md`
- Create: `docs/03_Domain/DOMAIN_EVENT_CATALOG.md`
- Create: `docs/03_Domain/INTEGRATION_CONTRACTS.md`

- [ ] **Step 1: Definir bounded contexts**

Modelar Platform, Identity, Organizations, Catalog, Inventory, Purchasing, Sales, PDV, Cash Management, Financial, Fiscal, Analytics, Integrations e Audit. Para cada contexto, listar responsabilidade, agregados, invariantes, entradas, saídas e dependências permitidas.

- [ ] **Step 2: Definir agregados e invariantes**

Incluir Tenant, Empresa, Filial, Produto, MovimentoEstoque, PedidoCompra, Venda, SessaoCaixa, LancamentoFinanceiro, DocumentoFiscal e DispositivoPDV. Valores monetários usam Decimal; vendas concluídas e XML autorizado são imutáveis.

- [ ] **Step 3: Catalogar eventos**

Incluir `SaleCompleted`, `StockMovementRecorded`, `PurchaseReceived`, `CashSessionClosed`, `FiscalDocumentRequested`, `FiscalDocumentAuthorized`, `FiscalDocumentRejected` e `PDVOperationSynchronized`, com versão e payload mínimo.

- [ ] **Step 4: Validar e commit**

Run:

```powershell
rg -n "SaleCompleted|FiscalDocumentAuthorized|PDVOperationSynchronized" docs/03_Domain/DOMAIN_EVENT_CATALOG.md
```

Expected: os três eventos aparecem com produtor, consumidores e esquema versionado.

```text
docs: model domain boundaries and events
```

### Task 7: Escrever PRD Master e SRS

**Files:**
- Create: `docs/01_Product/PRD-001_Master_v0.1.0.md`
- Create: `docs/04_Requirements/SRS-001_System_Requirements_v0.1.0.md`
- Create: `docs/04_Requirements/TRACEABILITY_MATRIX.md`

- [ ] **Step 1: Escrever PRD-001**

Incluir problemas, personas, jornadas, capabilities, MVP, fora do escopo, requisitos por capability, requisitos de PDV/fiscal, métricas, riscos, roadmap e critérios de aceite do produto.

- [ ] **Step 2: Escrever SRS-001 com IDs**

Usar `FR-<DOMÍNIO>-NNN` para requisitos funcionais e `NFR-<CATEGORIA>-NNN` para não funcionais. Cada requisito deve ser verificável, ter prioridade MoSCoW, origem, dependências e critério de aceite.

- [ ] **Step 3: Criar matriz de rastreabilidade**

Usar colunas `Requirement ID`, `PRD Section`, `Use Case`, `Architecture`, `Test ID`, `Status`. Registrar todos os requisitos do MVP; testes ainda não implementados ficam com status `Planned`, nunca sem identificador.

- [ ] **Step 4: Validar IDs exclusivos**

Run:

```powershell
$ids = rg -o "(FR|NFR)-[A-Z]+-[0-9]{3}" docs/04_Requirements/SRS-001_System_Requirements_v0.1.0.md | Sort-Object
$duplicates = $ids | Group-Object | Where-Object Count -gt 1
if ($duplicates) { $duplicates; exit 1 }
```

Expected: exit code 0 e nenhuma duplicidade.

- [ ] **Step 5: Atualizar controles e commit**

```text
docs: define master product requirements
```

### Task 8: Definir contratos de API

**Files:**
- Create: `docs/05_API/API-001_API_Standards_v0.1.0.md`
- Create: `docs/05_API/openapi.yaml`
- Create: `docs/05_API/ERROR_CATALOG.md`

- [ ] **Step 1: Definir padrões**

Documentar `/api/v1`, autenticação, tenant context, paginação, filtros, ordenação, datas ISO 8601, dinheiro como string decimal, correlation ID, idempotency key, optimistic locking, erros Problem Details e compatibilidade.

- [ ] **Step 2: Criar esqueleto OpenAPI válido**

Incluir metadados, servidores local/homologação, security schemes, schemas `Problem`, `Money`, `TenantContext` e endpoint `/health` como única operação inicial. Não inventar endpoints de domínio antes dos PRDs por capability.

- [ ] **Step 3: Criar catálogo de erros**

Definir famílias AUTH, TENANT, VALIDATION, CONFLICT, INVENTORY, CASH, FISCAL, SYNC e INTERNAL, com HTTP status e política de retentativa.

- [ ] **Step 4: Validar referências e commit**

Run:

```powershell
rg -n "Idempotency-Key|X-Correlation-ID|application/problem\+json|optimistic" docs/05_API/API-001_API_Standards_v0.1.0.md
```

Expected: os quatro contratos aparecem.

```text
docs: establish API contracts
```

### Task 9: Segurança e multi-tenancy

**Files:**
- Create: `docs/08_Security/SEC-001_Security_Multitenancy_v0.1.0.md`
- Create: `docs/08_Security/THREAT_MODEL.md`
- Create: `docs/08_Security/DATA_CLASSIFICATION.md`

- [ ] **Step 1: Escrever SEC-001**

Cobrir resolução de tenant, RLS, ORM, Celery, cache, arquivos, eventos, permissões por contexto, MFA, certificados, gestão de segredos, LGPD, retenção e testes de isolamento.

- [ ] **Step 2: Criar threat model**

Usar STRIDE para acesso cruzado, IDOR, webhook replay, exfiltração de certificado, dispositivo PDV roubado, fila adulterada, elevação de privilégio e backup exposto. Cada ameaça deve ter controle preventivo, detectivo e resposta.

- [ ] **Step 3: Classificar dados**

Definir Public, Internal, Confidential e Restricted. Certificados, tokens fiscais, credenciais, dados financeiros e documentos fiscais serão `Restricted`.

- [ ] **Step 4: Validar e commit**

Run:

```powershell
rg -n "preventivo|detectivo|resposta" docs/08_Security/THREAT_MODEL.md
rg -n "Restricted" docs/08_Security/DATA_CLASSIFICATION.md
```

Expected: controles em três camadas e dados críticos classificados.

```text
docs: define security and tenant isolation
```

### Task 10: Testes, operação e releases

**Files:**
- Create: `docs/07_Testing/TST-001_Test_Strategy_v0.1.0.md`
- Create: `docs/07_Testing/TEST_CATALOG.md`
- Create: `docs/09_Operations/OPS-001_Operations_Observability_v0.1.0.md`
- Create: `docs/09_Operations/INCIDENT_RESPONSE.md`
- Create: `docs/10_Releases/REL-001_Release_Strategy_v0.1.0.md`

- [ ] **Step 1: Escrever estratégia de testes**

Cobrir domínio, aplicação, PostgreSQL/RLS, API, contratos, E2E, offline, fiscal, segurança, performance, backup e restauração. Definir IDs `TEST-<ÁREA>-NNN` e gates por ambiente.

- [ ] **Step 2: Escrever operação e incidentes**

Definir logs estruturados, métricas, tracing, SLOs iniciais, alertas, dashboards, runbooks, classificação SEV-1 a SEV-4, comunicação e postmortem sem culpados.

- [ ] **Step 3: Escrever estratégia de releases**

Definir local, test, homologação, staging e produção; migrations compatíveis; feature flags; canary para backend; atualização gradual do PDV; rollback e compatibilidade de protocolo.

- [ ] **Step 4: Validar e commit**

Run:

```powershell
rg -n "RLS|IDOR|idempotência|offline|fiscal|restauração" docs/07_Testing/TST-001_Test_Strategy_v0.1.0.md
rg -n "SEV-1|SEV-2|SEV-3|SEV-4" docs/09_Operations/INCIDENT_RESPONSE.md
```

Expected: todos os riscos críticos e as quatro severidades aparecem.

```text
docs: define quality operations and releases
```

### Task 11: Diagramas e revisão cruzada

**Files:**
- Create: `docs/06_Diagrams/C4_CONTEXT.md`
- Create: `docs/06_Diagrams/C4_CONTAINER.md`
- Create: `docs/06_Diagrams/MODULE_DEPENDENCIES.md`
- Create: `docs/06_Diagrams/PDV_SYNC_SEQUENCE.md`
- Create: `docs/06_Diagrams/FISCAL_STATE_FLOW.md`
- Modify: `docs/DOCUMENT_INDEX.md`
- Modify: `docs/CHANGELOG.md`

- [ ] **Step 1: Criar diagramas Mermaid**

Representar atores e sistemas externos, containers, dependências entre módulos, sincronização do PDV e máquina de estados fiscal. Diagramas devem reproduzir o SAD e os ADRs, sem introduzir componentes novos.

- [ ] **Step 2: Executar varredura de placeholders**

Run:

```powershell
$markers = @('T'+'BD', 'TO'+'DO', 'FIX'+'ME', 'preencher'+' depois', 'definir'+' depois')
Get-ChildItem docs\00_Governance,docs\01_Product,docs\02_Architecture,docs\03_Domain,docs\04_Requirements,docs\05_API,docs\06_Diagrams,docs\07_Testing,docs\08_Security,docs\09_Operations,docs\10_Releases -Recurse -File | Select-String -Pattern $markers
```

Expected: nenhum resultado. Decisões futuras legítimas devem estar descritas como critérios de revisão em ADRs, não como placeholders.

- [ ] **Step 3: Verificar links e índices**

Confirmar que todo Markdown vigente aparece em `DOCUMENT_INDEX.md`, que nenhum arquivo vigente aponta para caminhos da antiga pasta intermediária e que `99_Archive` está marcado como não normativo.

- [ ] **Step 4: Revisar consistência**

Comparar PG, PC, PV, PS, PB, PRD, SAD, DDD, SRS, SEC e TST para garantir as mesmas decisões: monólito modular, banco compartilhado com RLS, `Tenant → Empresa → Filial`, PDV online com contingência, fiscal pago pelo cliente e IA futura.

- [ ] **Step 5: Atualizar índice e changelog**

Marcar todos os documentos produzidos como `0.1.0 / Draft`, registrar a conclusão da Milestone Documentation Foundation e manter o foundation design como `0.1.1 / Review` até sua promoção formal.

- [ ] **Step 6: Commit**

```text
docs: complete documentation foundation
```

### Task 12: Entrega e pacote da milestone

**Files:**
- Create: `docs/10_Releases/MILESTONE-001_Documentation_Foundation.md`
- Create: `docs/10_Releases/MILESTONE-001_MANIFEST.txt`

- [ ] **Step 1: Criar manifesto determinístico**

Listar caminho, tamanho e SHA-256 de cada arquivo vigente e dos arquivos históricos. Excluir `.git` e o próprio ZIP.

- [ ] **Step 2: Criar nota de entrega**

Registrar objetivo, documentos entregues, decisões aprovadas, itens não iniciados, riscos residuais e próximo checkpoint: revisão dos documentos `v0.1.0` antes de qualquer promoção para `Review`.

- [ ] **Step 3: Criar ZIP**

Gerar `C:\ERP\Milestone_001_Documentation_Foundation_v0.1.0.zip` contendo somente `docs` e preservando a árvore de diretórios.

- [ ] **Step 4: Verificar ZIP e Git**

Run:

```powershell
Get-FileHash -Algorithm SHA256 'C:\ERP\Milestone_001_Documentation_Foundation_v0.1.0.zip'
git status --short
```

Expected: hash SHA-256 exibido e worktree limpo; o ZIP deve ser tratado como artefato de entrega e não precisa entrar no Git.

- [ ] **Step 5: Commit final dos metadados da milestone**

```text
docs: publish documentation milestone metadata
```
