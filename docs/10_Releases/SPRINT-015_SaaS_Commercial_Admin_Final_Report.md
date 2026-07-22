# Sprint 15 — SaaS Comercial e Administração da Plataforma — Relatório Final

## Status

Concluída em 2026-07-21 e liberada como pré-requisito da Sprint 16.

## Entregas

- App `platform_admin` para planos, assinaturas, entitlements, feature flags, auditoria e acesso temporário de suporte.
- Resolução de capacidades e limites por tenant, incluindo comportamento explícito para suspensão e cancelamento.
- API administrativa com autorização de plataforma e respostas Problem Details para permissão, validação e conflitos.
- Feature flags com overrides tenant-scoped, rollout SHA-256 determinístico, auditoria e evento Outbox.
- Acesso de suporte justificado, restrito ao tenant ativo para usuário comum, com expiração padrão de quatro horas, aprovação e revogação auditadas.
- Auditoria das mutações administrativas de planos, assinaturas, entitlements, flags e solicitações de suporte.
- Modelo operacional SaaS em `docs/00_Governance/SAAS_OPERATING_MODEL.md`.

## Cenários BDD automatizados

- Given um usuário comum, when acessa feature flags administrativas, then recebe `403 application/problem+json` sem vazamento de overrides.
- Given um usuário vinculado ao tenant A, when solicita suporte para o tenant B, then recebe erro de validação e nenhum pedido é persistido.
- Given uma solicitação sem expiração informada, when criada, then recebe prazo padrão de quatro horas.
- Given uma flag alterada pela API, when persistida, then auditoria e evento Outbox são gravados na mesma transação.
- Given o mesmo código de plano, when criado novamente, then a API retorna conflito `409 application/problem+json`.
- Given a mesma flag e tenant, when o rollout é avaliado em processos diferentes, then a decisão usa digest estável e não o `hash()` aleatório do Python.
- Given uma assinatura suspensa, when capacidades ou limites são consultados, then capacidades são negadas e limites retornam zero.

## Evidências TDD

### RED — regressões reproduzidas

```text
7 failed, 47 passed in 18.74s
```

Falhas reproduzidas: hash instável, permissão sem Problem Details, conflito retornando 400, ausência de auditoria/Outbox na API de flags, leitura de flags por usuário comum, suporte sem expiração e solicitação cross-tenant aceita.

### GREEN — suíte focada

```text
55 passed in 15.07s
```

Cobertura do app na execução final:

```text
platform_admin/models.py       95.3%
platform_admin/serializers.py  93.2%
platform_admin/services.py     88.4%
platform_admin/views.py        63.3%
```

## Regressão backend completa

```text
474 passed in 242.26s (0:04:02)
Required test coverage of 80% reached. Total coverage: 82.25%
```

## Qualidade estática e Django

```text
All checks passed!
Success: no issues found in 238 source files
System check identified no issues (0 silenced).
No changes detected
SECRET_SCAN=no tracked live Stripe/webhook secrets found
```

## Migrações

Aplicadas localmente com o perfil proprietário `config.settings.migration`:

```text
Applying platform_admin.0001_sprint15_saas_commercial_models... OK
Applying platform_admin.0002_alter_platformadminaudit_action... OK
```

O gate `manage.py migrate --check` concluiu com exit code 0.

## Aceite

Os critérios funcionais, de isolamento, auditoria, documentação e qualidade definidos para a Sprint 15 foram atendidos. A Sprint 16 pode iniciar sobre este baseline após o commit final.
