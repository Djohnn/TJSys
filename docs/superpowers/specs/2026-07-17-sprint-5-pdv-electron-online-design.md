# Sprint 5 — PDV Electron Online

## 1. Objetivo

Entregar um aplicativo desktop Electron funcional para operação de caixa online, consumindo as APIs da Sprint 4 (vendas, caixa, catálogo), com preparação básica para offline (cache de catálogo e estrutura de sincronização). A Sprint 5 depende do catálogo validado na Sprint 2 e do módulo de vendas da Sprint 4.

## 2. Escopo

### Inclui:

- Setup do projeto Electron + React + TypeScript
- Tela de login com validação de API Key
- Dashboard com status do caixa e ações rápidas
- Abertura e fechamento de sessão de caixa
- Venda balcão online (consumindo API da Sprint 4)
- Cache local de catálogo (produtos e preços) em SQLite
- Registro de dispositivo no backend
- Autenticação JWT após validação de API Key
- Build multi-plataforma (Windows, Linux, macOS)
- Testes E2E (Playwright), unitários (Vitest) e integração (MSW)

### Não inclui:

- Operações offline completas (Sprint 6)
- Sincronização bidirecional robusta (Sprint 6)
- Journal SQLite append-only completo (Sprint 6)
- Integração fiscal (Sprint 7)
- Integração com maquineta de cartão
- Gestão de dispositivos via painel web (backend da Sprint 5)
- UI/UX avançada ou customização visual

## 3. Arquitetura

### 3.1 Visão Geral

```
┌─────────────────────────────────────────────────────────────┐
│                    PDV Electron App                         │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  Renderer Process (React + TypeScript)              │   │
│  │  - Tela de Login                                    │   │
│  │  - Dashboard (abrir caixa, ver status)              │   │
│  │  - Tela de Venda (busca produto, carrinho, pagto)   │   │
│  │  - Tela de Caixa (movimentos, fechar caixa)         │   │
│  └─────────────────────────────────────────────────────┘   │
│                            ↕ IPC                            │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  Main Process (Node.js + Electron)                  │   │
│  │  - Auth Service (gerencia tokens)                   │   │
│  │  - API Client (consome /api/v1)                     │   │
│  │  - Catalog Cache (SQLite local)                     │   │
│  │  - Device Registry (registra dispositivo)           │   │
│  └─────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
                            ↕ HTTPS
┌─────────────────────────────────────────────────────────────┐
│                    Backend Django/DRF                       │
│  - /api/v1/devices/ (registro e validação)                 │
│  - /api/v1/auth/ (login, refresh)                          │
│  - /api/v1/cash-sessions/ (abrir, fechar, consultar)       │
│  - /api/v1/sales/ (criar venda)                            │
│  - /api/v1/catalog/ (produtos, preços)                     │
└─────────────────────────────────────────────────────────────┘
```

### 3.2 Processos Electron

**Main Process (Node.js):**
- Gerencia janela principal
- Autenticação e gerenciamento de tokens
- API Client para backend
- Cache de catálogo em SQLite
- Registro de dispositivo
- IPC handlers para comunicação com renderer

**Renderer Process (React):**
- Interface do usuário
- Consumo de APIs via IPC (não direto)
- Estado local com React hooks/context

### 3.3 Fluxo de Dados

```
Renderer                    Main Process                Backend
    │                            │                          │
    │  IPC: validateApiKey(key)  │                          │
    ├───────────────────────────>│                          │
    │                            │  POST /api/v1/devices/   │
    │                            │  validate                │
    │                            ├─────────────────────────>│
    │                            │  { token, device_id }    │
    │                            │<─────────────────────────│
    │  { token, device_id }      │                          │
    │<───────────────────────────┤                          │
    │                            │                          │
    │  IPC: openCashSession(amt) │                          │
    ├───────────────────────────>│                          │
    │                            │  POST /api/v1/cash-      │
    │                            │  sessions/open/          │
    │                            ├─────────────────────────>│
    │                            │  { session }             │
    │                            │<─────────────────────────│
    │  { session }               │                          │
    │<───────────────────────────┤                          │
```

## 4. Modelo de Domínio (PDV Local)

### 4.1 DeviceConfig

```typescript
interface DeviceConfig {
  id: string;
  name: string;
  branchId: string;
  apiKey: string; // encrypted
  token: string | null;
  tokenExpiresAt: Date | null;
}
```

### 4.2 CatalogCache

```typescript
interface CachedProduct {
  id: string;
  sku: string;
  name: string;
  baseUnitId: string;
  requiresLot: boolean;
  requiresExpiry: boolean;
  price: Decimal;
  priceUpdatedAt: Date;
}
```

### 4.3 CashSessionState (local)

```typescript
interface CashSessionState {
  sessionId: string | null;
  status: 'closed' | 'open';
  openingAmount: Decimal;
  expectedAmount: Decimal;
  salesCount: number;
  totalSales: Decimal;
}
```

## 5. APIs Backend Necessárias

### 5.1 Nova: Device Management (backend da Sprint 5)

```
POST /api/v1/devices/register
  Request: { name, branch_id }
  Response: { id, api_key }
  
POST /api/v1/devices/validate
  Request: { api_key }
  Response: { token, refresh_token, device_id, branch_id }
  
POST /api/v1/devices/refresh
  Request: { refresh_token }
  Response: { token, refresh_token }
```

### 5.2 Existente: Cash Sessions (Sprint 4)

```
POST /api/v1/cash-sessions/open/
  Request: { branch, opening_amount }
  Response: { id, status, opening_amount, ... }
  
GET /api/v1/cash-sessions/current/?branch=<id>
  Response: { id, status, ... }
  
POST /api/v1/cash-sessions/<id>/close/
  Request: { closing_amount }
  Response: { id, status, closing_amount, ... }
```

### 5.3 Existente: Sales (Sprint 4)

```
POST /api/v1/sales/counter/
  Request: { branch, stock_location, items[], payments[] }
  Response: { id, net_total, status, ... }
```

### 5.4 Existente: Catalog (Sprint 2)

```
GET /api/v1/products/
  Response: [{ id, sku, name, base_unit, ... }]
  
GET /api/v1/products/<id>/prices/
  Response: [{ id, amount, valid_from, valid_to }]
```

## 6. Fluxos Principais

### 6.1 Abertura do App

```
1. Usuário abre o app
2. Verifica se há token válido armazenado
   - Se sim: vai para Dashboard
   - Se não: mostra tela de login
3. Tela de Login:
   - Input: API Key
   - Valida no backend (/api/v1/devices/validate)
   - Recebe token JWT + dados do dispositivo
   - Salva token e config localmente
   - Navega para Dashboard
```

### 6.2 Abertura de Caixa

```
1. Usuário clica "Abrir Caixa" no Dashboard
2. Modal: "Valor de Abertura"
   - Input numérico (decimal)
3. POST /api/v1/cash-sessions/open/
   - Headers: Authorization: Bearer <token>
   - Body: { branch, opening_amount }
4. Sucesso: atualiza estado local, mostra caixa aberto
5. Erro: mostra mensagem (sem caixa, erro de rede, etc)
```

### 6.3 Venda Balcão

```
1. Usuário clica "Nova Venda"
2. Tela de Venda:
   a. Busca de produto (input com autocomplete)
      - Busca primeiro no cache local
      - Se não encontrado, busca no backend
   b. Adiciona ao carrinho
      - Mostra: produto, qtd, preço unitário, total
   c. Seleciona método de pagamento
      - Dinheiro, PIX, Cartão (externo/integrado)
   d. Confirma venda
3. POST /api/v1/sales/counter/
   - Headers: Authorization: Bearer <token>
   - Body: { branch, stock_location, items[], payments[] }
4. Sucesso: mostra recibo, atualiza carrinho vazio
5. Erro: mostra mensagem (sem estoque, pagamento inválido, etc)
```

### 6.4 Fechamento de Caixa

```
1. Usuário clica "Fechar Caixa"
2. Modal: "Valor Declarado"
   - Input numérico (decimal)
   - Mostra: esperado vs declarado
3. POST /api/v1/cash-sessions/<id>/close/
   - Headers: Authorization: Bearer <token>
   - Body: { closing_amount }
4. Sucesso: mostra resumo (diferença), volta para Dashboard
5. Erro: mostra mensagem
```

## 7. Segurança

### 7.1 Autenticação

- **API Key:** Gerada pelo painel web, informada no primeiro login
- **Validação:** POST /api/v1/devices/validate retorna JWT
- **Storage:** Token armazenado com Electron safeStorage (criptografia nativa)
- **Refresh:** Antes de cada request, verifica se token está expirado
  - Se expirado: chama /api/v1/devices/refresh
  - Se refresh falhar: força logout

### 7.2 Comunicação

- **HTTPS:** Todas as requests ao backend
- **Headers:**
  - `Authorization: Bearer <token>`
  - `X-Device-ID: <device_id>`
  - `X-Correlation-ID: <uuid>` (para tracing)

### 7.3 Dados Locais

- **API Key:** Criptografada com safeStorage
- **JWT:** Criptografado com safeStorage
- **Cache de catálogo:** SQLite sem criptografia (dados públicos)
- **Sem dados sensíveis:** CPF, cartão, etc não são armazenados localmente

## 8. Cache de Catálogo (Preparação Offline)

### 8.1 Estrutura SQLite

```sql
CREATE TABLE products (
  id TEXT PRIMARY KEY,
  sku TEXT NOT NULL,
  name TEXT NOT NULL,
  base_unit_id TEXT NOT NULL,
  requires_lot INTEGER NOT NULL,
  requires_expiry INTEGER NOT NULL,
  is_active INTEGER NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE prices (
  id TEXT PRIMARY KEY,
  product_id TEXT NOT NULL,
  amount TEXT NOT NULL,
  valid_from TEXT NOT NULL,
  valid_to TEXT,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (product_id) REFERENCES products(id)
);

CREATE INDEX idx_products_sku ON products(sku);
CREATE INDEX idx_prices_product ON prices(product_id);
```

### 8.2 Sincronização

- **Frequência:** A cada 5 minutos (configurável)
- **Trigger:** Manual (botão "Atualizar Catálogo")
- **Lógica:**
  1. GET /api/v1/products/?updated_after=<last_sync>
  2. Para cada produto atualizado:
     - GET /api/v1/products/<id>/prices/
     - Atualiza SQLite
  3. Salva timestamp do último sync

### 8.3 Busca

```
1. Usuário digita query (SKU ou nome)
2. Busca no cache local:
   SELECT * FROM products WHERE sku LIKE ? OR name LIKE ?
3. Se encontrado: retorna do cache
4. Se não encontrado: busca no backend e atualiza cache
5. Retorna resultado
```

## 9. Estrutura do Projeto

```
pdv/
├── package.json
├── tsconfig.json
├── electron-builder.yml
├── vitest.config.ts
├── playwright.config.ts
├── src/
│   ├── main/
│   │   ├── index.ts              # Entry point Electron
│   │   ├── ipc-handlers.ts       # Handlers IPC
│   │   ├── services/
│   │   │   ├── auth.service.ts   # Gerencia tokens
│   │   │   ├── api.client.ts     # HTTP client
│   │   │   ├── catalog.cache.ts  # SQLite cache
│   │   │   └── device.registry.ts
│   │   └── utils/
│   │       ├── logger.ts
│   │       └── storage.ts        # safeStorage wrapper
│   ├── renderer/
│   │   ├── index.html
│   │   ├── main.tsx              # Entry point React
│   │   ├── App.tsx
│   │   ├── pages/
│   │   │   ├── Login.tsx
│   │   │   ├── Dashboard.tsx
│   │   │   ├── Sale.tsx
│   │   │   └── CashSession.tsx
│   │   ├── components/
│   │   │   ├── ProductSearch.tsx
│   │   │   ├── Cart.tsx
│   │   │   ├── PaymentForm.tsx
│   │   │   └── Receipt.tsx
│   │   ├── hooks/
│   │   │   ├── useAuth.ts
│   │   │   ├── useCashSession.ts
│   │   │   └── useCatalog.ts
│   │   └── contexts/
│   │       ├── AuthContext.tsx
│   │       └── CashSessionContext.tsx
│   └── shared/
│       ├── types.ts              # Tipos compartilhados
│       └── constants.ts
├── tests/
│   ├── unit/
│   │   ├── auth.service.test.ts
│   │   └── catalog.cache.test.ts
│   ├── integration/
│   │   └── api.client.test.ts
│   └── e2e/
│       ├── login.spec.ts
│       ├── cash-session.spec.ts
│       └── sale.spec.ts
└── README.md
```

## 10. Testes

### 10.1 Unitários (Vitest)

- **auth.service.test.ts:**
  - Valida API key e armazena token
  - Refresh token quando expirado
  - Logout limpa dados locais

- **catalog.cache.test.ts:**
  - Busca produto por SKU
  - Busca produto por nome
  - Atualiza cache de produtos
  - Atualiza cache de preços

### 10.2 Integração (Vitest + MSW)

- **api.client.test.ts:**
  - POST /devices/validate com sucesso
  - POST /devices/validate com erro (key inválida)
  - POST /cash-sessions/open/ com sucesso
  - POST /sales/counter/ com sucesso
  - Tratamento de erros de rede

### 10.3 E2E (Playwright)

- **login.spec.ts:**
  - Login com API key válida
  - Login com API key inválida
  - Persistência de sessão (refresh da página)

- **cash-session.spec.ts:**
  - Abrir caixa com valor inicial
  - Fechar caixa com valor declarado
  - Mostrar diferença (esperado vs declarado)

- **sale.spec.ts:**
  - Buscar produto por SKU
  - Adicionar produto ao carrinho
  - Selecionar pagamento
  - Confirmar venda
  - Ver recibo

## 11. Build e Distribuição

### 11.1 Configuração electron-builder

```yaml
appId: com.tjsys.pdv
productName: TJSys PDV
directories:
  output: dist
files:
  - src/**/*
  - package.json
win:
  target: nsis
  icon: build/icon.ico
mac:
  target: dmg
  icon: build/icon.icns
linux:
  target: AppImage
  icon: build/icon.png
nsis:
  oneClick: false
  allowToChangeInstallationDirectory: true
```

### 11.2 Scripts package.json

```json
{
  "scripts": {
    "dev": "electron-vite dev",
    "build": "electron-vite build",
    "test": "vitest run",
    "test:e2e": "playwright test",
    "build:win": "electron-builder --win",
    "build:mac": "electron-builder --mac",
    "build:linux": "electron-builder --linux",
    "build:all": "electron-builder -mwl"
  }
}
```

### 11.3 Artefatos

- **Windows:** `pdv/dist/TJSys PDV Setup.exe`
- **macOS:** `pdv/dist/TJSys PDV.dmg`
- **Linux:** `pdv/dist/TJSys PDV.AppImage`

## 12. Qualidade e Segurança

- **TypeScript:** Strict mode habilitado
- **ESLint:** Configuração recomendada para React + TypeScript
- **Prettier:** Formatação automática
- **Dependências:** Auditoria de vulnerabilidades (`npm audit`)
- **Secrets:** Nenhum segredo hardcoded (API key é runtime)
- **Logs:** Sem dados sensíveis (CPF, cartão, etc)

## 13. Critérios de Aceite

- [ ] App Electron inicia e mostra tela de login
- [ ] Login com API key válida autentica e redireciona para Dashboard
- [ ] Dashboard mostra status do caixa (aberto/fechado)
- [ ] Abertura de caixa cria sessão no backend
- [ ] Venda balcão consome API da Sprint 4 e atualiza estoque
- [ ] Fechamento de caixa encerra sessão no backend
- [ ] Cache de catálogo funciona (busca local + sync periódico)
- [ ] Token JWT é renovado automaticamente quando expira
- [ ] Testes E2E passam (login, caixa, venda)
- [ ] Testes unitários passam (auth, cache)
- [ ] Testes de integração passam (API client)
- [ ] Build gera instaladores para Windows, Linux, macOS
- [ ] Ruff e mypy do backend continuam passando
- [ ] Migrations do backend (devices) aplicam sem erro
- [ ] CI remota termina sem falhas

## 14. Dependências

### 14.1 Backend (Sprint 5)

- [ ] Endpoint `/api/v1/devices/register` (admin cadastra dispositivo)
- [ ] Endpoint `/api/v1/devices/validate` (PDV valida API key)
- [ ] Endpoint `/api/v1/devices/refresh` (renova token)
- [ ] Modelo `Device` no backend (branch, name, api_key_hash, is_active)
- [ ] Capabilities: `devices.register`, `devices.revoke`

### 14.2 Frontend (PDV)

- [ ] electron + electron-vite
- [ ] React + TypeScript
- [ ] better-sqlite3 (cache local)
- [ ] axios (HTTP client)
- [ ] vitest + @testing-library/react
- [ ] @playwright/test
- [ ] electron-builder

## 15. Riscos e Mitigações

| Risco | Impacto | Mitigação |
|-------|---------|-----------|
| Token JWT expira durante venda | Venda falha | Refresh automático antes de cada request |
| Cache desatualizado | Preço incorreto | Sync periódico + botão manual |
| API key vazada | Acesso não autorizado | Revogação via painel, credenciais curtas |
| Build falha em CI | Sem instaladores | Pipeline separado, retry automático |
| Electron vulnerável | Segurança | Atualização regular, auditoria de deps |

## 16. Fora do Escopo (Sprint 6+)

- Operações offline completas
- Journal SQLite append-only
- Sincronização bidirecional robusta
- Fila de operações pendentes
- Resolução de conflitos
- Integração fiscal
- Integração com maquineta
- Gestão avançada de dispositivos
- UI/UX customizada

## 17. Histórico

| Versão | Data | Alteração |
|--------|------|-----------|
| 0.1.0 | 2026-07-17 | Design inicial da Sprint 5 |
