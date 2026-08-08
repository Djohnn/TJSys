# Documentation Changelog

Todas as mudanças relevantes na base documental são registradas aqui.

## 2026-07-14 — Sprint 2 and Sprint 3 Design

### Added

- Especificação do catálogo com unidades, conversões, códigos e preços por filial.
- Especificação do estoque com locais, lotes opcionais e movimentos imutáveis.
- Decisões de saldo não negativo, idempotência, concorrência e transferências atômicas.
- Planos executáveis com TDD, arquivos, comandos, gates e commits das Sprints 2 e 3.
- Checklists operacionais acompanháveis no PRD, com a Sprint 3 bloqueada pelo aceite da Sprint 2.

## 2026-07-14 — Sprint 1 Authentication and Onboarding

### Added

- Onboarding atômico do primeiro administrador, com confirmação de e-mail.
- Sessões Django protegidas por CSRF e elevação após MFA.
- MFA por TOTP, e-mail e códigos de recuperação.
- Recuperação de senha com revogação de sessões existentes.
- Capabilities, convites, memberships e escopo de filial por tenant.
- Contratos OpenAPI e relatório de evidências da Sprint 1.

### Security

- Tokens e códigos temporários persistidos somente como digest.
- Segredos TOTP cifrados por chave externa ao repositório.
- Rate limiting, respostas anti-enumeração, auditoria sanitizada e testes de IDOR/RLS.

## 2026-07-14 — Sprint 0 Foundation

### Added

- Fundação Django/DRF com PostgreSQL, Redis, Celery, auditoria e Transactional Outbox.
- Isolamento multi-tenant com contexto explícito, autorização, RLS forçado e testes de IDOR.
- Papéis separados para migrations, runtime e testes, sem bypass de RLS na aplicação.
- Pipeline de qualidade e segurança com Ruff, mypy, pytest, cobertura, `pip-audit` e detecção de segredos.
- Relatório final com evidências e riscos residuais da Sprint 0.

### Fixed

- Corrigidos o aceite prematuro, migrations pendentes, testes insuficientes de isolamento e exposição das portas locais.

## 2026-07-14 — Documentation Foundation v0.1.0

### Added

- Foundation Design consolidando decisões extraídas da conversa.
- Plano de implementação da baseline documental.
- Estrutura documental centralizada em `C:\ERP\docs`.
- Padrão de documentos, índice e porta de entrada.
- Primeiros drafts de governança e produto.
- Seis ADRs fundamentais, SAD, Engineering Handbook e desenho de domínio.
- PRD Master, SRS e matriz inicial de rastreabilidade.
- Padrões REST/OpenAPI, catálogo de erros, segurança multi-tenant e threat model.
- Estratégia e catálogo de testes, incluindo isolamento, IDOR, offline, fiscal e restauração.
- Operações, observabilidade, resposta a incidentes e estratégia de releases.
- Diagramas de contexto, contêineres, dependências, sincronização do PDV e estados fiscais.
- Marco documental MILESTONE-001, manifesto SHA-256 e pacote distribuível.
- PRD operacional com roadmap acompanhável e checklist granular do Sprint 0.
- Prompt universal para execução de uma sprint por qualquer agente de terminal.

### Decisions

- Monólito modular Django.
- PostgreSQL compartilhado com `tenant_id` e RLS.
- Hierarquia `Tenant → Empresa → Filial`.
- PDV Electron online por padrão, com contingência offline restrita.
- Provedor fiscal contratado e pago pelo cliente no MVP.
- IA fora do MVP, com preparação arquitetural para adoção futura.
- Nome oficial do produto definido como **TJSys**; o nome provisório anterior permanece apenas no arquivo histórico.

### Archived

- Pacote inicial de cinco rascunhos em `99_Archive/initial-package`.
- PRD original e fonte HTML em `99_Archive/source-prd`.
