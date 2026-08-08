# Sprint 1 — Autenticação, Onboarding e Autorização

Data: 2026-07-14
Estado: aprovado para planejamento

## Objetivo

Entregar o ciclo seguro de entrada no TJSys: cadastro público do primeiro administrador, confirmação de e-mail, criação transacional da organização inicial, autenticação por sessão, recuperação de acesso, MFA por TOTP ou e-mail, convites e autorização contextual por capability.

## Escopo

### Incluído

- cadastro público do primeiro administrador;
- confirmação de endereço de e-mail;
- criação atômica de `Tenant`, empresa, filial principal e membership administrativa;
- login e logout por sessão Django;
- recuperação e troca de senha sem enumeração de contas;
- MFA por TOTP compatível com aplicativos autenticadores;
- MFA por código de e-mail;
- códigos de recuperação de uso único armazenados somente como hash;
- política de métodos MFA permitidos por tenant;
- escolha do método pelo usuário entre os métodos permitidos;
- bloqueio de administradores sem MFA configurado;
- convites com validade, uso único, papel e escopo de filiais;
- capabilities associadas aos papéis do tenant;
- auditoria de ações administrativas e de segurança;
- rate limiting para login, confirmação, recuperação e desafios MFA;
- APIs REST versionadas e respostas Problem Details;
- testes unitários, integração, API, isolamento, IDOR e segurança.

### Fora do escopo

- interface visual completa do frontend;
- login social, SAML, OIDC ou SSO corporativo;
- SMS, WhatsApp, push, passkeys ou WebAuthn;
- cobrança ou assinatura do tenant;
- configuração fiscal;
- autenticação própria do PDV;
- IA.

## Decisões arquiteturais

Será usada a autenticação nativa do Django com Django REST Framework e serviços de domínio próprios. O TJSys não adotará nesta sprint um provedor externo de identidade nem uma suíte de autenticação que substitua os limites do domínio.

Sessões seguras serão o mecanismo da aplicação web. Tokens de confirmação, recuperação e convite serão aleatórios, enviados ao usuário e persistidos somente como digest criptográfico. Nenhum token, segredo TOTP, código MFA, código de recuperação ou senha será escrito em logs, auditoria ou Outbox.

## Modelo de domínio

### Identidade

`CustomUser` continuará global e identificado por e-mail normalizado. Serão acrescentados estados explícitos de confirmação de e-mail e controles de segurança necessários. Respostas públicas terão comportamento indistinguível quando o endereço existir ou não.

### Onboarding

O cadastro público receberá dados mínimos do administrador e da organização. Uma operação transacional criará usuário, tenant, empresa, filial principal e membership `admin`. Se qualquer etapa falhar, nada será persistido. O tenant permanecerá sem acesso operacional até a confirmação do e-mail e configuração de pelo menos um método MFA pelo administrador.

Slugs serão derivados do nome e receberão sufixo não sensível em caso de colisão. O cliente não poderá escolher IDs, papel administrativo ou tenant de destino no payload.

### Política MFA

Cada tenant terá uma política com `allow_totp` e `allow_email`. Ao menos um método deverá permanecer permitido. O padrão do MVP permitirá ambos, recomendará TOTP e aceitará e-mail como alternativa.

Usuários administrativos deverão configurar e validar pelo menos um método permitido antes de acessar operações tenant-scoped. Se uma política remover o único método de um administrador, a alteração será rejeitada até existir outro método verificado.

### TOTP

O segredo TOTP será gerado no servidor, exibido uma única vez durante o enrollment e armazenado criptografado com chave externa obrigatória em produção. O QR code será representado por uma URI `otpauth`, sem persistência em logs. A ativação exigirá um código válido. A janela de tolerância será limitada a um intervalo anterior ou posterior.

### MFA por e-mail

O desafio terá código aleatório, digest persistido, expiração de dez minutos, uso único, limite de cinco tentativas e cooldown de reenvio. O endpoint responderá de forma sanitizada. O backend de e-mail será console em desenvolvimento/testes e SMTP por variáveis de ambiente em produção.

### Recuperação

Após ativar MFA, o usuário receberá códigos de recuperação de uso único. Apenas os hashes serão armazenados; a lista original será exibida uma vez. Regenerar a lista invalidará todos os códigos anteriores e será auditado.

### Convites

Administradores poderão convidar por e-mail, papel e filiais do tenant ativo. O token terá validade configurável, uso único e digest persistido. Aceitar o convite exigirá que o e-mail autenticado corresponda ao convite. Recursos de outro tenant retornarão 404. Reenvio revogará o token anterior.

### Capabilities

Papéis iniciais:

- `admin`: gerencia organização, usuários, convites, política MFA e todos os escopos;
- `manager`: consulta organização e opera somente empresas/filiais concedidas;
- `operator`: acessa somente capabilities operacionais e filiais concedidas.

As decisões serão centralizadas em um serviço de autorização que recebe usuário, tenant, capability e escopo opcional. Views não usarão verificações dispersas de strings de papel. As capabilities iniciais serão `organization.manage`, `users.manage`, `users.read` e `organization.read`.

## Fluxos

### Cadastro e ativação

1. Cliente envia cadastro mínimo.
2. Serviço normaliza o e-mail e executa a criação organizacional em uma transação.
3. Token de confirmação é persistido como digest e o e-mail é enfileirado após commit.
4. Confirmação válida marca o e-mail como verificado.
5. Administrador escolhe TOTP ou e-mail entre os métodos permitidos.
6. Após validação do MFA, a sessão recebe estado de autenticação forte e pode operar no tenant.

### Login

1. Credenciais são verificadas com mensagem genérica em caso de falha.
2. Conta inativa ou e-mail não confirmado não recebe sessão operacional.
3. Usuário com MFA recebe desafio intermediário vinculado à sessão.
4. Código válido eleva a sessão; falhas são limitadas e auditadas sem registrar o código.
5. Logout invalida a sessão no servidor.

### Recuperação de senha

1. Solicitação sempre retorna resposta genérica.
2. Quando aplicável, token de uso único é enviado após commit.
3. Redefinição válida troca a senha, revoga sessões existentes e invalida o token.
4. O próximo login ainda exige MFA.

## Segurança

- deny-by-default para tenant, capability, empresa e filial;
- rate limiting por combinação de IP sanitizado, conta e finalidade;
- mensagens uniformes contra enumeração;
- comparação constante para códigos e digests;
- rotação de sessão no login e após MFA;
- cookies `HttpOnly`, `Secure` em produção e `SameSite=Lax`;
- CSRF obrigatório para autenticação por sessão;
- expiração e uso único em todos os artefatos temporários;
- segredo TOTP cifrado, com chave fora do banco e do Git;
- tokens e códigos jamais retornam em endpoints após a criação correspondente;
- auditoria contém somente metadados necessários;
- nenhuma autorização deriva de `tenant_id`, papel ou capability enviados pelo cliente.

## APIs previstas

- `POST /api/v1/auth/register/`
- `POST /api/v1/auth/email/confirm/`
- `POST /api/v1/auth/login/`
- `POST /api/v1/auth/mfa/challenge/`
- `POST /api/v1/auth/mfa/totp/enroll/`
- `POST /api/v1/auth/mfa/totp/confirm/`
- `POST /api/v1/auth/mfa/email/send/`
- `POST /api/v1/auth/mfa/recovery/regenerate/`
- `POST /api/v1/auth/logout/`
- `POST /api/v1/auth/password/forgot/`
- `POST /api/v1/auth/password/reset/`
- `GET /api/v1/auth/me/`
- `GET|PATCH /api/v1/security/mfa-policy/`
- `GET|POST /api/v1/invitations/`
- `POST /api/v1/invitations/{id}/resend/`
- `POST /api/v1/invitations/accept/`
- `GET /api/v1/memberships/`
- `PATCH /api/v1/memberships/{id}/`

Todos os erros seguirão `application/problem+json` e carregarão `X-Correlation-ID`. Endpoints que consultam artefatos de outro tenant usarão 404.

## Observabilidade e auditoria

Serão auditados cadastro, confirmação, login bem-sucedido, bloqueios relevantes, logout, recuperação concluída, enrollment e remoção MFA, regeneração de recuperação, convite, reenvio, aceite, mudança de papel/escopo e alteração de política.

Logs incluirão operação, correlation ID, tenant e usuário quando disponíveis. E-mails, IPs completos, tokens, códigos e segredos não serão registrados. Métricas contarão resultados por operação sem labels de alta cardinalidade ou PII.

## Estratégia de testes

- regras puras de política MFA e capabilities;
- criação organizacional e rollback atômico;
- normalização e unicidade de e-mail;
- confirmação, expiração, reutilização e adulteração de tokens;
- login, logout, rotação e revogação de sessão;
- TOTP válido, inválido, reutilizado e fora da janela;
- e-mail MFA válido, expirado, limite de tentativas e cooldown;
- códigos de recuperação com uso único;
- recuperação de senha sem enumeração e com revogação de sessões;
- convites válidos, expirados, revogados, e-mail divergente e cross-tenant;
- capabilities por papel e escopo de filial;
- IDOR em política, convite e membership;
- auditoria sanitizada;
- rate limiting;
- regressão completa da Sprint 0 com PostgreSQL real e RLS.

## Critérios de aceite

- cadastro público cria a organização completa de forma atômica;
- e-mail precisa ser confirmado;
- administrador precisa concluir MFA antes de operações protegidas;
- TOTP e e-mail funcionam conforme a política do tenant;
- recuperação e convites não permitem enumeração, replay ou acesso cross-tenant;
- autorização por capability respeita papel e filial;
- nenhuma informação sensível aparece em logs, auditoria, Outbox ou Git;
- migrations, Ruff, mypy, testes, cobertura, deploy check, auditoria de dependências e detecção de segredos passam localmente ou na CI aplicável;
- PRD contém checklist granular e somente tarefas comprovadas são marcadas;
- CI remota da branch `master` termina com sucesso.
