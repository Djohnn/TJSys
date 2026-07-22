# Modelo Operacional SaaS

## Objetivo

Este documento define como a plataforma Zyrp administra planos, assinaturas, capacidades, limites, suspensão de tenants, feature flags e acessos temporários de suporte. A camada comercial SaaS permanece separada dos dados operacionais de vendas, estoque, fiscal e financeiro.

## Limites arquiteturais

- O app Django é denominado `platform_admin` para não conflitar com o módulo `platform` da biblioteca padrão do Python.
- Módulos do ERP consultam capacidades somente por `tenant_has_capability()` e limites por `tenant_limit_for()`.
- Nenhum módulo operacional conhece detalhes de cobrança externa.
- Integrações futuras com provedores de billing devem atualizar `Subscription` por um adapter, preservando o contrato interno.
- Toda mutação administrativa gera `PlatformAdminAudit`; mudanças de feature flag também geram Outbox.

## Planos, assinaturas e entitlements

`Plan` contém capacidades booleanas e limites padrão. Cada tenant pode ter somente uma `Subscription` marcada como ativa. `TenantEntitlement` substitui uma capacidade ou limite do plano para um tenant específico.

Ordem de resolução:

1. localizar a assinatura ativa do tenant;
2. negar capacidade e retornar limite zero se a assinatura estiver suspensa;
3. aplicar override de `TenantEntitlement`, quando existir;
4. aplicar a configuração do `Plan`;
5. usar `False` ou `0` quando não houver configuração.

## Ciclo de vida do tenant

- `active` e `trial`: capacidades e limites são avaliados normalmente.
- `suspended`: dados são preservados, mas capacidades operacionais são negadas e limites efetivos são zero.
- `cancelled`: tenant é considerado restrito; exclusão de dados não é automática.
- Reativação exige uma assinatura suspensa existente e gera auditoria.

Suspender ou reativar nunca remove dados operacionais. Exportações essenciais e políticas de retenção devem ser tratadas por jornadas específicas, fora da mutação comercial.

## Feature flags

- O código da flag é único.
- Overrides por tenant têm precedência sobre rollout e padrão global.
- Rollout usa SHA-256 sobre `flag:tenant`, garantindo decisão estável entre processos e reinicializações.
- Percentuais aceitos ficam entre 0 e 100.
- Criação e alteração pela API passam por `set_feature_flag()`, que grava auditoria e evento `platform.feature_flag.updated` no Outbox.
- A coleção e seus overrides são visíveis apenas a administradores da plataforma.

## Acesso de suporte

- Usuário comum pode solicitar acesso somente para o tenant ativo no cabeçalho `X-Tenant-ID`.
- Toda solicitação exige justificativa e recebe expiração; o padrão é quatro horas.
- Aprovação e revogação exigem administrador da plataforma.
- Solicitação expirada não pode ser aprovada.
- Aprovação registra solicitante, aprovador, tenant, justificativa e expiração.
- O acesso não concede automaticamente leitura irrestrita aos dados do cliente; cada jornada de diagnóstico deve verificar o pedido aprovado e vigente.

## Autorização e erros

- Planos, assinaturas, entitlements, feature flags e auditoria exigem usuário `is_staff`.
- Solicitações de suporte de usuário comum são filtradas pelo próprio solicitante.
- O middleware valida associação ao tenant informado e oculta tenants não autorizados com `404`.
- Falhas dos endpoints da plataforma retornam `application/problem+json` com `type`, `title`, `status`, `detail` e `code`.
- Violações de unicidade são conflitos `409`; validações são `400`; ausência de permissão é `403`.

## Operação e auditoria

Administradores devem usar exclusivamente API ou Django Admin, nunca alterações diretas no banco. Cada auditoria registra ator, ação, tenant alvo quando aplicável, data e detalhes mínimos. Segredos e dados pessoais não devem ser colocados em `detail` nem em payloads Outbox.

## Checklist operacional

- Confirmar que o tenant correto está selecionado antes de alterar assinatura ou entitlement.
- Registrar justificativa em suspensões e acessos de suporte.
- Revisar solicitações de suporte abertas e revogar acessos desnecessários.
- Monitorar eventos Outbox de feature flags com falha.
- Validar em ambiente de teste qualquer mudança de rollout antes de produção.
- Manter testes cross-tenant, Ruff, mypy, Django check e migration check como gates obrigatórios.
