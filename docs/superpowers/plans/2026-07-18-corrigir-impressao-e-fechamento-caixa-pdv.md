# Corrigir Impressão e Fechamento de Caixa do PDV Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** fazer o botão `Imprimir Cupom` executar impressão real no app Electron com feedback visível, e fazer o fechamento de caixa funcionar de ponta a ponta com erro claro quando a API recusar.

**Architecture:** manter o navegador web com fallback seguro (`window.print()`), mas usar IPC nativo quando o PDV estiver rodando no Electron. Corrigir o fluxo de caixa no frontend enviando `Idempotency-Key` em abertura/fechamento e mostrando erros dentro do modal de fechamento.

**Tech Stack:** Django/DRF no backend, React/Vite no renderer do PDV, Electron IPC no main/preload, Vitest para testes frontend/main, Pytest para API.

---

## Contexto do problema

O usuário está testando o PDV local e reportou:

- “o botão impressão não faz nada”
- “não consigo fechar o caixa”
- “o botão fechar não chama nenhum evento”

Pontos já observados no código:

- `pdv/src/renderer/pages/Sale.tsx` tinha `handlePrintReceipt` usando apenas `window.print()`. Isso não garante spooler real quando testado fora do Electron.
- O Electron precisa expor `printReceipt` pelo preload e tratar isso no main process com `webContents.print({ silent: false })`.
- `pdv/src/renderer/contexts/CashSessionContext.tsx` envia POST para abrir/fechar caixa sem `Idempotency-Key`.
- O backend exige `Idempotency-Key` em `CashSessionViewSet.open` e `CashSessionViewSet.close`.
- O erro de fechamento é salvo em estado `error`, mas a UI do modal de fechamento não renderiza esse erro dentro do modal. Para o operador parece que o botão não fez nada.
- `pdv/src/renderer/pages/CashSession.tsx` usa `CardHeader` e `CardContent`; confirmar que ambos estão importados.
- `pdv/package.json` precisa apontar `"main"` para `dist/main/index.js`.
- `pdv/src/main/index.ts` precisa apontar o preload para `../preload/index.js`, que é o arquivo gerado pelo build.

## Arquivos envolvidos

- Modify: `pdv/src/renderer/pages/Sale.tsx`
- Modify: `pdv/src/renderer/__tests__/pages/Sale.test.tsx`
- Create/Modify: `pdv/src/main/ipc/printing.ts`
- Create/Modify: `pdv/src/main/__tests__/printing.test.ts`
- Modify: `pdv/src/main/index.ts`
- Modify: `pdv/src/preload/index.ts`
- Modify: `pdv/package.json`
- Modify: `pdv/src/renderer/contexts/CashSessionContext.tsx`
- Modify: `pdv/src/renderer/__tests__/contexts/CashSessionContext.test.tsx`
- Modify: `pdv/src/renderer/pages/CashSession.tsx`
- Create/Modify: `pdv/src/renderer/__tests__/pages/CashSession.test.tsx`
- Optional verification only: `backend/sales/views.py`
- Optional verification only: `backend/tests/test_sales_api.py`

---

### Task 1: Corrigir impressão real via Electron IPC

**Files:**

- Modify: `pdv/src/renderer/pages/Sale.tsx`
- Modify: `pdv/src/renderer/__tests__/pages/Sale.test.tsx`
- Create/Modify: `pdv/src/main/ipc/printing.ts`
- Create/Modify: `pdv/src/main/__tests__/printing.test.ts`
- Modify: `pdv/src/main/index.ts`
- Modify: `pdv/src/preload/index.ts`
- Modify: `pdv/package.json`

- [ ] **Step 1: Escrever/ajustar teste do botão de impressão no renderer**

No arquivo `pdv/src/renderer/__tests__/pages/Sale.test.tsx`, garantir que o teste do cupom cobre Electron IPC:

```ts
it('shows printable receipt with product name and normalized quantity', async () => {
  const browserPrint = vi.spyOn(window, 'print').mockImplementation(() => undefined);
  const printReceipt = vi.fn().mockResolvedValue({
    success: true,
    savedPath: 'C:\\ERP\\cupom_nao_fiscal_sale-1.pdf',
  });
  (window as any).electronAPI = { printReceipt };

  vi.spyOn(globalThis, 'fetch')
    .mockResolvedValueOnce(
      new Response(JSON.stringify({
        results: [{
          id: 'product-1',
          sku: 'PDV-001',
          name: 'Produto PDV',
          base_unit: 'unit-1',
          price: '49.90',
        }],
      }), { status: 200 }),
    )
    .mockResolvedValueOnce(
      new Response(JSON.stringify({
        id: 'sale-1',
        created_at: '2026-07-18T13:52:03-03:00',
        net_total: '49.90',
        items: [{
          id: 'item-1',
          product: 'product-1',
          quantity: '1.000000',
          line_total: '49.90',
        }],
      }), { status: 201 }),
    );

  render(
    <MemoryRouter>
      <Sale />
    </MemoryRouter>,
  );

  fireEvent.change(screen.getByPlaceholderText('Buscar produto (SKU ou nome)...'), {
    target: { value: 'Produto PDV' },
  });
  fireEvent.click(await screen.findByText('Produto PDV'));
  fireEvent.change(screen.getByPlaceholderText('0,00'), {
    target: { value: '49.90' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Adicionar Pagamento' }));
  fireEvent.click(screen.getByRole('button', { name: 'Confirmar Venda' }));

  expect(await screen.findByRole('heading', { name: 'Venda Realizada' })).toBeInTheDocument();
  expect(screen.getByText('Produto PDV')).toBeInTheDocument();
  expect(screen.getByText('x1.0')).toBeInTheDocument();

  fireEvent.click(screen.getByRole('button', { name: 'Imprimir Cupom' }));

  await waitFor(() => {
    expect(printReceipt).toHaveBeenCalledWith(
      expect.objectContaining({
        fileName: 'cupom_nao_fiscal_sale-1',
        html: expect.stringContaining('Produto PDV'),
      }),
    );
  });
  expect(await screen.findByText(/Cupom enviado para impressão e salvo em:/)).toBeInTheDocument();
  expect(browserPrint).not.toHaveBeenCalled();
});
```

- [ ] **Step 2: Rodar teste vermelho**

Run:

```powershell
npm.cmd test -- src/renderer/__tests__/pages/Sale.test.tsx
```

Expected before fix: FAIL porque `electronAPI.printReceipt` não é chamado.

- [ ] **Step 3: Implementar geração de HTML e chamada IPC em `Sale.tsx`**

Em `pdv/src/renderer/pages/Sale.tsx`, implementar:

```ts
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
```

Dentro do componente `Sale`, adicionar estado:

```ts
const [printMessage, setPrintMessage] = useState('');
```

Ao criar nova venda, limpar mensagem:

```ts
setReceipt({ ...sale, items: receiptItems || sale.items });
setPrintMessage('');
```

Implementar:

```ts
const buildReceiptHtml = (saleReceipt: any): string => {
  const saleNumber = String(saleReceipt.id).slice(0, 8);
  const itemsHtml = (saleReceipt.items || []).map((item: any) => `
    <div class="item-row">
      <div>
        <div>${escapeHtml(item.product?.name || 'Produto')}</div>
        <div class="muted">x${formatReceiptQuantity(item.quantity)}</div>
      </div>
      <strong>R$ ${Number(item.line_total).toFixed(2)}</strong>
    </div>
  `).join('');

  return `<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8">
  <title>TJSys PDV - Cupom Não Fiscal #${escapeHtml(saleNumber)}</title>
  <style>
    body { margin: 0; padding: 16px; font-family: Arial, sans-serif; color: #212121; }
    .receipt { width: 80mm; max-width: 100%; margin: 0 auto; }
    h1 { margin: 0 0 4px; text-align: center; font-size: 18px; }
    .subtitle { margin: 0 0 16px; text-align: center; color: #616161; font-size: 12px; }
    .line, .item-row { display: flex; justify-content: space-between; gap: 12px; margin: 6px 0; }
    .items { border-top: 1px dashed #9e9e9e; border-bottom: 1px dashed #9e9e9e; padding: 12px 0; margin: 12px 0; }
    .muted { color: #757575; font-size: 12px; margin-top: 2px; }
    .total { font-weight: 700; font-size: 16px; }
    .thanks { text-align: center; margin-top: 16px; color: #616161; font-size: 12px; }
    @media print { body { padding: 0; } }
  </style>
</head>
<body>
  <main class="receipt">
    <h1>TJSys PDV</h1>
    <p class="subtitle">Cupom Não Fiscal</p>
    <div class="line"><span>Venda</span><strong>#${escapeHtml(saleNumber)}</strong></div>
    <div class="line"><span>Data</span><span>${escapeHtml(new Date(saleReceipt.created_at).toLocaleString('pt-BR'))}</span></div>
    <section class="items">${itemsHtml}</section>
    <div class="line total"><span>Total</span><span>R$ ${Number(saleReceipt.net_total).toFixed(2)}</span></div>
    <p class="thanks">Obrigado pela preferência!</p>
  </main>
</body>
</html>`;
};

const handlePrintReceipt = async () => {
  if (!receipt) return;
  setPrintMessage('');
  const html = buildReceiptHtml(receipt);
  const fileName = `cupom_nao_fiscal_${String(receipt.id).slice(0, 8)}`;
  const electronPrint = (window as any).electronAPI?.printReceipt;
  if (electronPrint) {
    const result = await electronPrint({ html, fileName });
    if (result?.success) {
      setPrintMessage(`Cupom enviado para impressão e salvo em: ${result.savedPath}`);
    } else {
      setPrintMessage(`Cupom salvo, mas a impressão não foi concluída: ${result?.error || 'erro desconhecido'}`);
    }
    return;
  }
  window.print();
};
```

Abaixo do botão `Imprimir Cupom`, renderizar:

```tsx
{printMessage && (
  <p style={{ margin: '12px 0 0', color: '#2e7d32', fontSize: '0.75rem', textAlign: 'center' }}>
    {printMessage}
  </p>
)}
```

- [ ] **Step 4: Expor IPC no preload**

Em `pdv/src/preload/index.ts`, dentro de `electronAPI`, adicionar:

```ts
printReceipt: (data: { html: string; fileName: string }) =>
  ipcRenderer.invoke('printing:receipt', data),
```

- [ ] **Step 5: Criar handler nativo de impressão**

Criar `pdv/src/main/ipc/printing.ts`:

```ts
import { BrowserWindow, ipcMain } from 'electron';
import { writeFile } from 'fs/promises';
import { join } from 'path';
import { logger } from '../utils/logger';

type PrintReceiptPayload = {
  html: string;
  fileName: string;
};

function sanitizeFileName(fileName: string): string {
  return fileName.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 80) || 'cupom_nao_fiscal';
}

function projectRoot(): string {
  if (process.cwd().endsWith('pdv')) {
    return join(process.cwd(), '..');
  }
  return process.cwd();
}

export function setupPrintingHandlers() {
  ipcMain.handle('printing:receipt', async (_event, payload: PrintReceiptPayload) => {
    const safeFileName = sanitizeFileName(payload.fileName);
    const htmlPath = join(projectRoot(), `${safeFileName}.html`);
    const pdfPath = join(projectRoot(), `${safeFileName}.pdf`);
    let printWindow: BrowserWindow | null = null;

    try {
      await writeFile(htmlPath, payload.html, 'utf-8');

      printWindow = new BrowserWindow({
        show: false,
        webPreferences: {
          sandbox: true,
          nodeIntegration: false,
          contextIsolation: true,
        },
      });

      await printWindow.loadURL(
        `data:text/html;charset=utf-8,${encodeURIComponent(payload.html)}`,
      );

      const pdf = await printWindow.webContents.printToPDF({
        printBackground: true,
        pageSize: { width: 80000, height: 200000 },
        margins: { marginType: 'none' },
      });
      await writeFile(pdfPath, pdf);

      await new Promise<void>((resolve, reject) => {
        printWindow?.webContents.print(
          { silent: false, printBackground: true },
          (success, failureReason) => {
            if (success) {
              resolve();
              return;
            }
            reject(new Error(failureReason || 'Falha ao abrir impressão do cupom.'));
          },
        );
      });

      return { success: true, savedPath: pdfPath, htmlPath };
    } catch (error) {
      logger.error('Failed to print receipt:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Falha ao imprimir cupom.',
        savedPath: pdfPath,
        htmlPath,
      };
    } finally {
      printWindow?.close();
    }
  });
}
```

- [ ] **Step 6: Registrar handler no main process**

Em `pdv/src/main/index.ts`, importar:

```ts
import { setupPrintingHandlers } from './ipc/printing';
```

Dentro de `app.whenReady().then(...)`, após os outros handlers:

```ts
setupPrintingHandlers();
```

Garantir que o preload usa arquivo existente:

```ts
preload: join(__dirname, '../preload/index.js'),
```

- [ ] **Step 7: Corrigir `main` do package**

Em `pdv/package.json`, garantir:

```json
"main": "dist/main/index.js"
```

- [ ] **Step 8: Testar handler nativo**

Criar/ajustar `pdv/src/main/__tests__/printing.test.ts` com teste:

```ts
// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  printMock: vi.fn((_options, callback) => callback(true)),
  printToPDFMock: vi.fn().mockResolvedValue(Buffer.from('pdf')),
  loadURLMock: vi.fn().mockResolvedValue(undefined),
  closeMock: vi.fn(),
  writeFileMock: vi.fn().mockResolvedValue(undefined),
  handleMock: vi.fn(),
}));

vi.mock('electron', () => ({
  BrowserWindow: vi.fn().mockImplementation(function () {
    return {
      loadURL: mocks.loadURLMock,
      close: mocks.closeMock,
      webContents: {
        print: mocks.printMock,
        printToPDF: mocks.printToPDFMock,
      },
    };
  }),
  ipcMain: { handle: mocks.handleMock },
}));

vi.mock('fs/promises', () => ({
  writeFile: mocks.writeFileMock,
}));

vi.mock('../utils/logger', () => ({
  logger: { error: vi.fn() },
}));

import { setupPrintingHandlers } from '../ipc/printing';

describe('printing IPC', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.printMock.mockImplementation((_options, callback) => callback(true));
    mocks.printToPDFMock.mockResolvedValue(Buffer.from('pdf'));
    mocks.loadURLMock.mockResolvedValue(undefined);
    mocks.writeFileMock.mockResolvedValue(undefined);
    vi.spyOn(process, 'cwd').mockReturnValue('C:\\ERP\\pdv');
  });

  it('saves receipt files and opens native print dialog', async () => {
    setupPrintingHandlers();
    const handler = mocks.handleMock.mock.calls.find(([channel]) => channel === 'printing:receipt')?.[1];

    const result = await handler({}, {
      fileName: 'cupom_nao_fiscal_sale-1',
      html: '<html><body>Produto PDV</body></html>',
    });

    expect(mocks.writeFileMock).toHaveBeenCalledWith(
      'C:\\ERP\\cupom_nao_fiscal_sale-1.html',
      '<html><body>Produto PDV</body></html>',
      'utf-8',
    );
    expect(mocks.printToPDFMock).toHaveBeenCalledOnce();
    expect(mocks.writeFileMock).toHaveBeenCalledWith(
      'C:\\ERP\\cupom_nao_fiscal_sale-1.pdf',
      Buffer.from('pdf'),
    );
    expect(mocks.printMock).toHaveBeenCalledWith(
      expect.objectContaining({ silent: false, printBackground: true }),
      expect.any(Function),
    );
    expect(mocks.closeMock).toHaveBeenCalledOnce();
    expect(result).toEqual(expect.objectContaining({
      success: true,
      savedPath: 'C:\\ERP\\cupom_nao_fiscal_sale-1.pdf',
    }));
  });
});
```

- [ ] **Step 9: Rodar testes da impressão**

Run:

```powershell
npm.cmd test -- src/main/__tests__/printing.test.ts src/renderer/__tests__/pages/Sale.test.tsx
```

Expected: PASS.

---

### Task 2: Corrigir fechamento e abertura de caixa com Idempotency-Key e feedback de erro

**Files:**

- Modify: `pdv/src/renderer/contexts/CashSessionContext.tsx`
- Modify: `pdv/src/renderer/__tests__/contexts/CashSessionContext.test.tsx`
- Modify: `pdv/src/renderer/pages/CashSession.tsx`
- Create/Modify: `pdv/src/renderer/__tests__/pages/CashSession.test.tsx`

- [ ] **Step 1: Escrever teste para `Idempotency-Key` em abertura e fechamento**

Em `pdv/src/renderer/__tests__/contexts/CashSessionContext.test.tsx`, adicionar testes cobrindo headers.

Exemplo de teste para fechamento:

```ts
it('sends Idempotency-Key when closing cash session', async () => {
  localStorage.setItem('cash_session', JSON.stringify({
    sessionId: 'cash-1',
    status: 'open',
    openingAmount: '100.00',
    expectedAmount: '149.90',
    salesCount: 1,
    totalSales: '49.90',
  }));
  localStorage.setItem('access_token', 'token-1');
  localStorage.setItem('tenant_id', 'tenant-1');

  vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
    new Response(JSON.stringify({ status: 'closed' }), { status: 200 }),
  );

  render(
    <CashSessionProvider>
      <TestComponent />
    </CashSessionProvider>,
  );

  fireEvent.click(screen.getByText('close'));

  await waitFor(() => {
    expect(globalThis.fetch).toHaveBeenCalledWith(
      '/api/v1/cash-sessions/cash-1/close/',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          'Idempotency-Key': expect.any(String),
          Authorization: 'Bearer token-1',
          'X-Tenant-ID': 'tenant-1',
        }),
      }),
    );
  });
});
```

Se o arquivo não tiver `TestComponent` com botão `close`, criar um helper local no teste:

```tsx
function TestComponent() {
  const { closeSession } = useCashSession();
  return <button onClick={() => closeSession('149.90')}>close</button>;
}
```

- [ ] **Step 2: Rodar teste vermelho**

Run:

```powershell
npm.cmd test -- src/renderer/__tests__/contexts/CashSessionContext.test.tsx
```

Expected before fix: FAIL porque `Idempotency-Key` não existe no header.

- [ ] **Step 3: Implementar geração de header idempotente**

Em `pdv/src/renderer/contexts/CashSessionContext.tsx`, criar helper:

```ts
function withIdempotency(headers: Record<string, string>): Record<string, string> {
  return { ...headers, 'Idempotency-Key': crypto.randomUUID() };
}
```

Na abertura:

```ts
headers: withIdempotency(authHeaders()),
```

No fechamento:

```ts
headers: withIdempotency(authHeaders()),
```

- [ ] **Step 4: Renderizar erro dentro do modal de fechamento**

Em `pdv/src/renderer/pages/CashSession.tsx`, dentro do modal `showCloseModal`, abaixo do input de fechamento e antes dos botões:

```tsx
{error && (
  <div style={{ color: '#c62828', marginBottom: '12px', fontSize: '0.875rem' }}>
    {error}
  </div>
)}
```

No clique para abrir modal, limpar erro antigo:

```tsx
<Button
  variant="secondary"
  onClick={() => {
    setError('');
    setShowCloseModal(true);
  }}
  style={{ flex: 1 }}
>
  Fechar Caixa
</Button>
```

- [ ] **Step 5: Garantir import de cards na tela de caixa**

Em `pdv/src/renderer/pages/CashSession.tsx`, garantir:

```ts
import { Card, CardHeader, CardContent, Button, InputGroup, Spinner } from '../components/ui';
```

- [ ] **Step 6: Criar teste de render da página de caixa**

Criar/ajustar `pdv/src/renderer/__tests__/pages/CashSession.test.tsx`:

```tsx
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { CashSession } from '../../pages/CashSession';

vi.mock('../../contexts/AuthContext', () => ({
  useAuth: () => ({ isAuthenticated: true }),
}));

vi.mock('../../contexts/CashSessionContext', () => ({
  useCashSession: () => ({
    session: {
      sessionId: 'cash-1',
      status: 'open',
      openingAmount: '100.00',
      expectedAmount: '149.90',
      salesCount: 1,
      totalSales: '49.90',
    },
    openSession: vi.fn(),
    closeSession: vi.fn(),
    refreshSession: vi.fn(),
  }),
}));

describe('CashSession', () => {
  it('renders open cash session summary without crashing', () => {
    render(
      <MemoryRouter>
        <CashSession />
      </MemoryRouter>,
    );

    expect(screen.getByRole('heading', { name: 'Gestão de Caixa' })).toBeInTheDocument();
    expect(screen.getByText('Aberto')).toBeInTheDocument();
    expect(screen.getByText('49.90')).toBeInTheDocument();
  });
});
```

- [ ] **Step 7: Rodar testes de caixa**

Run:

```powershell
npm.cmd test -- src/renderer/__tests__/contexts/CashSessionContext.test.tsx src/renderer/__tests__/pages/CashSession.test.tsx
```

Expected: PASS.

---

### Task 3: Verificar backend e CSRF/API do PDV

**Files:**

- Verify: `backend/tenancy/views.py`
- Verify: `backend/config/settings/base.py`
- Test: `backend/tests/test_device_auth_api.py`

- [ ] **Step 1: Confirmar login do dispositivo não exige CSRF**

Em `backend/tenancy/views.py`, `DeviceValidateView` deve ter:

```py
class DeviceValidateView(APIView):
    permission_classes = [AllowAny]
    authentication_classes = []
```

- [ ] **Step 2: Confirmar origens locais em CSRF**

Em `backend/config/settings/base.py`, deve existir:

```py
CSRF_TRUSTED_ORIGINS = [
    origin.strip()
    for origin in config(
        'CSRF_TRUSTED_ORIGINS',
        default='http://localhost:5173,http://127.0.0.1:5173',
    ).split(',')
    if origin.strip()
]
```

- [ ] **Step 3: Rodar testes de autenticação de dispositivo**

Run:

```powershell
C:\ERP\.venv\Scripts\python.exe -m pytest backend\tests\test_device_auth_api.py --cov-fail-under=0
```

Expected: PASS.

- [ ] **Step 4: Rodar check Django**

Run:

```powershell
C:\ERP\.venv\Scripts\python.exe manage.py check
```

Expected:

```text
System check identified no issues (0 silenced).
```

---

### Task 4: Validação manual obrigatória no app real

**Files:**

- No source edit expected.

- [ ] **Step 1: Buildar o PDV**

Run:

```powershell
cd C:\ERP\pdv
npm.cmd run build
```

Expected: build completa sem erro e gera:

```text
C:\ERP\pdv\dist\main\index.js
C:\ERP\pdv\dist\preload\index.js
```

- [ ] **Step 2: Confirmar paths do Electron**

Run:

```powershell
rg -n "preload|index\\.js|index\\.mjs" C:\ERP\pdv\dist\main\index.js C:\ERP\pdv\package.json
```

Expected:

```text
pdv\package.json: "main": "dist/main/index.js"
pdv\dist\main\index.js: preload: path.join(__dirname, "../preload/index.js")
```

Não pode aparecer `../preload/index.mjs`.

- [ ] **Step 3: Reiniciar backend local**

Se o backend estiver rodando com `--noreload`, reiniciar:

```powershell
cd C:\ERP\backend
C:\ERP\.venv\Scripts\python.exe manage.py runserver 127.0.0.1:8000 --noreload
```

Expected: servidor responde em `http://127.0.0.1:8000/health/`.

- [ ] **Step 4: Testar fechamento de caixa**

No PDV:

1. Entrar com API key `e2e-test-key-2026`.
2. Ir para `Gestão de Caixa`.
3. Se houver caixa aberto, clicar `Fechar Caixa`.
4. Informar valor de fechamento igual ao valor `Esperado`.
5. Clicar no botão `Fechar` dentro do modal.

Expected:

- o modal fecha;
- o caixa fica fechado, ou a tela passa a mostrar abertura de novo;
- se a API recusar, o erro aparece dentro do modal;
- não pode parecer “botão morto”.

- [ ] **Step 5: Abrir caixa limpo**

No PDV:

1. Abrir caixa com `100.00`.
2. Ir ao Dashboard.

Expected:

```text
Abertura: 100.00
Esperado: 100.00
Vendas: 0
Total Vendido: 0.00
```

- [ ] **Step 6: Fazer venda e imprimir**

No PDV real Electron, não apenas no navegador:

1. Ir para `Nova Venda`.
2. Buscar `Produto E2E`.
3. Adicionar produto.
4. Registrar pagamento `49.90`.
5. Confirmar venda.
6. Clicar `Imprimir Cupom`.

Expected:

- abre diálogo/spooler de impressão nativo do sistema;
- salva `.html` e `.pdf` na raiz `C:\ERP`, com nome parecido com `cupom_nao_fiscal_<id>.pdf`;
- modal mostra mensagem `Cupom enviado para impressão e salvo em: ...`;
- se o usuário cancelar impressão, deve aparecer mensagem de falha, mas o cupom deve continuar salvo.

- [ ] **Step 7: Validar Dashboard após venda**

Voltar ao Dashboard.

Expected:

```text
Vendas: 1
Total Vendido: 49.90
Esperado: 149.90
Vendas Recentes: contém a venda recém-criada
```

---

## Comandos finais obrigatórios

Executar todos antes de dizer que está corrigido:

```powershell
cd C:\ERP\pdv
npm.cmd test -- src/renderer/__tests__/pages/Sale.test.tsx src/renderer/__tests__/pages/Dashboard.test.tsx src/renderer/__tests__/pages/CashSession.test.tsx src/renderer/__tests__/contexts/CashSessionContext.test.tsx src/main/__tests__/printing.test.ts
npm.cmd run build
```

```powershell
cd C:\ERP
C:\ERP\.venv\Scripts\python.exe -m pytest backend\tests\test_device_auth_api.py backend\tests\test_sales_api.py --cov-fail-under=0
cd C:\ERP\backend
C:\ERP\.venv\Scripts\python.exe manage.py check
```

## Critérios de aceite

- [ ] `Imprimir Cupom` chama `electronAPI.printReceipt` no app Electron.
- [ ] `printing:receipt` salva `.html` e `.pdf` em `C:\ERP`.
- [ ] `printing:receipt` chama `webContents.print({ silent: false })`.
- [ ] O operador recebe feedback visual de sucesso ou falha da impressão.
- [ ] `Fechar Caixa` envia `Idempotency-Key`.
- [ ] Erro de fechamento aparece dentro do modal.
- [ ] Tela de caixa não quebra por import ausente.
- [ ] Caixa novo abre zerado em vendas.
- [ ] Após uma venda de R$ 49,90, Dashboard mostra `Vendas: 1`, `Total Vendido: 49.90`, `Esperado: 149.90`.
- [ ] Testes e build passam.

## Observações para o agente executor

- Não remova proteção CSRF global do Django.
- Não marque endpoints administrativos como `csrf_exempt`.
- O endpoint `/api/v1/devices/validate/` pode usar `authentication_classes = []` porque ele é o login por API key do dispositivo.
- Não salvar chaves reais no código.
- A API key `e2e-test-key-2026` é apenas dado local de teste.
- Não versionar cupons gerados manualmente, a menos que o usuário peça explicitamente.
