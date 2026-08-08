# Design — Correção e aceite real do Sprint 0

**Status:** Approved for review  
**Data:** 2026-07-14  
**Produto:** TJSys

## Objetivo

Corrigir a implementação inicial do Sprint 0 para que os checkboxes do PRD reflitam evidência real, especialmente nos controles bloqueadores de multi-tenancy, RLS, IDOR, integridade organizacional, auditoria, Outbox, migrations e CI.

## Diagnóstico confirmado

- O papel PostgreSQL `tjsys` é superuser e possui `BYPASSRLS`; portanto as policies não protegem a aplicação.
- O contexto tenant usa `SET` persistente na conexão, sem transação por requisição ou limpeza garantida.
- A seleção do tenant usa a primeira membership ativa, sem escolha explícita.
- Os testes de aplicação filtram manualmente por tenant e não demonstram proteção automática.
- Os testes chamados de IDOR não acessam recurso de outro tenant.
- `Branch` e `UserBranch` permitem combinações organizacionais incompatíveis.
- O contexto de logging é capturado antes de correlation ID, usuário e tenant estarem resolvidos.
- Auditoria não é append-only e não registra automaticamente alterações administrativas.
- Outbox não despacha efeito observável; o teste de idempotência apenas republica um no-op.
- Migrations de `audit` e `outbox` estão pendentes no banco local.
- Cobertura e testes de API foram marcados como concluídos sem execução correspondente.
- O repositório permanece sem o commit final declarado no checklist.

## Arquitetura de banco e RLS

O PostgreSQL local e de CI terá papéis separados:

- `tjsys_owner`: proprietário do schema e executor de migrations; não será usado pela aplicação em runtime.
- `tjsys_app`: login da aplicação, sem `SUPERUSER`, `BYPASSRLS` ou propriedade das tabelas.
- `tjsys_test`: papel não privilegiado usado nos testes de isolamento, ou execução equivalente por `SET ROLE` controlado.

O ambiente de desenvolvimento poderá executar migrations com credenciais owner e iniciar Django com credenciais app. As policies usarão `current_setting('app.current_tenant_id', true)` e negarão leitura e escrita quando o contexto estiver ausente ou incompatível.

## Contexto tenant

O tenant ativo será selecionado explicitamente por identificador de tenant na requisição e validado contra uma membership ativa do usuário. Não haverá escolha por `.first()`.

Cada requisição tenant-scoped será envolvida por transação atômica. O middleware aplicará `SET LOCAL app.current_tenant_id = ...`, válido somente durante a transação. Requisições públicas ou sem tenant não receberão contexto privilegiado. O contexto Python usará `contextvars` e será limpo em `finally`.

## Fronteira de aplicação

Entidades tenant-scoped não serão expostas por queries globais. Managers e serviços exigirão contexto explícito ou fornecerão métodos tenant-aware. Uma API mínima de empresa será criada apenas para provar autorização e IDOR no Sprint 0:

- listagem retorna empresas do tenant ativo;
- detalhe de outro tenant retorna 404;
- escrita com tenant incompatível é rejeitada;
- ausência de tenant ativo falha de forma segura.

## Integridade organizacional

- `Branch.tenant_id` deverá ser igual a `Branch.company.tenant_id`.
- `UserBranch` só aceitará usuário com membership ativa no tenant da filial.
- validações existirão no serviço/modelo e serão cobertas por testes;
- constraints de banco serão usadas quando representáveis sem dependência entre tabelas, complementadas por validação transacional quando necessário.

## Auditoria e Outbox

`AuditRecord` será imutável pela camada de aplicação e somente leitura no admin. Eventos administrativos relevantes terão serviço explícito de criação com sanitização de detalhes.

A Outbox continuará simples, mas possuirá um registry de handlers e um handler de teste com efeito persistido/idempotente. O processamento bloqueará a mensagem com `select_for_update`, registrará sucesso uma vez e permitirá comprovar que reprocessamento não duplica efeitos.

## Logging e correlation ID

Correlation ID será validado e limitado; valores inválidos gerarão UUID. O contexto de log será preenchido depois de autenticação e resolução do tenant, usando `contextvars`, e removido ao final da requisição. Testes verificarão resposta e registros capturados.

## Testes e CI

O aceite exigirá:

- migrations aplicadas e `migrate --check` limpo;
- testes RLS executados com papel sem bypass;
- testes de leitura e escrita cross-tenant;
- teste IDOR autenticado em endpoint tenant-scoped;
- negação sem contexto;
- testes de integridade empresa/filial/usuário;
- auditoria imutável e sanitizada;
- Outbox atômica e idempotente com efeito observável;
- health check real com PostgreSQL e Redis;
- Ruff, mypy, cobertura, análise de migrations e `check --deploy` no CI;
- detecção de segredos configurada como gate reproduzível.

## Tratamento do PRD

Os checkboxes sem evidência serão reabertos antes da correção. Cada item só voltará a `- [x]` após sua validação específica. O Sprint 0 permanecerá `Em correção` até todos os critérios obrigatórios passarem e o commit final existir.

## Fora do escopo

- funcionalidades comerciais das Sprints 1 a 8;
- frontend funcional ou design system;
- PDV offline;
- provedor fiscal;
- IA;
- deploy em produção.

## Critérios de aceite

- Papel de runtime não ignora RLS.
- Contexto tenant é explícito, transacional e não vaza entre requisições.
- Aplicação e banco bloqueiam leitura e escrita cross-tenant.
- Teste IDOR usa dois tenants e um recurso real.
- Integridade organizacional é validada.
- Migrations, health, lint, tipos, cobertura e testes passam.
- Auditoria e Outbox cumprem os comportamentos declarados.
- PRD e commits correspondem ao estado real.

