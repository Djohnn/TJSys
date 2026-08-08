# Sprint 16 — Fundação Frontend e Contrato da API — Design

## Objetivo

Preparar o TJSys para desenvolvimento web seguro e previsível com React, Vite e TypeScript, eliminando impedimentos de integração entre navegador e backend.

## Escopo

Criar a aplicação em `frontend/`, publicar um contrato OpenAPI versionado e configurar autenticação por sessão, CSRF, CORS, seleção de tenant, cliente tipado e gates de CI.

## Arquitetura

- React + Vite + TypeScript em aplicação independente do PDV Electron.
- React Router para navegação e rotas protegidas.
- TanStack Query para cache e estado de servidor.
- React Hook Form + Zod para formulários.
- Cliente HTTP centralizado, gerado do OpenAPI e configurado com `credentials: include`.
- Sessão segura via cookie HttpOnly; JWT permanece restrito ao PDV/dispositivos.
- Tenant ativo enviado em `X-Tenant-ID`; troca de tenant invalida todo cache tenant-scoped.
- Problem Details convertido em um tipo de erro único para a interface.

## Backend readiness

- Configurar CORS por allowlist de ambiente e credenciais.
- Publicar e validar OpenAPI para `/api/v1`.
- Padronizar paginação, conteúdo JSON e erros necessários aos fluxos iniciais.
- Documentar CSRF, sessão, MFA, headers e correlation ID.

## Fluxos iniciais

1. aplicação obtém CSRF;
2. usuário autentica e conclui MFA quando exigido;
3. frontend consulta usuário e memberships;
4. usuário escolhe tenant ativo;
5. cliente passa a enviar `X-Tenant-ID`;
6. rotas protegidas renderizam o shell vazio dos módulos.

## Segurança e erros

- Nenhum token, segredo ou senha em localStorage/sessionStorage.
- `401` encerra o contexto local e retorna ao login.
- `403`, `404`, `409`, validação e indisponibilidade possuem estados visuais distintos.
- Respostas e telemetria exibem correlation ID sem dados pessoais.

## Testes

- Vitest e Testing Library para auth, tenant e cliente HTTP.
- MSW para sucesso, expiração, MFA, CSRF e Problem Details.
- Playwright para login, logout e troca de tenant.
- axe-core nos fluxos de autenticação e shell.
- CI executa lint, typecheck, testes, build e validação OpenAPI.

## Fora do escopo

- Telas operacionais completas.
- Venda balcão web ou contingência offline.
- SSR, Next.js e compartilhamento de runtime com Electron.

## Critérios de aceite

- Frontend compila e serve localmente sem configuração manual de código.
- Login por sessão, MFA, logout e seleção de tenant funcionam no navegador.
- Requisições cross-origin locais respeitam CORS e CSRF.
- Cliente TypeScript é reproduzível a partir do OpenAPI.
- Troca de tenant não preserva dados visíveis do tenant anterior.
- Gates frontend e contrato falham o CI em regressão.
