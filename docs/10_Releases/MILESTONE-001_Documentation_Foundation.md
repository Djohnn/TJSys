# MILESTONE-001 — Documentation Foundation

| Campo | Valor |
|---|---|
| Código | MILESTONE-001 |
| Versão | 0.1.0 |
| Status | Review |
| Data | 2026-07-14 |

## Objetivo

Consolidar uma base documental profissional e rastreável para iniciar a implementação do TJSys sem antecipar código de produto.

## Escopo entregue

- governança, visão, estratégia, vocabulário e PRD mestre;
- decisões arquiteturais, arquitetura de software e handbook de engenharia;
- desenho de domínio, eventos e contratos de integração;
- requisitos, rastreabilidade, padrões de API e OpenAPI inicial;
- diagramas de arquitetura e dos fluxos críticos de PDV e fiscal;
- segurança multi-tenant, threat model e classificação de dados;
- estratégia de testes, operações, incidentes e releases;
- arquivo histórico preservado como conteúdo não normativo.

## Decisões congeladas para o início do MVP

- Django modular monolith, DRF, PostgreSQL, Redis e Celery.
- PostgreSQL compartilhado com `tenant_id` obrigatório e RLS.
- hierarquia `Tenant → Empresa → Filial`.
- PDV Electron online por padrão com contingência offline restrita.
- emissão por provedor fiscal externo atrás de `FiscalProvider`.
- contratação fiscal pelo cliente no modelo inicial.
- IA fora do MVP, com APIs, eventos, auditoria e autorização preparados para evolução.

## Critérios de aceite

- [x] Documentos normativos centralizados em `docs`.
- [x] PRD mestre criado e ligado aos requisitos.
- [x] Decisões críticas registradas em ADRs.
- [x] Segurança, testes e operação definidos antes da implementação.
- [x] Diagramas dos fluxos de maior risco criados.
- [x] Índice e changelog atualizados.
- [x] Manifesto reproduzível com SHA-256 gerado.

## Próxima etapa recomendada

Criar o plano técnico do Sprint 0: estrutura do repositório de aplicação, ambiente local, CI, configurações por ambiente, autenticação, tenancy, RLS, auditoria e observabilidade mínima. Nenhum módulo comercial deve preceder a validação automatizada do isolamento entre tenants.

## Artefatos

- `MILESTONE-001_MANIFEST.txt`: inventário de arquivos, tamanhos e hashes.
- `Milestone_001_Documentation_Foundation_v0.1.0.zip`: pacote distribuível criado fora de `docs`.
