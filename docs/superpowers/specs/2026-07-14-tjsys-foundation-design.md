# Zyrp — Foundation Design

## Controle do documento

| Campo | Valor |
|---|---|
| Código | DESIGN-FOUNDATION-001 |
| Versão | 0.1.1 |
| Status | Review |
| Data | 2026-07-14 |
| Autor | Arquitetura de Software |
| Aprovador | Product Owner |

## 1. Propósito

Esta especificação consolida as decisões aprovadas para iniciar profissionalmente o Zyrp. Ela define o escopo do MVP, as fronteiras arquiteturais, o modelo SaaS multi-tenant, o PDV, a estratégia fiscal, os requisitos de qualidade e a estrutura documental.

## 2. Visão do produto

A plataforma será um SaaS brasileiro de gestão comercial, inicialmente especializado em casas de rações e preparado para expansão a agropecuárias, pet shops, lojas de embalagens, ferragens e outros segmentos compatíveis.

O produto adotará a estratégia **Core ERP + módulos por segmento**. O Core concentrará capacidades comerciais reutilizáveis, enquanto regras específicas de cada segmento serão adicionadas sem contaminar as capacidades centrais.

## 3. Escopo do MVP comercial

O MVP deverá ser utilizável comercialmente e incluir:

- gestão de usuários, funções e permissões por empresa e filial;
- catálogo, produtos, variações, códigos de barras e unidades fracionadas;
- estoque, movimentações, inventários e transferências;
- fornecedores, clientes e funcionários;
- compras, recebimentos e contas a pagar;
- vendas, orçamentos, descontos e pagamentos;
- PDV Electron online por padrão, com contingência offline restrita;
- abertura, movimentação, sangria, reforço e fechamento de caixa;
- contas a pagar, contas a receber e fluxo de caixa;
- NF-e e NFC-e por provedor fiscal externo;
- armazenamento de XML, protocolos, DANFE/DANFC-e e eventos fiscais;
- dashboards, relatórios, trilhas de auditoria e observabilidade;
- operação multiempresa e multifilial.

## 4. Arquitetura da aplicação

O backend será um **monólito modular Django**, implantado inicialmente como uma unidade, mas dividido por capacidades com contratos explícitos:

- Platform;
- Identity & Access;
- Organizations;
- Catalog;
- Inventory;
- Purchasing;
- Sales;
- PDV;
- Cash Management;
- Financial;
- Fiscal;
- Analytics;
- Integrations;
- Audit.

Cada módulo separará domínio, aplicação, infraestrutura, interfaces e testes. Views e serializers não conterão regras de negócio. Casos de uso controlarão transações. Módulos se comunicarão por serviços públicos e eventos internos, sem chamadas HTTP dentro do monólito.

Tecnologias iniciais:

- Python e Django;
- Django REST Framework;
- PostgreSQL;
- Redis e Celery;
- Transactional Outbox;
- React no frontend administrativo;
- Electron, React e SQLite no PDV;
- armazenamento S3 compatível;
- Docker;
- OpenAPI;
- Sentry e OpenTelemetry.

As APIs serão versionadas em `/api/v1/`. Operações críticas aceitarão chaves de idempotência. Valores monetários utilizarão `Decimal`. Datas serão persistidas em UTC e exibidas no fuso da empresa.

## 5. Multi-tenancy

A hierarquia organizacional será:

```text
Tenant
└── Empresa
    └── Filial
```

O PostgreSQL será compartilhado. Todas as entidades de negócio terão `tenant_id`; quando necessário, também terão `empresa_id` e `filial_id`.

O isolamento será aplicado por:

1. resolução do tenant na entrada da requisição;
2. contexto explícito de tenant nos casos de uso;
3. managers e QuerySets com escopo obrigatório;
4. PostgreSQL Row-Level Security como defesa adicional;
5. identificação do tenant em cache, arquivos, eventos e tarefas;
6. permissões por tenant, empresa, filial e função;
7. testes automatizados contra acesso cruzado e IDOR.

O usuário terá identidade global e associações a tenants. MFA será disponível e obrigatório para funções sensíveis. Segredos, tokens e certificados serão criptografados e nunca registrados em logs.

## 6. PDV e contingência offline

O PDV será Electron + React, com SQLite local. Ele funcionará online por padrão. A contingência offline será limitada à continuidade da venda e não transformará todo o ERP em uma aplicação offline.

O armazenamento local conterá somente catálogo necessário, preços vigentes, códigos de barras, configurações indispensáveis, sessão de caixa, vendas, pagamentos, fila persistente e metadados de sincronização.

Cada instalação será um dispositivo registrado e revogável, associado a tenant, empresa, filial e caixa. Operações usarão UUIDs imutáveis, sequência local e idempotência no backend.

Durante contingência poderão ser executados:

- consulta ao catálogo em cache;
- manutenção da sessão de caixa;
- registro de venda;
- registro de pagamento confirmado externamente;
- emissão de NFC-e em contingência quando legalmente permitida.

Ficarão indisponíveis offline alterações administrativas, compras, ajustes manuais de estoque, configurações fiscais, gestão de usuários e operações financeiras complexas.

Vendas concluídas serão fatos imutáveis. O backend será a autoridade do estoque consolidado. Conflitos e operações não conciliadas nunca serão descartados silenciosamente.

## 7. Fiscal

No MVP, cada empresa cliente contratará e pagará seu provedor fiscal, certificado e credenciais. A plataforma não subsidiará esse custo inicialmente. Essa política poderá ser revista após validação comercial e ganho de escala.

O ERP utilizará a abstração `FiscalProvider`, desacoplando vendas e caixa do fornecedor escolhido. O contrato deverá cobrir cadastro do emitente, validação, emissão, consulta, cancelamento, inutilização, carta de correção, download de XML e documento auxiliar e processamento de webhooks.

O fluxo fiscal será assíncrono quando apropriado e usará Outbox, idempotência, retentativas com backoff e máquina de estados. Rejeições fiscais não serão repetidas sem correção. XML autorizado será imutável. Toda transição será auditada.

A integração direta com a SEFAZ não faz parte do MVP. O primeiro provedor será escolhido posteriormente por ADR e matriz técnica/comercial.

## 8. Inteligência artificial futura

IA não fará parte do MVP e o funcionamento do ERP não dependerá de modelos externos. A arquitetura, contudo, deixará APIs, eventos, documentos estruturados, auditoria e permissões adequados para evolução futura.

Roadmap previsto:

1. RAG documental isolado por tenant;
2. copiloto operacional somente leitura;
3. recomendações de compras, estoque e anomalias;
4. ações controladas com aprovação humana;
5. agentes especializados.

Uma futura camada de IA acessará o ERP somente por APIs e ferramentas autorizadas. Não haverá acesso irrestrito às tabelas. Ações fiscais, financeiras, exclusões e ajustes de estoque exigirão aprovação humana.

## 9. Segurança, privacidade e auditoria

- defesa em profundidade para isolamento multi-tenant;
- criptografia em trânsito e em repouso para dados sensíveis;
- gerenciamento seguro de segredos;
- trilha histórica para estoque, caixa, financeiro e fiscal;
- proteção contra IDOR, repetição de webhooks e duplicidade de operações;
- backups criptografados com testes periódicos de restauração;
- políticas de retenção, exportação e exclusão alinhadas à LGPD e às obrigações legais;
- logs técnicos separados das trilhas de auditoria.

## 10. Qualidade e testes

A estratégia incluirá testes de domínio, casos de uso, integração PostgreSQL/RLS, API, contratos, E2E Web/PDV e testes de caos offline/fiscal.

Suítes obrigatórias cobrirão:

- isolamento de tenants, empresas e filiais;
- permissões e IDOR;
- dinheiro e arredondamentos;
- estoque, caixa, pagamentos, devoluções e estornos;
- idempotência, Outbox e tarefas Celery;
- contratos fiscais e webhooks;
- sincronização e recuperação do PDV;
- migrações PostgreSQL e SQLite;
- backup, restauração e segurança de segredos.

O Definition of Done exigirá implementação, testes, documentação, observabilidade, segurança e critérios de aceite comprovados.

## 11. Observabilidade e operação

Serão utilizados logs estruturados com correlation ID, métricas de API, filas, Outbox e sincronização, tracing, alertas fiscais/financeiros, monitoramento de PDVs e captura de exceções.

Os ambientes serão separados em local, testes, homologação, staging e produção. Homologação e produção fiscal terão credenciais e endpoints distintos.

## 12. Estrutura documental inicial

```text
C:\ERP\
└── docs/
    ├── README.md
    ├── DOCUMENT_INDEX.md
    ├── CHANGELOG.md
    ├── 00_Governance/
    ├── 01_Product/
    ├── 02_Architecture/
    │   └── ADR/
    ├── 03_Domain/
    ├── 04_Requirements/
    ├── 05_API/
    ├── 06_Diagrams/
    ├── 07_Testing/
    ├── 08_Security/
    ├── 09_Operations/
    ├── 10_Releases/
    ├── 99_Archive/
    └── superpowers/specs/
```

A fase atual utilizará somente `C:\ERP\docs`. Não haverá uma pasta intermediária `Enterprise_Commerce_Platform_Docs`. Os diretórios de código, infraestrutura e testes serão definidos e criados somente quando a fundação documental estiver aprovada e o plano de implementação do software for iniciado.

Os documentos atuais e o PRD original serão preservados em `docs/99_Archive` como histórico, sem serem tratados como baseline vigente.

## 13. Baseline documental planejada

- PG-001 — Product Governance;
- PC-001 — Project Charter;
- PV-001 — Product Vision;
- PS-001 — Product Strategy;
- PB-001 — Product Bible;
- EH-001 — Engineering Handbook;
- PRD-001 — Master PRD;
- SAD-001 — Software Architecture Document;
- DDD-001 — Domain Design;
- SRS-001 — Software Requirements Specification;
- SEC-001 — Security and Multi-Tenancy;
- TST-001 — Test Strategy;
- OPS-001 — Operations and Observability;
- ADRs das decisões arquiteturais aprovadas.

Todos começarão em `v0.1.0 Draft`, terão histórico, dependências, documentos relacionados e requisitos rastreáveis. `v1.0.0` será reservado a documentos aprovados e transformados em baseline.

## 14. Sequência de execução

1. preservar os rascunhos existentes e o PRD original em `docs/99_Archive`;
2. manter toda a fase documental exclusivamente em `C:\ERP\docs`;
3. criar estrutura, índice, changelog e governança;
4. produzir os documentos fundamentais;
5. revisar consistência cruzada e rastreabilidade;
6. criar plano técnico por milestones;
7. iniciar o código Django somente após a fundação documental;
8. validar cada milestone com testes e artefatos versionados.

## 15. Critérios de aceitação desta especificação

- todas as decisões aprovadas na conversa estão registradas;
- não há dependência de IA no MVP;
- multi-tenancy, PDV e fiscal têm estratégias explícitas;
- riscos de offline e fiscal possuem controles definidos;
- o escopo documental e a ordem de execução estão definidos;
- decisões ainda dependentes de mercado serão registradas em ADRs futuros, sem bloquear a fundação.

## 16. Histórico de alterações

| Versão | Data | Alteração |
|---|---|---|
| 0.1.0 | 2026-07-14 | Consolidação inicial do design aprovado na conversa. |
| 0.1.1 | 2026-07-14 | Remoção da pasta intermediária e concentração da fase documental em `C:\ERP\docs`. |
