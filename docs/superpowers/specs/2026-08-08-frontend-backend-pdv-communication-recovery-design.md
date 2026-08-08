# Recuperação da Comunicação entre Frontend, Backend e PDV

**Data:** 2026-08-08  
**Status:** Aguardando revisão  
**Escopo:** Configuração HTTP local, autenticação e renovação de tokens do PDV, runtime SQLite do Electron e validação integrada

## 1. Contexto

O diagnóstico confirmou que a comunicação básica está ativa: o backend responde com banco e cache saudáveis, e os proxies Vite do frontend e do PDV alcançam a API. A falha percebida não é uma indisponibilidade geral; ela ocorre em caminhos específicos de configuração e execução.

Foram comprovadas três causas:

1. `.env` permite CORS somente para `http://localhost:3000`, enquanto os clientes locais usam `http://localhost:5173`, `http://127.0.0.1:5173`, `http://localhost:5174` e `http://127.0.0.1:5174`.
2. Os interceptadores do PDV concatenam uma URL base terminada em `/` com `/devices/refresh/`, gerando `/api/v1//devices/refresh/`. O backend responde `404` nesse caminho.
3. O processo do PDV registra `ERR_DLOPEN_FAILED` ao carregar `better-sqlite3`. O binário instalado usa `NODE_MODULE_VERSION 125`, enquanto o Node.js local usa `NODE_MODULE_VERSION 137`. Isso compromete o cache de catálogo e o diário de operações offline quando o módulo é carregado pelo runtime incompatível.

## 2. Objetivo

Restabelecer uma integração previsível entre frontend, backend e PDV, cobrindo comunicação HTTP, autenticação, renovação de sessão, isolamento por tenant, catálogo, cache local e sincronização offline.

A correção será entregue em cinco passos independentes e verificáveis. Cada passo deverá produzir evidência automatizada antes de permitir o próximo.

## 3. Fora de escopo

- Alterar contratos de negócio de catálogo, estoque, vendas ou financeiro.
- Trocar Django, React, Electron, Axios ou Vite.
- Substituir `better-sqlite3` por outro banco local.
- Redesenhar o mecanismo de autenticação de dispositivos.
- Limpar dados de negócio ou recriar o banco PostgreSQL.
- Implementar infraestrutura de produção ou publicação externa.

## 4. Arquitetura da solução

```text
Frontend :5174 ── /api/v1/* ── proxy Vite ─┐
                                            ├── Backend Django :8000
PDV :5173 ────── /api/v1/* ── proxy Vite ──┤        │
PDV Electron main ─── URL absoluta ─────────┘        ├── PostgreSQL :5433
                                                     └── Redis :6380

PDV Electron main ── better-sqlite3 ── cache local + diário de sincronização
```

O frontend continuará usando URL relativa `/api/v1` no desenvolvimento. O renderer do PDV continuará usando o proxy Vite. O processo principal do Electron usará uma URL absoluta normalizada, sem barra duplicada. Chamadas diretas ao backend somente serão aceitas para as origens locais explicitamente configuradas.

## 5. Correção em cinco passos

### Passo 1 — Normalizar URLs e renovação de token do PDV

Será criada uma única função de composição de URL para impedir barras duplicadas. Tanto o processo principal quanto o renderer do PDV deverão reutilizar uma base normalizada.

Regras:

- A base absoluta do processo principal será `http://localhost:8000/api/v1`, sem `/` final.
- A base relativa do renderer será `/api/v1`, sem `/` final.
- Endpoints serão informados com `/` inicial.
- A renovação deverá chamar exatamente `/api/v1/devices/refresh/`.
- Uma resposta `401` acionará uma única tentativa de renovação.
- Se a renovação falhar, os tokens serão removidos e o usuário retornará ao login.
- A requisição original será repetida com a instância Axios configurada, preservando `baseURL`, tenant e headers.

### Passo 2 — Alinhar CORS, CSRF e origens locais

O ambiente local aceitará explicitamente:

- `http://localhost:5173`
- `http://127.0.0.1:5173`
- `http://localhost:5174`
- `http://127.0.0.1:5174`

As mesmas origens serão incluídas em `CORS_ALLOWED_ORIGINS` e `CSRF_TRUSTED_ORIGINS`. `CORS_ALLOW_CREDENTIALS` permanecerá habilitado porque o frontend administrativo usa sessão e cookie CSRF.

Origens não listadas continuarão sem `Access-Control-Allow-Origin`. Não será usado `CORS_ALLOW_ALL_ORIGINS`.

### Passo 3 — Compatibilizar `better-sqlite3` com Electron

O módulo nativo será compilado para o runtime do Electron declarado em `pdv/package.json`, e não para o Node.js global usado pelo terminal.

Regras:

- A versão do Electron será a fonte de verdade do ABI do PDV.
- A instalação deverá executar reconstrução de dependências nativas para Electron.
- O processo principal deverá abrir um banco SQLite temporário, executar `SELECT 1` e fechá-lo sem `ERR_DLOPEN_FAILED`.
- O cache de catálogo e o diário de operações deverão inicializar usando o diretório de dados do aplicativo.
- O procedimento deverá ser reproduzível após instalação limpa de dependências.

### Passo 4 — Criar testes de contrato de comunicação

Os testes automatizados cobrirão as fronteiras entre os componentes:

1. Backend: health, readiness, CORS permitido e CORS rejeitado.
2. Frontend: proxy para `/api/v1/health/`, CSRF e login com MFA pendente.
3. PDV: validação de chave de dispositivo, emissão de tokens e acesso ao catálogo com `X-Tenant-ID`.
4. Renovação: endpoint sem barra duplicada, rotação de refresh token e repetição da requisição original.
5. SQLite: abertura do cache, escrita/leitura e diário pendente sem erro nativo.

Os testes não deverão usar esperas fixas. Dados de autenticação serão provenientes do seed E2E e de variáveis de ambiente.

### Passo 5 — Executar validação E2E integrada

O ambiente será iniciado com PostgreSQL, Redis, backend, frontend e PDV. A validação final seguirá uma sequência única para evitar consumo concorrente do mesmo código de recuperação ou token:

1. verificar health e readiness;
2. autenticar no frontend e selecionar o tenant E2E;
3. autenticar o PDV com uma chave de dispositivo válida;
4. consultar o mesmo produto nos dois clientes;
5. simular expiração do access token e comprovar renovação;
6. registrar uma operação offline no diário do PDV;
7. restabelecer conectividade e sincronizar a operação uma única vez;
8. confirmar no backend o tenant, a idempotência e o resultado persistido.

## 6. Fluxos de dados

### 6.1 Frontend administrativo

```text
Browser → GET /api/v1/auth/csrf/
Browser → POST /api/v1/auth/login/ + X-CSRFToken
Backend → 202 requires_mfa
Browser → POST desafio ou recuperação MFA
Backend → sessão autenticada
Browser → requisições com cookie + X-Tenant-ID
```

### 6.2 PDV

```text
PDV → POST /api/v1/devices/validate/ + api_key
Backend → access token + refresh token + device + branch + tenant
PDV → requisições com Bearer + X-Tenant-ID
Backend → 401 quando access token expirar
PDV → POST /api/v1/devices/refresh/ + refresh token
Backend → novos tokens
PDV → repete uma vez a requisição original
```

### 6.3 Operação offline

```text
PDV offline → grava operação + idempotency_key no SQLite
PDV online → envia operação ao endpoint correspondente
Backend → persiste uma única vez
PDV → marca operação como sincronizada
```

## 7. Tratamento de erros

- Falha de rede: manter operação pendente e exibir estado offline.
- `401` com refresh disponível: renovar uma vez.
- `401` após tentativa de refresh: limpar autenticação e retornar ao login.
- `403`: não repetir; exibir ausência de permissão ou tenant inválido.
- `404` em endpoint conhecido: tratar como erro de contrato e falhar o teste.
- `409`: aplicar a resolução de conflito já definida pelo diário do PDV.
- `ERR_DLOPEN_FAILED`: impedir inicialização silenciosa do cache e registrar caminho, runtime e versão ABI sem incluir tokens.
- Falha permanente `400/422`: marcar operação como falha, preservando motivo para suporte.

## 8. Segurança

- Nenhum token, senha ou chave real será gravado em logs ou fixtures.
- As chaves E2E permanecerão exclusivas do ambiente local de testes.
- CORS ficará restrito a origens explícitas.
- Requisições administrativas preservarão CSRF e cookies `credentials: include`.
- Requisições do PDV preservarão `Authorization: Bearer` e `X-Tenant-ID`.
- A renovação não poderá entrar em loop nem repetir operações mutáveis sem chave idempotente.

## 9. Cenários de aceite

### Cenário A — frontend pelo proxy

**Dado** o backend saudável na porta `8000` e o frontend na porta `5174`  
**Quando** o navegador consultar `/api/v1/health/` pelo frontend  
**Então** receberá `200` com banco e cache em estado `ok`.

### Cenário B — origem local permitida

**Dado** uma requisição direta originada de `http://127.0.0.1:5174`  
**Quando** o backend responder  
**Então** incluirá `Access-Control-Allow-Origin` para a origem exata  
**E** incluirá `Access-Control-Allow-Credentials: true`.

### Cenário C — renovação do PDV

**Dado** um PDV autenticado com access token expirado e refresh token válido  
**Quando** uma chamada protegida responder `401`  
**Então** o PDV chamará exatamente `/api/v1/devices/refresh/` uma vez  
**E** repetirá a chamada original com o novo token  
**E** não produzirá requisição para `/api/v1//devices/refresh/`.

### Cenário D — SQLite compatível

**Dado** o PDV iniciado pelo Electron suportado  
**Quando** o cache e o diário abrirem o banco local  
**Então** uma escrita e leitura simples serão concluídas  
**E** nenhum `ERR_DLOPEN_FAILED` será registrado.

### Cenário E — sincronização idempotente

**Dado** uma operação criada offline com chave idempotente  
**Quando** a conectividade retornar  
**Então** a operação será persistida uma única vez no backend  
**E** o diário a marcará como sincronizada  
**E** uma nova execução não duplicará a operação.

## 10. Critérios de conclusão

A correção será considerada concluída somente quando:

- health e readiness retornarem `200`;
- frontend e PDV acessarem a API por seus proxies;
- as quatro origens locais receberem os cabeçalhos CORS esperados;
- o login administrativo alcançar a etapa MFA;
- a chave do dispositivo emitir tokens válidos;
- o refresh do PDV usar uma URL canônica e repetir a requisição original;
- `better-sqlite3` abrir no Electron sem erro nativo;
- catálogo e tenant coincidirem entre frontend, PDV e backend;
- uma operação offline for sincronizada uma única vez;
- testes de backend, frontend, PDV e E2E terminarem sem falhas.

## 11. Riscos e mitigação

| Risco | Mitigação |
|---|---|
| Recompilar SQLite para Node em vez de Electron | Fixar o runtime Electron no comando de rebuild e executar smoke test dentro do Electron |
| Refresh entrar em loop | Marcar a requisição com `_retry` e limitar a uma tentativa |
| Operação mutável ser repetida após refresh | Exigir chave idempotente nos fluxos offline e de venda |
| CORS ficar permissivo demais | Manter lista explícita e teste negativo para origem não cadastrada |
| Testes E2E consumirem o mesmo código MFA | Executar autenticação global uma vez e reutilizar estado isolado |
| Estado antigo do PDV mascarar o resultado | Usar perfil E2E dedicado e validar tokens/tenant antes do cenário |

