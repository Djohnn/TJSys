# Sprint 15 — SaaS Comercial e Administração da Plataforma Design

## Objetivo

Preparar o TJSys para operação comercial SaaS: planos, assinatura, ciclo de vida do tenant, suspensão controlada, portal administrativo, suporte e governança de release.

## Escopo

A Sprint 15 cria a camada de operação da plataforma, distinta do ERP do cliente. Ela permite administrar tenants, planos, limites, billing status, suporte e feature flags sem acesso indevido aos dados comerciais dos clientes.

## Arquitetura

Evoluir `tenancy`/`platform` com recursos de administração SaaS. A plataforma controla metadados do tenant, plano e estado da assinatura; os módulos comerciais consultam capacidades e limites sem conhecer detalhes de cobrança.

Fluxo:

1. admin cria ou aprova tenant;
2. tenant escolhe plano;
3. sistema aplica capacidades e limites;
4. cobrança/assinatura atualiza estado;
5. tenant inadimplente entra em modo restrito seguro;
6. suporte pode diagnosticar sem vazar dados sensíveis.

## Modelos previstos

- `Plan`
- `Subscription`
- `TenantEntitlement`
- `FeatureFlag`
- `PlatformAdminAudit`
- `SupportAccessRequest`

## Regras de negócio

- Suspensão não apaga dados.
- Tenant suspenso preserva consulta/exportação essencial, mas bloqueia novas operações críticas conforme política.
- Suporte precisa de acesso temporário, justificado e auditado.
- Feature flags são tenant-scoped e auditadas.
- Billing externo pode ser integrado depois por adapter.
- Dados de cobrança e suporte são separados dos dados operacionais do cliente.

## APIs previstas

- `GET/POST /api/v1/platform/plans/`
- `GET/POST /api/v1/platform/subscriptions/`
- `GET/PATCH /api/v1/platform/tenants/{id}/entitlements/`
- `GET/POST /api/v1/platform/feature-flags/`
- `POST /api/v1/platform/support-access-requests/`

## Fora do escopo

- Marketplace público.
- App mobile.
- Billing provider real obrigatório.
- Migração multi-região.
- Administração manual direta no banco.

## Critérios de aceite

- Plano define capacidades e limites consultáveis.
- Tenant suspenso tem comportamento previsível e testado.
- Suporte temporário é auditado.
- Feature flag altera disponibilidade sem deploy.
- Nenhum endpoint administrativo ignora isolamento e autorização.
