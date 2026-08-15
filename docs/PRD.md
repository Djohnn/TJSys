# PRD Operacional — Roadmap de Sprints do TJSys

| Campo | Valor |
|---|---|
| Código | PRD-OPS-001 |
| Versão | 0.1.0 |
| Status | Review |
| Última atualização | 2026-07-14 |
| Produto | TJSys |

## Finalidade

Este documento é o painel operacional de implementação do TJSys. Ele permite acompanhar o andamento por sprint sem substituir as decisões normativas do PRD mestre, dos ADRs, da arquitetura, dos requisitos e da estratégia de segurança.

## Fontes obrigatórias

- [PRD mestre](01_Product/PRD-001_Master_v0.1.0.md)
- [Arquitetura de software](02_Architecture/SAD-001_Software_Architecture_v0.1.0.md)
- [Decisões arquiteturais](02_Architecture/ADR/)
- [Desenho de domínio](03_Domain/DDD-001_Domain_Design_v0.1.0.md)
- [Requisitos do sistema](04_Requirements/SRS-001_System_Requirements_v0.1.0.md)
- [Padrões de API](05_API/API-001_API_Standards_v0.1.0.md)
- [Estratégia de testes](07_Testing/TST-001_Test_Strategy_v0.1.0.md)
- [Segurança e multi-tenancy](08_Security/SEC-001_Security_Multitenancy_v0.1.0.md)
- [Operações e observabilidade](09_Operations/OPS-001_Operations_Observability_v0.1.0.md)

Em caso de conflito, o agente deve parar, informar a divergência e solicitar uma decisão. Mudança arquitetural exige ADR novo ou atualização formal de ADR existente.

## Como acompanhar

- `- [ ]`: tarefa pendente ou ainda não validada.
- `- [x]`: tarefa implementada e comprovada pela validação indicada.
- `BLOQUEADO:`: impedimento registrado abaixo da tarefa; a caixa permanece aberta.
- Uma tarefa parcialmente concluída continua aberta.
- O agente atualiza a caixa somente depois de executar a validação correspondente.
- Evidências devem ser registradas no relatório final da sprint e no histórico Git.

## Estado atual

| Sprint | Estado | Objetivo resumido |
|---:|---|---|
| 0 | Concluída | Fundação técnica e isolamento multi-tenant |
| 1 | Concluída | Autenticação, onboarding e autorização |
| 2 | Concluída | Catálogo e cadastros-base |
| 3 | Concluída | Estoque e movimentações |
| 4 | Concluída | Vendas, pedidos e caixa web |
| 5 | Concluída | PDV Electron online |
| 6 | Concluída | Contingência offline e sincronização |
| 7 | A detalhar | Integração fiscal por provider |
| 8 | A detalhar | Piloto, observabilidade e hardening |
| 9 | A detalhar | Devoluções, cancelamentos e estornos |
| 10 | A detalhar | Compras, recebimento e contas a pagar |
| 11 | A detalhar | Financeiro, fluxo de caixa e relatórios |
| 12 | A detalhar | Pessoas, clientes e parceiros |
| 13 | Concluída | Pagamentos integrados e conciliação |
| 14 | A detalhar | IA readiness e copiloto somente leitura |
| 15 | Concluída | SaaS comercial e administração da plataforma |
| 16 | Concluída | Fundação frontend, contrato API, login MFA |
| 17 | Concluída | Shell admin, tenancy, acesso |
| 18 | Concluída | Catálogo, estoque, compras web |
| 19 | Concluída | Gestão PDV, pessoas, financeiro web |
| 20 | Concluída | Fiscal, pagamentos, observabilidade, E2E aceite |
| 21 | Concluída | Estilização Tailwind CSS de todo o frontend |
| 22 | Concluída | Refatoração do catálogo (fiscal-data, price-tiers, novos campos) |
| 23 | Concluída | Kit composition with inventory decomposition |

---

### Sprint 0 — Fundação Técnica do TJSys

**Duração de referência:** 1 a 2 semanas  
**Estado:** Concluída

**Correção de aceite:** os problemas de bypass de RLS, ausência de IDOR real, migrations pendentes e checkboxes sem evidência foram corrigidos e revalidados em 2026-07-14. As evidências estão no relatório final da sprint e no histórico Git.

**Objetivo:** disponibilizar uma base Django reproduzível, observável e testada, com autenticação preparada, hierarquia organizacional e isolamento multi-tenant comprovado antes da implementação dos módulos comerciais.

**Entregável:** o ambiente local inicia PostgreSQL, Redis e Django; `/health/` responde com sucesso; migrations executam do zero; e testes automatizados demonstram que um tenant não lê nem altera dados de outro.

**Decisões aplicáveis:** ADR-001, ADR-002, ADR-005 e ADR-006.

#### 0.1 Repositório e ambiente

- [x] Criar os diretórios raiz `backend/`, `frontend/`, `pdv/` e `infra/`, cada um com README de responsabilidade.
- [x] Definir Python 3.12 ou superior para o backend e registrar a versão suportada.
- [x] Criar ambiente virtual local em `.venv/` sem versioná-lo.
- [x] Criar `backend/pyproject.toml` ou arquivos equivalentes com Django, DRF, PostgreSQL, Redis, Celery, configuração e testes.
- [x] Separar dependências de produção e desenvolvimento de forma reproduzível.
- [x] Criar `.env.example` sem segredos, documentando todas as variáveis obrigatórias.
- [x] Confirmar que `.env`, certificados, bancos SQLite, logs, volumes e builds são ignorados pelo Git.
- [x] Documentar em `README.md` os comandos para preparar, iniciar, testar e parar o ambiente local.
- [x] Validar instalação limpa das dependências em ambiente virtual novo.

**Validação 0.1:** executar a instalação documentada e confirmar `python --version`, importação do Django e `git status --short` sem artefatos locais.

#### 0.2 Infraestrutura local

- [x] Criar `compose.yaml` para PostgreSQL e Redis usando versões fixadas.
- [x] Configurar usuário, senha, database e portas somente por variáveis de ambiente.
- [x] Adicionar health check real para PostgreSQL.
- [x] Adicionar health check real para Redis.
- [x] Definir volumes locais persistentes abrangidos pelo `.gitignore`.
- [x] Configurar rede local sem expor serviços desnecessários.
- [x] Criar comandos documentados para subir, inspecionar e parar a infraestrutura.
- [x] Confirmar conexão do host com PostgreSQL e Redis.

**Validação 0.2:** `docker compose config` deve ser válido e `docker compose up -d` deve deixar PostgreSQL e Redis saudáveis.

#### 0.3 Backend Django e DRF

- [x] Criar o projeto Django em `backend/` com pacote principal `config`.
- [x] Separar settings em `base`, `local`, `test` e `production`.
- [x] Ler configurações exclusivamente de variáveis de ambiente, com defaults apenas quando seguros localmente.
- [x] Configurar PostgreSQL como banco principal; não usar SQLite como banco padrão do backend.
- [x] Configurar Redis para cache e broker do Celery.
- [x] Registrar Django REST Framework.
- [x] Criar apps `core`, `accounts`, `tenancy`, `audit` e `outbox`.
- [x] Configurar `LANGUAGE_CODE = "pt-br"` e `TIME_ZONE = "America/Sao_Paulo"`.
- [x] Criar endpoint público `/health/` com status da aplicação e checagens sanitizadas de dependências.
- [x] Criar middleware para `X-Correlation-ID`, reutilizando valor válido recebido ou gerando UUID.
- [x] Retornar `X-Correlation-ID` em todas as respostas HTTP.
- [x] Executar `python manage.py check` sem erros.

**Validação 0.3:** iniciar o servidor, consultar `/health/`, conferir HTTP 200 e o cabeçalho `X-Correlation-ID`.

#### 0.4 Identidade e estrutura multi-tenant

- [x] Criar usuário customizado antes da primeira migration funcional.
- [x] Usar e-mail normalizado como identificador de autenticação ou documentar formalmente alternativa aprovada.
- [x] Criar modelos `Tenant`, `Company` e `Branch` conforme a hierarquia `Tenant → Empresa → Filial`.
- [x] Criar modelo de membership entre usuário e tenant com papel e estado.
- [x] Criar vínculo explícito do usuário com empresas e filiais autorizadas quando aplicável.
- [x] Implementar modelo abstrato com UUID, `tenant_id`, `created_at` e `updated_at` para entidades tenant-scoped.
- [x] Impedir `tenant_id` nulo em entidades pertencentes a tenant.
- [x] Implementar resolução explícita do tenant ativo por requisição autenticada.
- [x] Rejeitar requisição tenant-scoped sem contexto válido.
- [x] Registrar migrations iniciais sem depender de dados manuais.
- [x] Criar comando ou fixture segura para dados locais de demonstração com dois tenants.

**Validação 0.4:** recriar o banco vazio, executar migrations e criar dois tenants com empresas, filiais e usuários distintos.

#### 0.5 Isolamento, autorização e PostgreSQL RLS

- [x] Definir política que filtre todas as entidades tenant-scoped pelo tenant ativo.
- [x] Aplicar contexto do tenant na conexão PostgreSQL dentro de transação controlada.
- [x] Criar policies RLS para pelo menos uma entidade tenant-scoped representativa.
- [x] Habilitar e forçar RLS nas tabelas protegidas previstas no Sprint 0.
- [x] Garantir negação segura quando a variável de contexto do tenant estiver ausente.
- [x] Evitar queries globais em managers e serviços expostos a requisições.
- [x] Implementar autorização de empresa e filial além do filtro de tenant.
- [x] Padronizar resposta que não revele a existência de recurso pertencente a outro tenant.
- [x] Criar teste de leitura cross-tenant bloqueada pela aplicação.
- [x] Criar teste de leitura cross-tenant bloqueada pelo RLS.
- [x] Criar teste de escrita cross-tenant bloqueada.
- [x] Criar teste de IDOR para recurso de outro tenant.
- [x] Criar teste que falha de forma segura sem contexto de tenant.

**Validação 0.5:** executar a suíte multi-tenant com PostgreSQL real e obter zero acessos indevidos entre os dois tenants de teste.

#### 0.6 Auditoria, Outbox e observabilidade mínima

- [x] Configurar logs JSON estruturados sem segredos ou dados fiscais sensíveis.
- [x] Incluir correlation ID, tenant ID, usuário e operação quando disponíveis.
- [x] Criar modelo append-only de auditoria com ator, ação, recurso, instante e contexto.
- [x] Registrar alterações administrativas relevantes sem armazenar senhas, tokens ou certificados.
- [x] Criar modelo de Transactional Outbox com UUID, tipo, versão, aggregate, payload, instante e estado.
- [x] Persistir evento de teste na Outbox na mesma transação da alteração de domínio.
- [x] Criar processamento idempotente inicial para eventos da Outbox.
- [x] Criar métrica ou log detectável para Outbox atrasada ou com falha.
- [x] Testar rollback conjunto entre alteração de domínio e evento da Outbox.
- [x] Testar que reprocessamento não duplica o efeito do evento.

**Validação 0.6:** testes provam atomicidade da Outbox, idempotência e presença do correlation ID nos logs e respostas.

#### 0.7 Qualidade, segurança e integração contínua

- [x] Configurar formatter e linter Python com regras versionadas.
- [x] Configurar verificação de tipos para o escopo adotado no Sprint 0.
- [x] Configurar runner de testes com settings próprios e PostgreSQL.
- [x] Configurar cobertura, sem usar porcentagem isolada como critério de qualidade.
- [x] Criar testes unitários para regras puras de tenancy.
- [x] Criar testes de integração para ORM, transações e RLS.
- [x] Criar testes de API para autenticação, contexto, IDOR e correlation ID.
- [x] Adicionar análise de dependências vulneráveis e segredos no pipeline.
- [x] Criar pipeline de CI para instalar dependências, validar migrations, lintar e testar.
- [x] Fazer o pipeline falhar quando migrations de models estiverem ausentes.
- [x] Executar `python manage.py check --deploy` com settings de produção simulados.
- [x] Documentar limitações conhecidas e riscos aceitos do Sprint 0.

**Limitações conhecidas e riscos aceitos:**
- O owner de migrations permanece separado do usuário de runtime. O runtime usa `tjsys_app`, sem `SUPERUSER` e sem `BYPASSRLS`; testes usam papel próprio, também sem bypass.
- Credenciais de desenvolvimento presentes em exemplos e CI são placeholders não reutilizáveis. Produção exige valores externos e uma `SECRET_KEY` forte.
- O backend está validado no Python 3.14 local e no Python 3.13 da CI; o requisito mínimo declarado continua sendo Python 3.12.
- A verificação local do `pip-audit` pode depender do trust store corporativo do Windows. O gate estrito permanece obrigatório na CI Linux e não desabilita TLS.
- `var-annotated` em campos de models Django é suprimido somente nos módulos de models definidos no `pyproject.toml`.

**Validação 0.7:** pipeline completo passa em checkout limpo e nenhuma credencial aparece no repositório.

#### 0.8 Aceite e encerramento

- [x] Executar `python manage.py check` e registrar saída sem erros.
- [x] Executar verificação de migrations pendentes e obter resultado limpo.
- [x] Executar toda a suíte de testes e obter zero falhas.
- [x] Recriar o ambiente local seguindo somente o README.
- [x] Validar `/health/` com PostgreSQL e Redis disponíveis.
- [x] Validar isolamento entre dois tenants por aplicação e RLS.
- [x] Revisar `git diff` para impedir segredos, certificados, dumps ou artefatos locais.
- [x] Atualizar este checklist somente com tarefas efetivamente comprovadas.
- [x] Registrar evidências, pendências e riscos no relatório final da sprint.
- [x] Criar commit final `feat: sprint 0 - fundação técnica`.
- [x] Parar e solicitar aprovação antes de detalhar ou iniciar o Sprint 1.

**Critérios de aceite da Sprint 0:**

- ambiente reproduzível a partir de checkout limpo;
- Django, PostgreSQL e Redis operacionais;
- usuário customizado e hierarquia organizacional migrados;
- contexto tenant obrigatório e RLS ativo nas tabelas protegidas;
- testes de isolamento, IDOR, Outbox e health check passando;
- CI executando as verificações obrigatórias;
- documentação local suficiente para outro desenvolvedor iniciar o projeto.

---

### Sprint 1 — Autenticação, Onboarding e Autorização

**Duração de referência:** 2 semanas
**Estado:** Concluída

**Objetivo:** permitir criação controlada do tenant, entrada de usuários, recuperação de acesso, MFA, memberships e permissões por capability.

**Entregável:** primeiro administrador cria e confirma sua organização, configura MFA por TOTP ou e-mail, autentica-se com sessão segura e convida usuários com papel e escopo de filial.

**Especificação:** [Design da Sprint 1](superpowers/specs/2026-07-14-sprint-1-auth-onboarding-design.md)

#### 1.1 Configuração e fundação de segurança

- [x] Adicionar dependências versionadas para TOTP, criptografia e rate limiting.
- [x] Configurar backend de e-mail local/teste e SMTP por ambiente em produção.
- [x] Exigir chave externa para cifrar segredos MFA em produção.
- [x] Definir expirações, limites de tentativa e cooldowns por settings.
- [x] Documentar novas variáveis em `.env.example` sem valores reais.
- [x] Manter cookies seguros, CSRF e rotação de sessão.

**Validação 1.1:** instalação limpa, Django check e deploy check aprovados sem segredos no repositório.

#### 1.2 Tokens e artefatos temporários

- [x] Criar modelo genérico de token de uso único com finalidade, digest e expiração.
- [x] Persistir somente digest de confirmação, recuperação, convite e códigos MFA.
- [x] Implementar consumo atômico e uso único.
- [x] Implementar expiração e limite de tentativas.
- [x] Criar modelo de dispositivo MFA com segredo TOTP cifrado.
- [x] Criar códigos de recuperação armazenados somente como hash.
- [x] Impedir tokens, códigos e segredos em logs, auditoria e Outbox.

**Validação 1.2:** testes provam expiração, adulteração, replay bloqueado, consumo único e ausência de plaintext persistido.

#### 1.3 Cadastro público e confirmação

- [x] Criar endpoint público de cadastro do primeiro administrador.
- [x] Normalizar e validar e-mail sem permitir enumeração indevida.
- [x] Criar usuário, tenant, empresa, filial e membership admin na mesma transação.
- [x] Gerar slug seguro e resolver colisões.
- [x] Impedir escolha de IDs, tenant ou papel privilegiado pelo payload.
- [x] Enviar confirmação de e-mail somente após commit.
- [x] Criar endpoint de confirmação com token expirável e de uso único.
- [x] Bloquear acesso operacional antes da confirmação.
- [x] Auditar cadastro e confirmação sem armazenar token.
- [x] Testar rollback integral do onboarding.

**Validação 1.3:** cadastro cria hierarquia completa ou não persiste nada; confirmação válida ativa o fluxo e replay falha.

#### 1.4 Sessão, login e logout

- [x] Criar login por e-mail e senha usando sessão Django.
- [x] Usar resposta uniforme para conta inexistente e senha incorreta.
- [x] Rejeitar conta inativa ou e-mail não confirmado.
- [x] Criar estado intermediário de sessão antes do MFA.
- [x] Rotacionar sessão após autenticação completa.
- [x] Criar logout com invalidação server-side.
- [x] Criar endpoint `/auth/me/` sanitizado.
- [x] Aplicar rate limiting a login e endpoints públicos sensíveis.
- [x] Auditar sucessos e bloqueios relevantes sem registrar credenciais.

**Validação 1.4:** testes provam não enumeração, rotação/invalidação de sessão, CSRF e limitação de abuso.

#### 1.5 Política MFA e TOTP

- [x] Criar política por tenant com TOTP e e-mail permitidos.
- [x] Garantir que ao menos um método permaneça permitido.
- [x] Permitir alteração somente com capability administrativa.
- [x] Impedir remoção do único método verificado de administrador.
- [x] Gerar enrollment TOTP e URI `otpauth` exibidos uma vez.
- [x] Cifrar segredo TOTP em repouso.
- [x] Exigir código válido para ativar TOTP.
- [x] Limitar janela temporal e bloquear replay do mesmo timestep.
- [x] Exigir MFA de administradores antes de operações tenant-scoped.
- [x] Testar IDOR da política MFA.

**Validação 1.5:** TOTP funciona com janela limitada, não permite replay e a política de outro tenant retorna 404.

#### 1.6 MFA por e-mail e recuperação

- [x] Criar desafio MFA por e-mail com código aleatório.
- [x] Expirar desafio em dez minutos.
- [x] Limitar a cinco tentativas e aplicar cooldown de reenvio.
- [x] Consumir o código uma única vez.
- [x] Elevar e rotacionar a sessão após desafio válido.
- [x] Gerar códigos de recuperação exibidos uma única vez.
- [x] Consumir código de recuperação uma única vez.
- [x] Regenerar códigos invalidando o conjunto anterior.
- [x] Auditar operações sem armazenar códigos.

**Validação 1.6:** testes cobrem código válido, expirado, tentativa excedida, cooldown, replay e recuperação.

#### 1.7 Recuperação de senha

- [x] Criar solicitação com resposta indistinguível para e-mail existente/inexistente.
- [x] Enviar token somente após commit.
- [x] Validar política de senha do Django na redefinição.
- [x] Expirar e consumir token uma única vez.
- [x] Revogar sessões existentes após redefinição.
- [x] Manter MFA obrigatório no próximo login.
- [x] Auditar conclusão sem armazenar token ou senha.

**Validação 1.7:** testes provam não enumeração, expiração, adulteração, uso único e revogação de sessões.

#### 1.8 Capabilities, convites e memberships

- [x] Definir matriz inicial de capabilities para admin, manager e operator.
- [x] Centralizar autorização por usuário, tenant, capability e filial.
- [x] Proibir comparações dispersas de strings de papel nas views.
- [x] Criar convite com e-mail normalizado, papel, filiais, digest e expiração.
- [x] Validar que filiais do convite pertencem ao tenant ativo.
- [x] Aceitar convite somente com e-mail autenticado correspondente.
- [x] Tornar convite de uso único e revogar token anterior no reenvio.
- [x] Criar listagem e alteração segura de memberships.
- [x] Impedir escalada de papel e remoção do último administrador.
- [x] Retornar 404 para convite ou membership de outro tenant.
- [x] Auditar convite, reenvio, aceite, papel e escopo.

**Validação 1.8:** matriz, convites e memberships passam testes de capability, filial, IDOR, replay e invariantes administrativas.

#### 1.9 Contratos, qualidade e aceite

- [x] Documentar endpoints e erros no OpenAPI.
- [x] Atualizar READMEs com fluxos e configuração segura.
- [x] Ampliar sanitização de auditoria para todos os artefatos de autenticação.
- [x] Executar migrations com owner separado do runtime.
- [x] Executar Ruff e mypy sem falhas.
- [x] Executar suíte completa com PostgreSQL real e cobertura mínima mantida.
- [x] Executar testes de isolamento, RLS e IDOR sem regressão.
- [x] Executar check de produção simulado.
- [x] Executar auditoria de dependências e hook de segredos na CI.
- [x] Registrar evidências e riscos no relatório final da sprint.
- [x] Atualizar checklist somente após validação correspondente.
- [x] Criar commit final `feat: sprint 1 - autenticação e onboarding`.
- [x] Enviar para `master` e obter CI remota verde.
- [x] Confirmar worktree limpo e sincronizado com `origin/master`.

**Critérios de aceite da Sprint 1:**

- onboarding público é atômico e não permite autoelevação;
- e-mail confirmado e MFA são obrigatórios para administrador;
- TOTP e e-mail respeitam a política do tenant;
- recuperação e convites resistem a enumeração, replay e IDOR;
- capabilities respeitam tenant, papel e filial;
- nenhum segredo aparece no banco em plaintext evitável, logs, auditoria, Outbox ou Git;
- regressões da Sprint 0 permanecem aprovadas;
- CI remota termina com sucesso.

### Sprint 2 — Catálogo e Cadastros-base

**Estado:** Concluída

**Objetivo:** implementar produtos, categorias, unidades, códigos e preços essenciais.

**Entregável:** catálogo isolado por tenant, preparado para casas de rações e expansão futura.

**Especificação:** [Design da Sprint 2](superpowers/specs/2026-07-14-sprint-2-catalog-design.md)

**Plano:** [Plano de implementação da Sprint 2](superpowers/plans/2026-07-14-sprint-2-catalog-implementation-plan.md)

#### 2.1 Fundação do catálogo

- [x] Criar app `catalog` e registrar em `INSTALLED_APPS`.
- [x] Definir capabilities `catalog.view`, `catalog.manage`, `pricing.view` e `pricing.manage`.
- [x] Integrar capabilities aos papéis admin, manager e operator.
- [x] Manter operações administrativas protegidas por MFA.

#### 2.2 Categorias, unidades e produtos

- [x] Criar categoria hierárquica com prevenção de ciclos.
- [x] Criar unidade com símbolo e precisão decimal limitada.
- [x] Criar produto/SKU independente com unidade base.
- [x] Normalizar e garantir SKU único por tenant.
- [x] Validar categoria e unidade pertencentes ao mesmo tenant.
- [x] Adicionar flags de lote e validade para integração com estoque.
- [x] Implementar inativação sem exclusão física.

#### 2.3 Conversões e códigos

- [x] Criar unidades comerciais por produto com fator positivo.
- [x] Calcular conversões somente com `Decimal`.
- [x] Preservar versões de fatores utilizados por fatos posteriores.
- [x] Criar códigos internos, EAN, GTIN e de fornecedor.
- [x] Validar tamanho e dígito verificador de EAN/GTIN.
- [x] Garantir código ativo único por tenant.
- [x] Permitir somente um código principal por produto e tipo.

#### 2.4 Precificação

- [x] Criar preços padrão versionados por vigência.
- [x] Criar sobrescrita opcional de preço por filial.
- [x] Impedir períodos sobrepostos no mesmo escopo.
- [x] Resolver preço por filial, fallback do tenant e instante.
- [x] Usar `Decimal` e impedir valor negativo.
- [x] Preservar histórico de preços sem sobrescrita destrutiva.

#### 2.5 Segurança multi-tenant

- [x] Aplicar manager tenant-scoped em entidades do catálogo.
- [x] Habilitar e forçar RLS nas tabelas tenant-scoped.
- [x] Negar leitura e escrita sem contexto de tenant.
- [x] Validar que preço por filial pertence ao tenant ativo.
- [x] Criar testes cross-tenant por aplicação e RLS.
- [x] Criar testes de IDOR para produto, código e preço.

#### 2.6 APIs, auditoria e eventos

- [x] Criar CRUD seguro de categorias, unidades e produtos.
- [x] Criar endpoints de conversões, códigos e preços.
- [x] Criar consulta de preço vigente por filial e instante.
- [x] Implementar paginação, busca, filtros e ordenação segura.
- [x] Padronizar erros RFC 9457 com códigos estáveis.
- [x] Auditar criação, alteração, preço e inativação.
- [x] Persistir eventos de catálogo na Outbox na mesma transação.
- [x] Documentar endpoints no OpenAPI e eventos no catálogo de domínio.

#### 2.7 Qualidade e aceite

- [x] Executar migrations com owner separado do runtime.
- [x] Executar Ruff e mypy sem falhas.
- [x] Executar suíte completa com cobertura mínima mantida.
- [x] Executar testes de concorrência de SKU, códigos e preços.
- [x] Executar regressão das Sprints 0 e 1.
- [x] Executar deploy check, auditoria de dependências e segredos.
- [x] Registrar evidências e riscos no relatório final da Sprint 2.
- [x] Criar commit final `feat: sprint 2 - catalogo e cadastros-base`.
- [x] Integrar em `master` e obter CI remota verde.
- [x] Confirmar worktree limpo e sincronizado com `origin/master`.

### Sprint 3 — Estoque e Movimentações

**Estado:** Concluída

**Objetivo:** controlar saldo por filial por meio de movimentos imutáveis e operações idempotentes.

**Entregável:** entradas, saídas, ajustes, transferências e rastreabilidade de estoque.

**Especificação:** [Design da Sprint 3](superpowers/specs/2026-07-14-sprint-3-inventory-design.md)

**Plano:** [Plano de implementação da Sprint 3](superpowers/plans/2026-07-14-sprint-3-inventory-implementation-plan.md)

#### 3.1 Fundação e locais

- [x] Confirmar aceite e contratos públicos da Sprint 2.
- [x] Criar app `inventory` e capabilities de estoque.
- [x] Criar múltiplos locais por filial.
- [x] Criar exatamente um local principal por filial.
- [x] Impedir exclusão de local com histórico.

#### 3.2 Lotes e validade

- [x] Criar lotes opcionais por produto.
- [x] Exigir lote quando configurado no produto.
- [x] Exigir validade quando configurada no produto.
- [x] Impedir movimentação comum de lote vencido.
- [x] Permitir baixa autorizada e auditada de lote vencido.

#### 3.3 Ledger e projeção

- [x] Criar operação agregadora de estoque.
- [x] Criar movimentos imutáveis de entrada e saída.
- [x] Preservar unidade, fator e quantidade informados.
- [x] Criar saldo projetado por produto, filial, local e lote.
- [x] Impedir saldo negativo por serviço e constraint.
- [x] Impedir edição ou exclusão de movimento confirmado.

#### 3.4 Concorrência e idempotência

- [x] Exigir `Idempotency-Key` nas operações de escrita.
- [x] Retornar resultado original para replay idêntico.
- [x] Rejeitar mesma chave com payload diferente.
- [x] Bloquear linhas de saldo em ordem determinística.
- [x] Testar saídas concorrentes sem overselling.
- [x] Testar saldo final determinístico sob concorrência.

#### 3.5 Operações

- [x] Implementar saldo inicial.
- [x] Implementar entrada e saída manuais.
- [x] Implementar ajuste com motivo, capability e MFA.
- [x] Implementar transferência atômica entre locais.
- [x] Implementar transferência entre filiais autorizadas.
- [x] Implementar reversão compensatória única.
- [x] Testar rollback integral de transferência.

#### 3.6 Segurança e APIs

- [x] Aplicar e forçar RLS em todas as tabelas tenant-scoped.
- [x] Validar acesso a todas as filiais da operação.
- [x] Retornar 404 para recursos fora do tenant ou escopo autorizado.
- [x] Criar APIs de locais, lotes, saldos e operações.
- [x] Manter movimentos e saldos somente leitura pela API.
- [x] Padronizar erros de estoque em RFC 9457.
- [x] Criar testes de RLS, IDOR e ausência de contexto.

#### 3.7 Reconciliação, auditoria e eventos

- [x] Comparar projeção de saldo com soma dos movimentos.
- [x] Alertar divergência sem correção silenciosa.
- [x] Auditar operação, rejeição, ajuste, transferência e reversão.
- [x] Persistir eventos de estoque na Outbox atomicamente.
- [x] Documentar endpoints, idempotência e eventos.

#### 3.8 Qualidade e aceite

- [x] Executar migrations, Ruff e mypy sem falhas.
- [x] Executar suíte completa com cobertura mínima mantida.
- [x] Repetir testes concorrentes e transacionais para detectar flakiness.
- [x] Executar regressão das Sprints 0, 1 e 2.
- [x] Executar deploy check, auditoria de dependências e segredos.
- [x] Registrar evidências e riscos no relatório final da Sprint 3.
- [x] Criar commit final `feat: sprint 3 - estoque e movimentacoes`.
- [x] Integrar em `master` e obter CI remota verde.
- [x] Confirmar worktree limpo e sincronizado com `origin/master`.

### Sprint 4 — Vendas, Pedidos e Caixa Web

**Estado:** Concluída  
**Objetivo:** realizar o ciclo comercial online com pedido, venda, pagamentos registrados e movimentação de caixa.  
**Entregável:** venda web consistente com estoque, financeiro, auditoria e Outbox.

**Especificação:** [Design da Sprint 4](superpowers/specs/2026-07-17-sprint-4-sales-cash-web-design.md)

**Plano:** [Plano de implementação da Sprint 4](superpowers/plans/2026-07-17-sprint-4-sales-cash-web-implementation-plan.md)

#### 4.1 Fundação de vendas e caixa

- [x] Criar app `sales`.
- [x] Registrar app em `LOCAL_APPS`.
- [x] Criar modelos `CashSession`, `CashMovement`, `Sale`, `SaleItem` e `SalePayment`.
- [x] Criar migrations da Sprint 4.

#### 4.2 Serviços transacionais

- [x] Implementar abertura de caixa idempotente.
- [x] Implementar fechamento de caixa idempotente.
- [x] Implementar venda balcão com pagamento obrigatório.
- [x] Baixar estoque imediatamente na mesma transação da venda.
- [x] Criar movimento de caixa por pagamento registrado.
- [x] Emitir auditoria e Outbox para venda confirmada.

#### 4.3 API

- [x] Expor abertura, caixa atual e fechamento de caixa.
- [x] Expor criação de venda balcão confirmada.
- [x] Expor consulta/listagem de vendas.
- [x] Retornar problemas padronizados para sem caixa, sem estoque, pagamento divergente e conflito de idempotência.

#### 4.4 Segurança e consistência

- [x] Exigir autenticação, tenant ativo e MFA em escritas.
- [x] Garantir isolamento multi-tenant nas consultas e escritas.
- [x] Bloquear alteração/exclusão de vendas confirmadas.
- [x] Garantir retry idempotente e conflito quando payload divergir.

#### 4.5 Qualidade e aceite

- [x] Criar testes de serviços para caixa e venda.
- [x] Criar testes de API para caixa e venda.
- [x] Executar migrations, Ruff e mypy sem falhas.
- [x] Executar suíte focada de vendas/estoque.
- [x] Executar suíte completa com cobertura mínima mantida.
- [x] Registrar evidências e riscos no relatório final da Sprint 4.
- [x] Criar commit final `feat: sprint 4 - vendas caixa web`.

### Sprint 5 — PDV Electron Online

**Estado:** Concluída  
**Objetivo:** disponibilizar caixa desktop online integrado às APIs do TJSys.  
**Entregável:** operador abre caixa, vende, recebe e encerra turno no aplicativo Electron.

**Especificação:** [Design da Sprint 5](superpowers/specs/2026-07-17-sprint-5-pdv-electron-online-design.md)

#### 5.1 Fundação Electron + Vite

- [x] Scaffold Electron + React + TypeScript com `electron-vite`.
- [x] Configurar `electron.vite.config.ts` com aliases, external modules e proxy `/api` → `localhost:8000`.
- [x] Criar preload com contextBridge expondo canais IPC seguros.
- [x] Criar `shared/types.ts` para tipos compartilhados entre main e renderer.

#### 5.2 Main Process — IPC e serviços

- [x] Criar serviço `api.ts` com cliente HTTP, refresh automático e retry.
- [x] Criar serviço `auth.ts` com login, token storage (arquivo JSON) e refresh.
- [x] Criar serviço `catalogCache.ts` com cache SQLite local do catálogo.
- [x] Criar handlers IPC para auth, device, catalog, sale e cash-session.
- [x] Criar `utils/storage.ts` para persistência em arquivo JSON no main process.
- [x] Implementar `device.ts` — validação do dispositivo junto à API.

#### 5.3 Renderer — Contextos e páginas

- [x] Criar `AuthContext` com login, logout, restauração e estado unauthenticated.
- [x] Criar `CashSessionContext` com abertura/fechamento de caixa e estado.
- [x] Criar `Login` page com formulário de autenticação e tratamento de erros.
- [x] Criar `Dashboard` page com cards de ações e atalhos.
- [x] Criar `Sale` page com busca de produtos, carrinho, parcelamento e finalização.
- [x] Criar `CashSession` page com abertura/fechamento de caixa.
- [x] Criar componentes de UI (Button, Card, Input, Modal, Toast, Spinner, EmptyState).
- [x] Estilizar com CSS global responsivo.

#### 5.4 Testes e build

- [x] Criar 29 testes Vitest (AuthContext, CashSessionContext, UI components) — todos passam.
- [x] `electron-vite build` produz dist com 22.6KB + 2.1KB + 385KB.
- [x] Criar Playwright config + spec de login E2E.

### Sprint 6 — Contingência Offline e Sincronização

**Estado:** Concluída.  
**Objetivo:** manter vendas essenciais durante indisponibilidade breve e reconciliar com segurança.  
**Entregável:** journal SQLite restrito, sincronização idempotente e tratamento auditado de conflitos.

**Especificação:** [Design da Sprint 6](superpowers/specs/2026-07-17-sprint-6-pdv-electron-offline.md)

#### 6.1 Backend — Health check e Sync batch

- [x] Criar endpoint público `GET /api/v1/health/` em `backend/config/urls.py` e `views.py`.
- [x] Criar endpoint `POST /api/v1/sync/batch/` em `backend/sales/` para receber lote de operações.
- [x] Validar idempotency_key em cada operação do batch.
- [x] Retornar resultados individuais por operação (status, data, error).

#### 6.2 Main process — Backoff, Journal e Connectivity

- [x] Criar `pdv/src/main/utils/backoff.ts` com backoff exponencial (5s, 15s, 45s, 120s max).
- [x] Criar `pdv/src/main/services/operationJournal.ts` — SQLite append-only para operações pendentes.
- [x] Criar `pdv/src/main/services/connectivityMonitor.ts` — ping periódico, eventos net module.
- [x] Criar `pdv/src/main/services/conflictResolver.ts` — estratégias por tipo de operação.
- [x] Criar `pdv/src/main/services/syncEngine.ts` — coordena sync, fila, retry, cleanup.

#### 6.3 Main process — IPC handlers

- [x] Criar `pdv/src/main/ipc/sync.ts` — handlers para sync manual, status, fila pendente.
- [x] Criar `pdv/src/main/ipc/connectivity.ts` — handler para status de conexão e eventos.
- [x] Atualizar `pdv/src/main/index.ts` para inicializar novos serviços e IPC handlers.
- [x] Atualizar `pdv/src/preload/index.ts` com novos canais de sync e connectivity.

#### 6.4 Renderer — Indicadores de conectividade

- [x] Criar componente `SyncIndicator` (ícone verde/amarelo/vermelho + tooltip).
- [x] Criar componente `SyncStatusBar` (último sync, progresso, botão sincronizar agora).
- [x] Conectar indicadores ao contexto de sync via hooks IPC.
- [x] Atualizar `App.tsx` para incluir SyncIndicator e SyncStatusBar.

#### 6.5 Testes e build

- [x] Criar testes unitários Vitest para backoff, conflictResolver, operationJournal, connectivityMonitor e syncEngine (76 testes, 8 suites no total).
- [x] Criar testes unitários Vitest para operationJournal (11), connectivityMonitor (8) e syncEngine (12) — 31 novos testes com Electron mockado.
- [x] Executar `electron-vite build` sem erros (main 39.44kB, preload 2.59kB, renderer 391.80kB).
- [x] Executar suíte completa de testes frontend — 76 passed (8 files).
- [x] Executar regressão das Sprints 0-5 (Ruff: 0 erros, mypy: 0 erros, pytest: 200 passed — coverage 79.13%).

### Sprint 7 — Integração Fiscal

**Estado:** Implementada em validação técnica local.
**Objetivo:** emitir NFC-e por provedor externo atrás do contrato `FiscalProvider`.
**Entregável:** configuração por cliente, emissão assíncrona, estados fiscais, retries e webhooks idempotentes.

**Especificação:** [Design da Sprint 7](superpowers/specs/2026-07-18-sprint-7-fiscal-nfce-design.md)

**Plano:** [Plano de implementação da Sprint 7](superpowers/plans/2026-07-18-sprint-7-fiscal-nfce-implementation-plan.md)

#### 7.1 Fundação fiscal

- [x] Criar app Django `fiscal`.
- [x] Adicionar `Product.ncm`.
- [x] Adicionar `ie` e `address_json` em `Company` e `Branch`.
- [x] Criar models `FiscalEmitter`, `FiscalProductConfig` e `FiscalDocument`.
- [x] Criar migrations de `catalog`, `tenancy` e `fiscal`.

#### 7.2 Provider e PlugNotas

- [x] Criar contrato `FiscalProvider`.
- [x] Criar `EmitResult`, `QueryResult` e `CancelResult`.
- [x] Implementar `PlugNotasAdapter.emit()`.
- [x] Implementar `PlugNotasAdapter.query()`.
- [x] Implementar `PlugNotasAdapter.cancel()`.
- [x] Ler `PLUGNOTAS_API_KEY` por settings, sem versionar credenciais reais.

#### 7.3 Emissão assíncrona e polling

- [x] Implementar `emit_nfce()` idempotente por venda.
- [x] Falhar com erro claro quando a filial não tiver emitente fiscal configurado.
- [x] Falhar com erro claro quando produto não tiver NCM.
- [x] Criar documento `PROCESSING` quando o provedor aceitar a emissão.
- [x] Implementar polling `PROCESSING → CONCLUDED`.
- [x] Implementar rejeição `PROCESSING → REJECTED` com tentativa ativa nova quando permitido.
- [x] Registrar handler de outbox para `sales.sale.confirmed`.
- [x] Adicionar schedule Celery Beat para polling fiscal.

#### 7.4 API e webhook

- [x] Criar `GET /api/v1/sales/{sale_id}/fiscal-status/`.
- [x] Garantir isolamento por tenant no status fiscal.
- [x] Criar `POST /api/v1/fiscal/webhook/`.
- [x] Isentar webhook de `TenantMiddleware`.
- [x] Webhook usa payload apenas como índice e consulta o provider como fonte da verdade.

#### 7.5 Admin e testes

- [x] Registrar models fiscais no Django Admin.
- [x] Criar testes unitários do adapter PlugNotas.
- [x] Criar testes de emissão/polling fiscal.
- [x] Criar testes de API fiscal e webhook.
- [x] Criar testes de integração com outbox.

### Sprint 8 — Piloto, Observabilidade e Hardening

**Estado:** Concluída em 2026-07-19.
**Objetivo:** preparar um piloto controlado com segurança, operação, suporte e recuperação verificáveis.  
**Entregável:** release candidata com SLOs iniciais, alertas, backup restaurado, runbooks e critérios de rollback.

**Especificação:** [Design da Sprint 8](superpowers/specs/2026-07-18-sprint-8-pilot-observability-hardening-design.md)

**Plano:** [Plano de implementação da Sprint 8](superpowers/plans/2026-07-18-sprint-8-pilot-observability-hardening-implementation-plan.md)

#### 8.1 Checklist de piloto

- [x] Criar checklist de readiness do piloto.
- [x] Registrar responsáveis por Produto, Engenharia e Suporte.
- [x] Definir critérios objetivos de entrada e saída do piloto.

#### 8.2 Health, readiness e smoke tests

- [x] Expor readiness com banco, Redis/cache e Outbox.
- [x] Criar smoke test backend.
- [x] Criar smoke test PDV/frontend.
- [x] Garantir correlation ID nas respostas críticas.

#### 8.3 Métricas, dashboards e alertas

- [x] Documentar painéis de API, Outbox, fiscal, PDV offline e dependências.
- [x] Implementar ou expor helpers de métricas seguras.
- [x] Definir thresholds iniciais como baseline de piloto.

#### 8.4 Backup, restore e runbooks

- [x] Criar script de backup sem segredos embutidos.
- [x] Criar script de restore verificável em ambiente descartável.
- [x] Criar runbook de backup/restore.
- [x] Criar runbook de incidentes SEV-1 a SEV-4.
- [x] Criar runbook de rollback.

#### 8.5 Segurança e aceite

- [x] Executar scanner/grep de segredos.
- [x] Executar suíte backend, frontend/PDV disponível, Ruff, mypy e checks Django.
- [x] Registrar evidências no relatório final da Sprint 8.
- [x] Criar commit final `chore: sprint 8 - piloto observabilidade hardening`.

### Sprint 9 — Devoluções, Cancelamentos e Estornos

**Estado:** Concluída em 2026-07-21.
**Objetivo:** completar o ciclo pós-venda com fatos compensatórios auditáveis.
**Entregável:** devolução parcial/total, cancelamento, reentrada de estoque, reembolso/estorno e integração fiscal quando aplicável.

**Especificação:** [Design da Sprint 9](superpowers/specs/2026-07-18-sprint-9-returns-cancellations-refunds-design.md)

**Plano:** [Plano de implementação da Sprint 9](superpowers/plans/2026-07-18-sprint-9-returns-cancellations-refunds-implementation-plan.md)

#### 9.1 Domínio pós-venda

- [x] Criar modelos de devolução, item devolvido, reembolso e cancelamento.
- [x] Garantir venda confirmada imutável.
- [x] Bloquear devolução acima da quantidade vendida líquida.

#### 9.2 Serviços transacionais

- [x] Implementar devolução parcial/total idempotente.
- [x] Reentrar estoque por movimento auditável.
- [x] Registrar reembolso em dinheiro, Pix ou cartão externo.
- [x] Implementar cancelamento total com compensações necessárias.

#### 9.3 Fiscal e API

- [~] Solicitar cancelamento fiscal quando documento autorizado permitir — *decidido: on-demand, nunca automático; operador solicita manualmente via interface futura.*
- [x] Expor endpoints de devolução, cancelamento e consulta.
- [x] Retornar Problem Details para erros de regra.
- [x] Testar isolamento cross-tenant.

#### 9.4 Qualidade e aceite

- [x] Criar testes de models, services e API.
- [x] Executar suíte focada e suíte completa.
- [x] Registrar evidências no relatório final da Sprint 9.
- [x] Criar commit final `feat: sprint 9 - devolucoes cancelamentos estornos`.

### Sprint 10 — Compras, Recebimento e Contas a Pagar

**Estado:** Concluída em 2026-07-21.
**Objetivo:** implementar reposição básica com pedido de compra, recebimento, entrada de estoque e obrigação financeira.
**Entregável:** fluxo fornecedor → pedido → recebimento parcial/total → estoque → conta a pagar.

**Especificação:** [Design da Sprint 10](superpowers/specs/2026-07-18-sprint-10-purchasing-receiving-payables-design.md)

**Plano:** [Plano de implementação da Sprint 10](superpowers/plans/2026-07-18-sprint-10-purchasing-receiving-payables-implementation-plan.md)

#### 10.1 Fundação de compras

- [x] Criar app `purchasing`.
- [x] Criar fornecedor, pedido de compra e itens.
- [x] Implementar aprovação de pedido e imutabilidade após aprovação.

#### 10.2 Recebimento e estoque

- [x] Criar recebimento e itens recebidos.
- [x] Permitir recebimento parcial.
- [x] Bloquear recebimento acima do pendente.
- [x] Gerar entrada de estoque idempotente.

#### 10.3 Contas a pagar

- [x] Criar obrigação financeira a partir do recebimento.
- [x] Garantir vínculo com fornecedor, pedido e recebimento.
- [x] Bloquear duplicidade por retry.

#### 10.4 API e aceite

- [x] Expor CRUD de fornecedor, pedido, aprovação e recebimento.
- [x] Testar cross-tenant, idempotência e regras de status.
- [x] Registrar evidências no relatório final da Sprint 10.
- [x] Criar commit final `feat: sprint 10 - compras recebimento contas a pagar`.

### Sprint 11 — Financeiro, Fluxo de Caixa e Relatórios Operacionais

**Estado:** Concluída em 2026-07-21.
**Objetivo:** consolidar contas a pagar/receber, liquidações, fluxo de caixa e relatórios operacionais.
**Entregável:** visão gerencial inicial por período, tenant, empresa e filial, preparada para futura IA somente leitura.

**Especificação:** [Design da Sprint 11](superpowers/specs/2026-07-18-sprint-11-financial-cashflow-reporting-design.md)

**Plano:** [Plano de implementação da Sprint 11](superpowers/plans/2026-07-18-sprint-11-financial-cashflow-reporting-implementation-plan.md)

#### 11.1 Núcleo financeiro

- [x] Criar ou consolidar app `financial`.
- [x] Criar contas financeiras, recebíveis, pagáveis, liquidações e fluxo de caixa.
- [x] Garantir imutabilidade de lançamentos confirmados.

#### 11.2 Integrações financeiras

- [x] Registrar efeitos financeiros de vendas.
- [x] Registrar efeitos financeiros de compras.
- [x] Implementar liquidação parcial/total.
- [x] Bloquear baixa acima do saldo.

#### 11.3 Relatórios e exportações

- [x] Criar relatórios de vendas, caixa, estoque, financeiro e pendências fiscais/offline.
- [x] Adicionar filtros por período, filial e status.
- [x] Limitar exportações e proteger dados sensíveis.

#### 11.4 Preparação futura para IA

- [x] Documentar read models permitidos para RAG/copiloto futuro.
- [x] Classificar campos financeiros/fiscais sensíveis.
- [x] Manter IA fora da execução transacional.

#### 11.5 Qualidade e aceite

- [x] Criar testes de models, services, relatórios e API.
- [x] Executar suíte focada e suíte completa.
- [x] Registrar evidências no relatório final da Sprint 11.
- [x] Criar commit final `feat: sprint 11 - financeiro fluxo caixa relatorios`.

### Sprint 12 — Pessoas, Clientes e Parceiros

**Estado:** Concluída em 2026-08-15.
**Objetivo:** criar cadastro operacional de pessoas PF/PJ para clientes, fornecedores, transportadores e contatos.
**Entregável:** pessoas tenant-scoped com documentos, endereços, contatos, papéis, consentimentos e integração com vendas/compras/fiscal.

**Especificação:** [Design da Sprint 12](superpowers/specs/2026-07-18-sprint-12-people-customers-partners-design.md)

**Plano:** [Plano de implementação da Sprint 12](superpowers/plans/2026-07-18-sprint-12-people-customers-partners-implementation-plan.md)

#### 12.1 Fundação de pessoas

- [x] Criar app `people`.
- [x] Criar modelos `Person`, `PersonRole`, `PersonDocument`, `PersonAddress`, `PersonContact` e `ConsentRecord`.
- [x] Normalizar CPF/CNPJ, e-mail, telefone e endereço.
- [x] Garantir unicidade de documento ativo por tenant.

#### 12.2 Serviços, auditoria e LGPD

- [x] Implementar criação/atualização/desativação de pessoa.
- [x] Preservar histórico por exclusão lógica.
- [x] Auditar alterações sensíveis.
- [x] Atualizar classificação de dados pessoais.

#### 12.3 Integrações e API

- [x] Expor APIs de pessoas, endereços, contatos e consentimentos.
- [x] Permitir venda com cliente identificado sem bloquear venda anônima.
- [x] Relacionar fornecedor de compras a `Person`.
- [x] Preparar dados de destinatário fiscal.

#### 12.4 Qualidade e aceite

- [x] Criar testes de models, services, API e integrações.
- [x] Testar isolamento cross-tenant.
- [x] Registrar evidências no relatório final da Sprint 12.
- [x] Criar commit final `feat: sprint 12 - pessoas clientes parceiros`.

### Sprint 13 — Pagamentos Integrados e Conciliação

**Estado:** Concluída em 2026-07-21.
**Objetivo:** evoluir de pagamento manual para contratos de provider, webhooks idempotentes e conciliação financeira.
**Entregável:** app `payments` com provider fake, transações, webhooks, conciliação bruto/líquido e integração financeira.

**Especificação:** [Design da Sprint 13](superpowers/specs/2026-07-18-sprint-13-payments-reconciliation-design.md)

**Plano:** [Plano de implementação da Sprint 13](superpowers/plans/2026-07-18-sprint-13-payments-reconciliation-implementation-plan.md)

#### 13.1 Fundação de pagamentos

- [x] Criar app `payments`.
- [x] Criar configuração de provider, intenção, transação, webhook e conciliação.
- [x] Manter pagamento externo/manual funcionando.
- [x] Proteger segredos de provider.

#### 13.2 Provider e webhooks

- [x] Definir contrato `PaymentProvider`.
- [x] Implementar provider fake determinístico.
- [x] Validar webhook e idempotência.
- [x] Separar autorização, captura, cancelamento e estorno.

#### 13.3 Conciliação financeira

- [x] Importar lote de conciliação.
- [x] Comparar valor bruto, taxa e líquido.
- [x] Gerar liquidação ou ajuste financeiro.
- [x] Sinalizar divergência para revisão manual.

#### 13.4 Qualidade e aceite

- [x] Criar testes de provider, services, webhooks, conciliação e API.
- [x] Testar segredo ausente em logs/auditoria/outbox.
- [x] Registrar evidências no relatório final da Sprint 13.
- [x] Criar commit final `feat: sprint 13 - pagamentos conciliacao`.

### Sprint 14 — IA Readiness e Copiloto Somente Leitura

**Estado:** Planejada; spec e plan preparados em 2026-07-18.
**Objetivo:** preparar base segura para IA futura, começando por RAG documental e copiloto operacional somente leitura.
**Entregável:** governança de fontes, redaction, autorização, auditoria, provider fake e API de consulta sem ações transacionais.

**Especificação:** [Design da Sprint 14](superpowers/specs/2026-07-18-sprint-14-ai-readiness-readonly-copilot-design.md)

**Plano:** [Plano de implementação da Sprint 14](superpowers/plans/2026-07-18-sprint-14-ai-readiness-readonly-copilot-implementation-plan.md)

#### 14.1 Governança de IA

- [ ] Documentar fontes permitidas e proibidas.
- [ ] Documentar política somente leitura.
- [ ] Atualizar classificação de dados para interações com IA.
- [ ] Definir que ações de escrita exigirão aprovação humana futura.

#### 14.2 Copiloto e redaction

- [ ] Criar app `copilot` ou `ai_core`.
- [ ] Criar registro de fontes, consultas, citações e feedback.
- [ ] Implementar redaction de dados restritos.
- [ ] Auditar perguntas e respostas sem vazar segredo.

#### 14.3 Query API

- [ ] Implementar provider fake para testes determinísticos.
- [ ] Responder perguntas documentais com citações.
- [ ] Responder perguntas operacionais apenas via read models permitidos.
- [ ] Bloquear consulta cross-tenant.

#### 14.4 Qualidade e aceite

- [ ] Criar testes de modelos, redaction, autorização, services e API.
- [ ] Provar que IA não escreve em vendas, fiscal, estoque ou financeiro.
- [ ] Registrar evidências no relatório final da Sprint 14.
- [ ] Criar commit final `feat: sprint 14 - ia readiness copiloto leitura`.

### Sprint 15 — SaaS Comercial e Administração da Plataforma

**Estado:** Concluída em 2026-07-21; aceite técnico e funcional registrado no relatório final.
**Objetivo:** preparar operação comercial SaaS com planos, assinaturas, entitlements, suspensão, suporte e feature flags.
**Entregável:** administração de plataforma separada dos dados operacionais do cliente.

**Especificação:** [Design da Sprint 15](superpowers/specs/2026-07-18-sprint-15-saas-commercial-admin-design.md)

**Plano:** [Plano de implementação da Sprint 15](superpowers/plans/2026-07-18-sprint-15-saas-commercial-admin-implementation-plan.md)

#### 15.1 Núcleo comercial SaaS

- [x] Criar ou consolidar app `platform_admin` (nome seguro, sem conflito com a biblioteca padrão `platform`).
- [x] Criar plano, assinatura, entitlement e feature flag.
- [x] Definir política de tenant ativo, suspenso e cancelado.
- [x] Separar cobrança externa de capacidades internas.

#### 15.2 Entitlements, flags e suporte

- [x] Implementar consulta de capacidade e limite por tenant.
- [x] Implementar feature flags tenant-scoped.
- [x] Implementar solicitação de acesso de suporte temporário.
- [x] Auditar toda ação administrativa.

#### 15.3 API administrativa

- [x] Expor endpoints administrativos para planos, assinaturas, entitlements, flags e suporte.
- [x] Bloquear usuário comum e cross-tenant.
- [x] Retornar Problem Details para permissão, validação e conflitos.

#### 15.4 Qualidade e aceite

- [x] Criar testes de models, services e API administrativa.
- [x] Documentar modelo operacional SaaS.
- [x] Registrar evidências no relatório final da Sprint 15.
- [x] Criar commit final `feat: sprint 15 - saas comercial admin`.

#### Protocolo de execução das Sprints 16–20

**Opção registrada:** executar todas as sprints com `superpowers:subagent-driven-development` (opção 1), na ordem 16 → 17 → 18 → 19 → 20. Não solicitar novas decisões de arquitetura: specs e plans são autoritativos. Cada tarefa exige implementação com TDD, revisão de aderência à especificação e revisão de qualidade antes do avanço.

**Orquestração:** [Plano mestre de execução Subagent-Driven](superpowers/plans/2026-07-21-sprints-16-20-subagent-execution-master-plan.md)

### Sprint 16 — Fundação Frontend e Contrato da API

**Estado:** Concluída em 2026-07-21.
**Objetivo:** criar a aplicação React/Vite/TypeScript e tornar a API segura e tipada para consumo no navegador.

**Especificação:** [Design da Sprint 16](superpowers/specs/2026-07-21-sprint-16-frontend-foundation-api-contract-design.md)

**Plano:** [Plano de implementação da Sprint 16](superpowers/plans/2026-07-21-sprint-16-frontend-foundation-api-contract-implementation-plan.md)

- [x] Configurar OpenAPI, CORS, CSRF e cliente TypeScript gerado.
- [x] Implementar login por sessão, MFA e seleção de tenant.
- [x] Criar shell acessível, estados de erro e gates frontend no CI.
- [x] Validar autenticação e troca de tenant com Playwright.

### Sprint 17 — Shell Administrativo, Tenancy e Acessos

**Estado:** Concluída em 2026-07-22.
**Objetivo:** entregar painel administrativo para empresas, filiais, membros, convites, MFA e dispositivos PDV.

**Especificação:** [Design da Sprint 17](superpowers/specs/2026-07-21-sprint-17-admin-shell-tenancy-design.md)

**Plano:** [Plano de implementação da Sprint 17](superpowers/plans/2026-07-21-sprint-17-admin-shell-tenancy-implementation-plan.md)

- [x] Criar dashboard e contexto de empresa/filial.
- [x] Gerenciar empresas, filiais, membros e convites.
- [x] Gerenciar política MFA e dispositivos.
- [x] Validar papéis e isolamento cross-tenant nos três browsers.

### Sprint 18 — Catálogo, Estoque e Compras Web

**Estado:** Concluída em 2026-07-22.
**Objetivo:** disponibilizar jornadas web de catálogo, estoque, fornecedores, pedidos e recebimentos.

**Especificação:** [Design da Sprint 18](superpowers/specs/2026-07-21-sprint-18-catalog-inventory-purchasing-web-design.md)

**Plano:** [Plano de implementação da Sprint 18](superpowers/plans/2026-07-21-sprint-18-catalog-inventory-purchasing-web-implementation-plan.md)

- [x] Implementar catálogo e preços.
- [x] Implementar saldos, lotes e movimentações de estoque.
- [x] Implementar fornecedores, pedidos, recebimentos e devoluções.
- [x] Validar jornada vertical produto → compra → recebimento.

### Sprint 19 — Gestão de PDV, Pessoas e Financeiro Web

**Estado:** Concluída em 2026-07-22.
**Objetivo:** supervisionar operações do PDV Electron e seus efeitos sem criar um segundo ponto de venda.

**Especificação:** [Design da Sprint 19](superpowers/specs/2026-07-21-sprint-19-pdv-management-people-financial-design.md)

**Plano:** [Plano de implementação da Sprint 19](superpowers/plans/2026-07-21-sprint-19-pdv-management-people-financial-implementation-plan.md)

- [x] Consultar vendas, caixas, operadores e dispositivos do PDV.
- [x] Executar devoluções, cancelamentos e estornos autorizados.
- [x] Gerenciar pessoas com controles de PII.
- [x] Gerenciar obrigações, liquidações, fluxo de caixa e relatórios.

### Sprint 20 — Fiscal, Pagamentos, Observabilidade e Aceite E2E

**Estado:** Concluída em 2026-07-22.
**Objetivo:** concluir o painel web e validar o release administrativo de ponta a ponta.

**Especificação:** [Design da Sprint 20](superpowers/specs/2026-07-21-sprint-20-fiscal-payments-observability-e2e-design.md)

**Plano:** [Plano de implementação da Sprint 20](superpowers/plans/2026-07-21-sprint-20-fiscal-payments-observability-e2e-implementation-plan.md)

- [x] Implementar gestão fiscal e downloads autorizados.
- [x] Implementar transações e conciliação de pagamentos.
- [x] Implementar painel de observabilidade operacional.
- [x] Aprovar E2E, acessibilidade, segurança e orçamento de bundle.

### Sprint 21 — Estilização do Painel Web Administrativo

**Estado:** Concluída em 2026-07-24.
**Objetivo:** aplicar Tailwind CSS v4 em todos os módulos frontend para uma interface profissional e consistente.

**Especificação:** [Design da Sprint 21](superpowers/specs/2026-07-23-sprint-21-styling-design.md)

**Plano:** [Plano de implementação da Sprint 21](superpowers/plans/2026-07-23-sprint-21-styling-implementation-plan.md)

- [x] Criar design tokens e componentes base (Button, Card, Table, Badge, Modal, Skeleton)
- [x] Estilizar layout, navegação e login
- [x] Estilizar Dashboard, Organization, Access, Security
- [x] Estilizar Catalog, Inventory, Purchasing
- [x] Estilizar Sales, People, Financial
- [x] Estilizar Fiscal, Payments, Monitoring
- [x] Validar 283 testes, 0 erros TypeScript

---

### Sprint 23 — Kit Composition with Inventory Decomposition

**Estado:** Concluída em 2026-07-31.
**Objetivo:** implementar composição de kits e decomposição de estoque.

**Entregável:** tela de composição no frontend, API de composição e decomposição de estoque.

#### 23.1 Frontend composition screens

- [x] Atualizar `ProductCompositionStep` com fetch/criação/exclusão real de composição.
- [x] Adicionar `fetchComposition`, `createCompositionItem`, `deleteCompositionItem` no `catalogApi`.
- [x] Adicionar testes Vitest para aba de composição e criação de item.
- [x] Adicionar `compositionSchema` no `catalogSchemas`.

#### 23.2 PRD e encerramento

- [x] Atualizar PRD.md com entrada da Sprint 23.
- [x] Executar suíte completa de testes frontend.
- [x] Commit e merge em master.

---

### Sprints 24–30 — Catálogo completo e hardening

**Estado:** Concluídas e auditadas em 2026-08-01.
**Especificação de continuidade:** [Sprints 31–33](superpowers/specs/2026-08-01-catalog-next-sprints-design.md)
**Plano de continuidade:** [Plano Sprints 31–33](superpowers/plans/2026-08-01-catalog-next-sprints-implementation-plan.md)

- [x] Sprint 24 — editor de produto no padrão B, mídia à esquerda e identificação à direita.
- [x] Sprint 25 — categorias, marcas e unidades de medida com cadastros administrativos.
- [x] Sprint 26 — serviços com preço e dados fiscais; combos com composição.
- [x] Sprint 27 — upload/galeria de imagens e canais de venda idempotentes.
- [x] Sprint 28 — modelos e pré-visualização de etiquetas antes do download.
- [x] Sprint 29 — auditoria multi-tenant e integridade de dados.
- [x] Sprint 30 — hardening, regressão e aceite em Chromium, Firefox e WebKit.
- [x] Ajuste visual pós-aceite — shell TJSys com navegação em dois níveis, drawer responsivo e editor padrão B (imagem à esquerda, identificação à direita), validado em 2026-08-01.

**Evidência:** [Relatório final da Sprint 30](10_Releases/SPRINT-030_Catalog_Hardening_Acceptance_Final_Report.md).
**Rollback:** [Runbook das Sprints 23–30](09_Operations/CATALOG_SPRINTS_23_30_ROLLBACK.md).

---

### Próximas fases aprovadas

- [ ] Sprint 31 — performance, code splitting e acessibilidade WCAG 2.2 AA.
- [ ] Sprint 32 — regras por filial para combos e fiscal avançado de serviços.
- [ ] Sprint 33 — observabilidade, piloto e exercício de rollback.

Cada fase possui critérios objetivos e gates no plano e na especificação vinculados acima.

---

## Registro de execução

Adicionar uma entrada somente ao encerrar cada sprint:

| Sprint | Data | Commit | Testes | Pendências ou riscos | Aprovação |
|---:|---|---|---|---|---|
| 0 | 2026-07-14 | `feat: sprint 0 - fundação técnica` + estabilização de testes | Regressão completa aprovada em 2026-07-17 dentro da suíte `192 passed`; cobertura total 80.19% | Setup de testes usa banco PostgreSQL pré-provisionado e reset idempotente por sessão | Aprovado localmente |
| 1 | 2026-07-14 | `feat: sprint 1 - autenticação e onboarding` | Regressão completa aprovada em 2026-07-17 dentro da suíte `192 passed`; bloco isolado Sprint 1 `24 passed` | Warnings depreciação Django/Python em decorator auth, sem falha funcional | Aprovado localmente |
| 2 | 2026-07-16 | `feat: sprint 2 - catalogo e cadastros-base` + hardening | Regressão completa aprovada em 2026-07-17 dentro da suíte `192 passed`; `test_catalog_rls.py` `9 passed` | `ExclusionConstraint` sobre preços omitida; validação permanece em `full_clean()` via API | Aprovado localmente |
| 3 | 2026-07-17 | `feat: sprint 3 - estoque e movimentacoes` + pre-flight Sprint 4 | Suíte completa `192 passed`; cobertura 80.19%; Ruff, mypy, check, makemigrations e deploy check aprovados | Mergeada em master em 2026-07-17 | Aprovado localmente |
| 4 | 2026-07-17 | Merge em `master` via `feat/sprint-3-inventory` | 200+ testes backend; 29 Vitest frontend | Incluída no merge consolidado Sprints 3+4+5 | Aprovado localmente |
| 5 | 2026-07-17 | Merge em `master` via `feat/sprint-3-inventory` | `electron-vite build` OK; 29 Vitest pass; Playwright spec criada | PDV Electron online incluso no merge consolidado | Aprovado localmente |
| 6 | 2026-07-17 | Branch `feat/sprint-6-pdv-offline` | Frontend: 76 Vitest (47 main + 29 renderer) + 6 E2E Playwright. Backend: 200 pytest, Ruff 0, mypy 0, coverage 79.13% | Cobertura 79.13% (novo sales/ sem testes dedicados); testes de integração operationJournal/connectivityMonitor/syncEngine usam Electron mockado em vez de Electron runtime real | Aprovado localmente |
| 16 | 2026-07-21 | `feat/sprint-16-frontend-foundation` | Frontend: 48 Vitest (6 files), 3 E2E Playwright; Backend: 422 pytest | TypeScript 0 errors; MSW mock server configurado | Aprovado localmente |
| 17 | 2026-07-22 | `feat/sprint-17-admin-tenancy` | Frontend: 103 Vitest (11 files), 8 E2E Playwright; Backend: 9 BDD tests | 10 falhas pré-existentes (paginação payments/people/purchasing) | Aprovado localmente |
| 18 | 2026-07-22 | `feat/sprint-18-operations-web` | Frontend: 171 Vitest (15 files), 8 E2E Playwright; TypeScript 0 errors | E2E Playwright requer stack completa (backend+frente) | Aprovado localmente |
| 19 | 2026-07-22 | `feat/sprint-19-pdv-management-web` | Frontend: 251 Vitest (19 files); Backend: 34 BDD tests; TypeScript 0 errors | Nenhuma rota web de criação de venda (non-negotiable) | Aprovado localmente |
| 20 | 2026-07-22 | `feat/sprint-20-web-release` | Frontend: 283 Vitest (22 files); Backend: 38 BDD tests; TypeScript 0 errors; E2E 32 specs | Export CSV fiscal (action DRF) pendente de fix | Aprovado localmente |
| 21 | 2026-07-24 | `feat/sprint-21-styling` | Frontend: 283 Vitest (22 files); TypeScript 0 errors; Tailwind CSS v4 em 17 módulos | UI components: Button, Card, Table, Badge, Modal, Skeleton, LoadingState, EmptyState | Aprovado localmente |
| 23 | 2026-07-31 | `feat: sprint 23 - composicao de kit` | Frontend: Vitest + TypeScript 0 errors | Composition screens + tests | Aprovado localmente |
| 24–30 | 2026-08-01 | `codex/fix-sprints-23-30` | Backend 671; frontend 326; PDV 137; Playwright 12/12 em 3 navegadores | Aviso de bundle principal acima de 250 kB endereçado na Sprint 31 | Aprovado localmente |
| 12 | 2026-08-15 | `feat: sprint 12 - pessoas clientes parceiros` | People: 10 passed (models, services, api, integrations); Global: 406 passed, coverage 81.72% | ruff: 40 pre-existing errors (review dirs, test files); mypy: 109 pre-existing var-annotated in Django models | Aprovado localmente |
