# Emissão de NFC-e sob Demanda no PDV — Plano de Implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fazer o botão "Imprimir Cupom Fiscal" disparar a emissão real de NFC-e via PlugNotas (assíncrona) apenas quando o operador solicitar, em vez de emitir automaticamente em toda venda.

**Architecture:** O backend já possui toda a infraestrutura fiscal (`FiscalEmitter`, `FiscalDocument`, `emit_nfce`, `poll_fiscal_documents`, adaptador PlugNotas). Atualmente, a emissão é acionada automaticamente via outbox (`sales.sale.confirmed` → `handle_sale_completed`). Vamos: (1) remover o gatilho automático, (2) criar endpoint `POST /api/v1/sales/{saleId}/request-fiscal/` para emissão sob demanda, (3) conectar o PDV a esse endpoint via IPC, (4) exibir status do documento fiscal no histórico.

**Tech Stack:** Django (backend), Electron + IPC (PDV), PlugNotas (provedor fiscal), Celery beat (polling)

---

### Task 1: Remover emissão automática de NFC-e no backend

**Arquivos:**
- Modify: `backend/fiscal/tasks.py:20-24`

**Contexto:** O handler `handle_sale_confirmed_outbox` registrado em `sales.sale.confirmed` faz com que toda venda confirmada dispare automaticamente `emit_nfce`. Precisamos remover esse gatilho automático — a NFC-e só deve ser emitida quando o operador clicar em "Imprimir Cupom Fiscal".

- [ ] **Step 1: Remover o registro automático do outbox handler**

```python
# backend/fiscal/tasks.py — REMOVER ou comentar o decorator @register_handler
# @register_handler('sales.sale.confirmed')  ← commented out
# def handle_sale_confirmed_outbox(message):  ← keep function but remove registration
```

Alterar o arquivo para:

```python
# backend/fiscal/tasks.py

# NFC-e emission is now triggered on demand via the request-fiscal API endpoint.
# The outbox-triggered handler below is kept for reference but disabled.
# @register_handler('sales.sale.confirmed')
# def handle_sale_confirmed_outbox(message):
#     sale_id = message.payload.get('sale_id') or message.aggregate_id
#     handle_sale_completed.delay(str(sale_id))
#     return {'sale_id': str(sale_id), 'task': 'fiscal.tasks.handle_sale_completed'}
```

- [ ] **Step 2: Verificar que o handler não está mais ativo**

Run: `cd backend && python manage.py shell -c "from outbox.handlers import get_handler; print(get_handler('sales.sale.confirmed'))"`
Expected: `None`

- [ ] **Step 3: Testar que venda confirmada não cria FiscalDocument automaticamente**

Run: `cd backend && pytest tests/test_fiscal_outbox.py::test_sale_confirmed_outbox_handler_dispatches_fiscal_task -v`
Expected: O teste vai falhar porque o handler não existe mais — isso é esperado. Vamos atualizar os testes na Task de testes.

- [ ] **Step 4: Commit**

```bash
git add backend/fiscal/tasks.py
git commit -m "fix: remove auto NFC-e emission on sale confirm - emission is now on-demand"
```

---

### Task 2: Criar endpoint `request-fiscal` no backend

**Arquivos:**
- Create: `backend/fiscal/serializers.py` (já existe — vamos adicionar serializer)
- Modify: `backend/fiscal/views.py`
- Modify: `backend/fiscal/urls.py`

- [ ] **Step 1: Adicionar `FiscalRequestSerializer`**

```python
# backend/fiscal/serializers.py — ADICIONAR no final

class FiscalRequestSerializer(serializers.Serializer):
    sale_id = serializers.UUIDField()
    status = serializers.CharField(read_only=True)
    attempt = serializers.IntegerField(read_only=True)
```

- [ ] **Step 2: Criar a view `RequestFiscalView`**

```python
# backend/fiscal/views.py — ADICIONAR

from rest_framework.generics import CreateAPIView
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from fiscal.models import FiscalDocument
from fiscal.serializers import FiscalRequestSerializer, FiscalStatusSerializer
from fiscal.services import emit_nfce
from tenancy.permissions import HasActiveTenant, HasVerifiedMFA


class RequestFiscalView(CreateAPIView):
    permission_classes = [IsAuthenticated, HasActiveTenant, HasVerifiedMFA]
    serializer_class = FiscalRequestSerializer

    def create(self, request, *args, **kwargs):
        from sales.models import Sale

        sale_id = self.kwargs.get('sale_id') or request.data.get('sale_id')
        try:
            sale = Sale.all_objects.select_related('branch', 'tenant').get(
                id=sale_id,
                tenant=request.tenant,
            )
        except Sale.DoesNotExist:
            return Response(
                {'detail': 'Venda não encontrada.'},
                status=404,
            )

        if sale.status != 'confirmed':
            return Response(
                {'detail': 'Apenas vendas confirmadas podem solicitar emissão fiscal.'},
                status=400,
            )

        doc = emit_nfce(sale, request.tenant)

        return Response(
            FiscalStatusSerializer(doc).data,
            status=201,
        )
```

- [ ] **Step 3: Adicionar endpoint de configuração fiscal**

```python
# backend/fiscal/views.py — ADICIONAR

from rest_framework.views import APIView
from fiscal.services import resolve_emitter


class FiscalConfigView(APIView):
    permission_classes = [IsAuthenticated, HasActiveTenant]

    def get(self, request):
        from tenancy.models import Branch

        branch_id = request.query_params.get('branch')
        if not branch_id:
            return Response({'detail': 'branch query parameter is required.'}, status=400)
        try:
            branch = Branch.all_objects.get(id=branch_id, tenant=request.tenant)
        except Branch.DoesNotExist:
            return Response({'detail': 'Branch not found.'}, status=404)

        emitter = resolve_emitter(branch)
        return Response({
            'has_fiscal_config': emitter is not None,
            'emitter_id': str(emitter.id) if emitter else None,
        })
```

- [ ] **Step 4: Atualizar urls.py**

```python
# backend/fiscal/urls.py — ATUALIZAR

from django.urls import path

from fiscal.views import FiscalConfigView, FiscalStatusView, RequestFiscalView
from fiscal.webhook import fiscal_webhook

app_name = 'fiscal'

urlpatterns = [
    path(
        'sales/<uuid:sale_id>/fiscal-status/',
        FiscalStatusView.as_view(),
        name='fiscal-status',
    ),
    path(
        'sales/<uuid:sale_id>/request-fiscal/',
        RequestFiscalView.as_view(),
        name='request-fiscal',
    ),
    path('fiscal/config/', FiscalConfigView.as_view(), name='fiscal-config'),
    path('fiscal/webhook/', fiscal_webhook, name='fiscal-webhook'),
]
```

- [ ] **Step 5: Testar o endpoint manualmente**

Run: `cd backend && python manage.py test fiscal.tests.test_fiscal_api -v 2`
Expected: Tests pass

- [ ] **Step 6: Commit**

```bash
git add backend/fiscal/views.py backend/fiscal/urls.py backend/fiscal/serializers.py
git commit -m "feat: add request-fiscal and fiscal-config API endpoints for on-demand NFC-e"
```

---

### Task 3: Decisão de arquitetura — chamadas de API no renderer (sem IPC)

**Arquivos:** Nenhum — decisão de design documentada.

**Contexto:** O renderer (Sale.tsx, Dashboard.tsx) já faz chamadas `fetch` diretas para o backend com `authHeaders()` (que lê tokens do `localStorage`). Adicionar IPC handlers no main process exigiria passar tokens do renderer para o main, o que é desnecessário.

**Decisão:** As chamadas `POST /api/v1/fiscal/sales/{saleId}/request-fiscal/` e `GET /api/v1/fiscal/sales/{saleId}/fiscal-status/` serão feitas diretamente do renderer via `fetch`, usando `authHeaders()` existente. O IPC continua sendo usado APENAS para impressão (`printing:receipt`, `printing:fiscal`, `printing:balcao`).

O preload (`pdv/src/preload/index.ts`) não precisa ser alterado — `printFiscalReceipt` e `printBalcaoReceipt` já estão expostos.

A verificação:
- [ ] Confirmar que `authHeaders()` existe em Sale.tsx (linha 9) e Dashboard.tsx (linha 10)
- [ ] Confirmar que `printFiscalReceipt` e `printBalcaoReceipt` estão no preload

```bash
# Verificar sem alterações
git status
# Nenhum arquivo alterado — apenas registrar a decisão
```

---

### Task 4: Atualizar Sale.tsx — emitir NFC-e real ao clicar "Imprimir Cupom Fiscal"

**Arquivos:**
- Modify: `pdv/src/renderer/pages/Sale.tsx`
- Modify: `pdv/src/renderer/utils/receipt.ts`

**Contexto:** Atualmente `handlePrintFiscal` apenas adiciona header "CUPOM FISCAL" e imprime. Agora deve:
1. Chamar `POST /api/v1/fiscal/sales/{saleId}/request-fiscal/` para enfileirar emissão
2. Se sucesso, mostrar mensagem "Emissão solicitada com sucesso"
3. Se já existir documento autorizado, imprimir direto com protocolo/chave

- [ ] **Step 1: Atualizar `handlePrintFiscal` em Sale.tsx**

```typescript
// pdv/src/renderer/pages/Sale.tsx — SUBSTITUIR handlePrintFiscal

const handlePrintFiscal = async () => {
  if (!confirmationSale) return;
  setProcessing(true);

  const saleId = confirmationSale.id;
  const headers = authHeaders();

  try {
    // Check if fiscal document already exists and is authorized
    const statusResponse = await fetch(`/api/v1/fiscal/sales/${saleId}/fiscal-status/`, { headers });

    if (statusResponse.ok) {
      const statusData = await statusResponse.json();
      if (statusData.fiscal_status === 'CONCLUDED') {
        // Already authorized — print directly with protocol/chave
        const html = buildReceiptHtml(confirmationSale.data, {
          fiscalStatus: 'autorizado',
          protocolo: statusData.protocol,
          chaveAcesso: statusData.xml_url || '',
        });
        const fileName = `cupom_fiscal_${confirmationSale.saleNumber}`;
        const electronAPI = (window as any).electronAPI;
        if (electronAPI?.printFiscalReceipt) {
          await electronAPI.printFiscalReceipt({ html, fileName });
        } else if (electronAPI?.printReceipt) {
          await electronAPI.printReceipt({ html, fileName });
        }
        setConfirmationSale(null);
        return;
      }

      if (statusData.fiscal_status === 'PENDING' || statusData.fiscal_status === 'PROCESSING') {
        setError('Emissão fiscal já está em processamento. Verifique o status no histórico.');
        return;
      }

      if (statusData.fiscal_status === 'REJECTED') {
        setError(`Emissão fiscal foi rejeitada: ${statusData.error_detail}. Tente novamente no histórico.`);
        return;
      }
    }

    // No existing doc or failed — request new emission
    const requestResponse = await fetch(`/api/v1/fiscal/sales/${saleId}/request-fiscal/`, {
      method: 'POST',
      headers: { ...headers, 'Idempotency-Key': crypto.randomUUID() },
    });

    if (requestResponse.status === 201) {
      const result = await requestResponse.json();
      setConfirmationSale(null);
      setError('');
      // Show success toast briefly
      setTimeout(() => {
        alert(`✅ Emissão fiscal solicitada com sucesso! Protocolo: ${result.protocol || 'Em processamento'}`);
      }, 100);
    } else {
      const errData = await requestResponse.json();
      setError(errData.detail || 'Erro ao solicitar emissão fiscal.');
    }
  } catch (error) {
    setError(error instanceof Error ? error.message : 'Erro de rede ao solicitar emissão fiscal.');
  } finally {
    setProcessing(false);
  }
};
```

- [ ] **Step 2: Atualizar `buildReceiptHtml` para aceitar dados fiscais**

Mudar a assinatura da função e adicionar bloco fiscal ao final do HTML.

```typescript
// pdv/src/renderer/utils/receipt.ts — SUBSTITUIR função buildReceiptHtml

export function buildReceiptHtml(
  saleReceipt: ReceiptData,
  fiscalInfo?: {
    fiscalStatus?: string;
    protocolo?: string;
    chaveAcesso?: string;
  },
): string {
  const saleNumber = String(saleReceipt.id).slice(0, 8);
  const itemsHtml = (saleReceipt.items || []).map((item: ReceiptItem) => {
    const productName =
      typeof item.product === 'object' && item.product !== null
        ? item.product.name || 'Produto'
        : 'Produto';
    return `
      <div class="item-row">
        <div>
          <div>${escapeHtml(productName)}</div>
          <div class="muted">x${formatReceiptQuantity(item.quantity)}</div>
        </div>
        <strong>R$ ${Number(item.line_total).toFixed(2)}</strong>
      </div>
    `;
  }).join('');

  const fiscalBlock = fiscalInfo?.fiscalStatus === 'autorizado' ? `
    <div style="text-align:center;margin-top:3mm;padding-top:2mm;border-top:1px dashed #000;font-size:9px">
      <p style="margin:1mm 0"><strong>Protocolo:</strong> ${fiscalInfo.protocolo || '-'}</p>
      <p style="margin:1mm 0"><strong>Chave de Acesso:</strong> ${escapeHtml(fiscalInfo.chaveAcesso || '-')}</p>
      <p style="margin-top:2mm;color:#666">Consulte em https://www.sefaz.gov.br/consulta</p>
    </div>` : '';

  return `<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8">
  <title>TJSys PDV - Cupom${fiscalInfo ? ' Fiscal' : ' N\u00e3o Fiscal'} #${escapeHtml(saleNumber)}</title>
  <style>
    * { box-sizing: border-box; }
    @page { size: 80mm auto; margin: 0; }
    @media print {
      @page { size: 80mm auto; margin: 0; }
      body { padding: 0; margin: 0; }
    }
    body { margin: 0; padding: 0; font-family: 'Courier New', Courier, monospace; font-size: 12px; color: #000; background: #fff; width: 80mm; }
    .receipt { width: 80mm; padding: 0; }
    h1 { margin: 2mm 0; text-align: center; font-size: 14px; font-weight: bold; }
    .subtitle { margin: 0 0 2mm; text-align: center; font-size: 10px; }
    .line, .item-row { display: flex; justify-content: space-between; gap: 2mm; margin: 1mm 0; font-size: 11px; }
    .items { border-top: 1px dashed #000; border-bottom: 1px dashed #000; padding: 2mm 0; margin: 2mm 0; }
    .muted { font-size: 10px; margin-top: 1px; }
    .total { font-weight: bold; font-size: 12px; }
    .thanks { text-align: center; margin-top: 3mm; font-size: 10px; }
  </style>
</head>
<body>
  <main class="receipt">
    <h1>TJSys PDV</h1>
    <p class="subtitle">${fiscalInfo ? 'Cupom Fiscal' : 'Cupom N\u00e3o Fiscal'}</p>
    <div class="line"><span>Venda</span><strong>#${escapeHtml(saleNumber)}</strong></div>
    <div class="line"><span>Data</span><span>${escapeHtml(new Date(saleReceipt.created_at).toLocaleString('pt-BR'))}</span></div>
    <section class="items">${itemsHtml}</section>
    <div class="line total"><span>Total</span><span>R$ ${Number(saleReceipt.net_total).toFixed(2)}</span></div>
    ${fiscalBlock}
    <p class="thanks">Obrigado pela prefer\u00eancia!</p>
  </main>
</body>
</html>`;
}
```

- [ ] **Step 3: Atualizar `handlePrintBalcao` para usar a nova assinatura (sem fiscalInfo)**

```typescript
// pdv/src/renderer/pages/Sale.tsx — handlePrintBalcao (já existe, só garantir que chama buildReceiptHtml sem fiscalInfo)

const handlePrintBalcao = async () => {
  if (!confirmationSale) return;
  const html = buildReceiptHtml(confirmationSale.data); // sem fiscalInfo
  const fileName = `cupom_balcao_${confirmationSale.saleNumber}`;
  // ...rest unchanged
};
```

- [ ] **Step 4: Verificar compilação**

Run: `cd pdv && npx tsc --noEmit 2>&1 | Select-String -NotMatch "TS6305"`
Expected: No errors related to our changes (TS6305 pre-existing errors are acceptable)

- [ ] **Step 5: Commit**

```bash
git add pdv/src/renderer/pages/Sale.tsx pdv/src/renderer/utils/receipt.ts
git commit -m "feat: wire 'Imprimir Cupom Fiscal' to real NFC-e emission endpoint"
```

---

### Task 5: Atualizar Dashboard.tsx — status fiscal, reimpressão, solicitação retroativa

**Arquivos:**
- Modify: `pdv/src/renderer/pages/Dashboard.tsx`

**Contexto:** O histórico de vendas deve mostrar:
1. Status do documento fiscal (se existir) — `autorizado`, `pendente`, `rejeitado`
2. "Reimprimir Cupom Fiscal" habilitado apenas se `autorizado`
3. "Solicitar Cupom Fiscal" para vendas sem documento fiscal (solicitação retroativa)
4. Indicador visual de "Emissão em andamento" para docs pendentes

- [ ] **Step 1: Buscar status fiscal ao carregar vendas**

```typescript
// pdv/src/renderer/pages/Dashboard.tsx — ADICIONAR estado e efeito para fiscal status

const [fiscalStatuses, setFiscalStatuses] = useState<Record<string, any>>({});

// After loading sales, fetch fiscal status for each
useEffect(() => {
  if (!sales.length) return;
  const fetchStatuses = async () => {
    const headers = authHeaders();
    const results: Record<string, any> = {};
    // Limit to first 20 to avoid too many requests
    const batch = sales.slice(0, 20);
    await Promise.all(
      batch.map(async (sale: any) => {
        try {
          const resp = await fetch(`/api/v1/fiscal/sales/${sale.id}/fiscal-status/`, { headers });
          if (resp.ok) {
            const data = await resp.json();
            results[sale.id] = data;
          }
          // 404 means no fiscal doc — leave as null
        } catch {
          // ignore network errors
        }
      }),
    );
    setFiscalStatuses(results);
  };
  fetchStatuses();
}, [sales]);
```

- [ ] **Step 2: Adicionar indicador de status fiscal no card da venda**

```typescript
// pdv/src/renderer/pages/Dashboard.tsx — DENTRO do card de cada venda, ao lado do número

const fiscalStatus = fiscalStatuses[sale.id];

// No card header, after sale number:
{fiscalStatus && (
  <span style={{
    display: 'inline-block',
    padding: '2px 8px',
    borderRadius: '10px',
    fontSize: '0.65rem',
    fontWeight: 600,
    marginLeft: '8px',
    backgroundColor: fiscalStatus.fiscal_status === 'CONCLUDED' ? '#e8f5e9' :
                     fiscalStatus.fiscal_status === 'REJECTED' ? '#fce4ec' : '#fff3e0',
    color: fiscalStatus.fiscal_status === 'CONCLUDED' ? '#2e7d32' :
           fiscalStatus.fiscal_status === 'REJECTED' ? '#c62828' : '#e65100',
  }}>
    {fiscalStatus.fiscal_status === 'CONCLUDED' ? 'NFC-e' :
     fiscalStatus.fiscal_status === 'REJECTED' ? 'Rejeitado' : 'Pendente'}
  </span>
)}
```

- [ ] **Step 3: Atualizar menu de ações — 3 botões condicionais**

```typescript
// pdv/src/renderer/pages/Dashboard.tsx — SUBSTITUIR o menu de ações

{/* Botão Reimprimir Cupom Balcão — sempre disponível */}
<button type="button" onClick={() => handleReprint(sale.id, 'balcao')}
  style={{ display: 'block', width: '100%', padding: '12px 16px', background: 'none',
    border: 'none', textAlign: 'left', cursor: 'pointer', fontSize: '0.875rem', color: '#1976d2' }}>
  Reimprimir Cupom Balcão
</button>

{/* Botão fiscal condicional */}
{fiscalStatus?.fiscal_status === 'CONCLUDED' ? (
  <button type="button" onClick={() => handleReprint(sale.id, 'fiscal')}
    style={{ display: 'block', width: '100%', padding: '12px 16px', background: 'none',
      border: 'none', textAlign: 'left', cursor: 'pointer', fontSize: '0.875rem', color: '#1976d2' }}>
    Reimprimir Cupom Fiscal
  </button>
) : fiscalStatus?.fiscal_status === 'PENDING' || fiscalStatus?.fiscal_status === 'PROCESSING' ? (
  <button type="button" disabled
    style={{ display: 'block', width: '100%', padding: '12px 16px', background: 'none',
      border: 'none', textAlign: 'left', fontSize: '0.875rem', color: '#9e9e9e', cursor: 'not-allowed' }}>
    Emissão NFC-e em andamento...
  </button>
) : fiscalStatus?.fiscal_status === 'REJECTED' ? (
  <>
    <button type="button" disabled
      style={{ display: 'block', width: '100%', padding: '12px 16px', background: 'none',
        border: 'none', textAlign: 'left', fontSize: '0.875rem', color: '#c62828', cursor: 'not-allowed' }}>
      NFC-e rejeitada: {fiscalStatus.error_detail}
    </button>
    <button type="button" onClick={() => handleRequestFiscal(sale.id)}
      style={{ display: 'block', width: '100%', padding: '12px 16px', background: 'none',
        border: 'none', textAlign: 'left', cursor: 'pointer', fontSize: '0.875rem', color: '#1976d2' }}>
      Tentar novamente
    </button>
  </>
) : (
  /* Sem documento fiscal — permite solicitar retroativamente */
  <button type="button" onClick={() => handleRequestFiscal(sale.id)}
    style={{ display: 'block', width: '100%', padding: '12px 16px', background: 'none',
      border: 'none', textAlign: 'left', cursor: 'pointer', fontSize: '0.875rem', color: '#1976d2' }}>
    Solicitar Cupom Fiscal
  </button>
)}
```

- [ ] **Step 4: Adicionar `handleRequestFiscal` no Dashboard**

```typescript
// pdv/src/renderer/pages/Dashboard.tsx — ADICIONAR handler

const handleRequestFiscal = useCallback(async (saleId: string) => {
  setMenuSaleId(null);
  try {
    const resp = await fetch(`/api/v1/fiscal/sales/${saleId}/request-fiscal/`, {
      method: 'POST',
      headers: { ...authHeaders(), 'Idempotency-Key': crypto.randomUUID() },
    });
    if (resp.status === 201) {
      setReprintMessage('✅ Emissão fiscal solicitada com sucesso!');
    } else {
      const err = await resp.json();
      setReprintMessage(`❌ ${err.detail || 'Erro ao solicitar emissão fiscal.'}`);
    }
  } catch (error) {
    setReprintMessage('❌ Erro de rede ao solicitar emissão fiscal.');
  }
}, []);
```

- [ ] **Step 5: Atualizar `handleReprint` para fiscal incluir protocolo/chave**

```typescript
// pdv/src/renderer/pages/Dashboard.tsx — ATUALIZAR handleReprint

const handleReprint = useCallback(async (saleId: string, type: 'fiscal' | 'balcao') => {
  setMenuSaleId(null);
  setReprinting(saleId);
  setReprintMessage('');

  const electronAPI = (window as any).electronAPI;

  try {
    let sale;
    if (electronAPI?.getSaleDetail) {
      const detailResult = await electronAPI.getSaleDetail(saleId);
      if (!detailResult.success) {
        throw new Error(detailResult.error || 'Erro ao buscar venda');
      }
      sale = detailResult.data;
    } else {
      const response = await fetch(`/api/v1/sales/${saleId}/`, { headers: authHeaders() });
      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.detail || 'Erro ao buscar venda');
      }
      sale = await response.json();
    }

    const itemsWithNames = await Promise.all(
      (sale.items || []).map(async (item: any) => {
        if (typeof item.product === 'object' && item.product?.name) return item;
        try {
          const prodResp = await fetch(`/api/v1/catalog/products/${item.product}/`, { headers: authHeaders() });
          if (prodResp.ok) {
            const product = await prodResp.json();
            return { ...item, product };
          }
        } catch { /* ignore */ }
        return item;
      }),
    );

    let html: string;
    const label = type === 'fiscal' ? 'fiscal' : 'balcao';
    const fileName = `cupom_${label}_${String(sale.id).slice(0, 8)}`;

    if (type === 'fiscal') {
      // Buscar status fiscal para incluir protocolo/chave
      let fiscalInfo = {};
      try {
        const statusResp = await fetch(`/api/v1/fiscal/sales/${saleId}/fiscal-status/`, { headers: authHeaders() });
        if (statusResp.ok) {
          const statusData = await statusResp.json();
          if (statusData.fiscal_status === 'CONCLUDED') {
            fiscalInfo = {
              fiscalStatus: 'autorizado',
              protocolo: statusData.protocol,
              chaveAcesso: statusData.xml_url || '',
            };
          }
        }
      } catch { /* ignore */ }
      html = buildReceiptHtml({ ...sale, items: itemsWithNames }, fiscalInfo);
    } else {
      html = buildReceiptHtml({ ...sale, items: itemsWithNames });
    }

    const printFn = type === 'fiscal'
      ? electronAPI?.printFiscalReceipt
      : electronAPI?.printBalcaoReceipt;
    const fallbackPrint = electronAPI?.printReceipt;
    const printResult = await (printFn || fallbackPrint)({ html, fileName });

    if (printResult?.success) {
      setReprintMessage(`Cupom reimpresso e salvo em: ${printResult.savedPath}`);
    } else {
      setReprintMessage(printResult?.error || 'Falha na impressão');
    }
  } catch (error) {
    setReprintMessage(`Erro: ${error instanceof Error ? error.message : 'Erro desconhecido'}`);
  } finally {
    setReprinting(null);
  }
}, []);
```

- [ ] **Step 6: Verificar compilação**

Run: `cd pdv && npx tsc --noEmit 2>&1 | Select-String -NotMatch "TS6305"`
Expected: No new errors

- [ ] **Step 7: Commit**

```bash
git add pdv/src/renderer/pages/Dashboard.tsx
git commit -m "feat: add NFC-e status display and retroactive fiscal request in dashboard"
```

---

### Task 6: Atualizar testes do PDV

**Arquivos:**
- Modify: `pdv/src/renderer/__tests__/pages/Dashboard.test.tsx`
- Modify: `pdv/src/renderer/__tests__/components/SaleConfirmationToast.test.tsx`
- Modify: `pdv/src/renderer/__tests__/pages/Sale.test.tsx`

- [ ] **Step 1: Atualizar Dashboard.test.tsx — mock fiscal status endpoint**

```typescript
// pdv/src/renderer/__tests__/pages/Dashboard.test.tsx — ADICIONAR mocks

// Mock fiscal status endpoint
global.fetch = vi.fn((url: string) => {
  if (url.includes('/fiscal-status/')) {
    return Promise.resolve({
      ok: true,
      status: 200,
      json: () => Promise.resolve({
        fiscal_status: 'CONCLUDED',
        protocol: '123456789',
        xml_url: 'https://example.com/nfce.xml',
      }),
    });
  }
  if (url.includes('/request-fiscal/')) {
    return Promise.resolve({
      ok: true,
      status: 201,
      json: () => Promise.resolve({
        fiscal_status: 'PROCESSING',
        protocol: '',
        xml_url: '',
      }),
    });
  }
  // ...existing mocks...
});
```

- [ ] **Step 2: Verificar testes passam**

Run: `cd pdv && npx vitest run --reporter=verbose 2>&1 | Select-String -NotMatch "better-sqlite3"`
Expected: All tests pass (pre-existing failures from better-sqlite3 are acceptable)

- [ ] **Step 3: Commit**

```bash
git add pdv/src/renderer/__tests__/pages/Dashboard.test.tsx pdv/src/renderer/__tests__/components/SaleConfirmationToast.test.tsx pdv/src/renderer/__tests__/pages/Sale.test.tsx
git commit -m "test: update tests for on-demand NFC-e emission flow"
```

---

### Task 7: Backend tests — request-fiscal endpoint

**Arquivos:**
- Modify: `backend/tests/test_fiscal_api.py`

- [ ] **Step 1: Adicionar teste para request-fiscal endpoint**

```python
# backend/tests/test_fiscal_api.py — ADICIONAR

def test_request_fiscal_creates_document(client, fiscal_sale_context):
    from fiscal.models import FiscalDocument

    ctx = fiscal_sale_context
    sale = ctx['sale']
    client.force_login(ctx['user'])

    # Set tenant header
    headers = {'HTTP_X_TENANT_ID': str(ctx['tenant'].id)}

    response = client.post(
        f'/api/v1/fiscal/sales/{sale.id}/request-fiscal/',
        **headers,
    )
    assert response.status_code == 201
    data = response.json()
    assert data['fiscal_status'] in ('PENDING', 'PROCESSING')

    doc = FiscalDocument.all_objects.filter(sale=sale, is_active=True).first()
    assert doc is not None


def test_request_fiscal_returns_existing_document(client, fiscal_sale_context):
    from fiscal.models import FiscalDocument
    from fiscal.services import emit_nfce

    ctx = fiscal_sale_context
    sale = ctx['sale']
    client.force_login(ctx['user'])
    headers = {'HTTP_X_TENANT_ID': str(ctx['tenant'].id)}

    # Create fiscal document first
    doc = emit_nfce(sale, ctx['tenant'])

    # Request again — should return existing doc
    response = client.post(
        f'/api/v1/fiscal/sales/{sale.id}/request-fiscal/',
        **headers,
    )
    assert response.status_code == 201
    data = response.json()
    assert data['attempt'] == doc.attempt_number


def test_request_fiscal_404_for_nonexistent_sale(client, fiscal_sale_context):
    import uuid
    ctx = fiscal_sale_context
    client.force_login(ctx['user'])
    headers = {'HTTP_X_TENANT_ID': str(ctx['tenant'].id)}

    response = client.post(
        f'/api/v1/fiscal/sales/{uuid.uuid4()}/request-fiscal/',
        **headers,
    )
    assert response.status_code == 404
```

- [ ] **Step 2: Adicionar teste para fiscal-config endpoint**

```python
# backend/tests/test_fiscal_api.py — ADICIONAR

def test_fiscal_config_returns_true_when_emitter_exists(client, fiscal_sale_context):
    from fiscal.models import FiscalEmitter

    ctx = fiscal_sale_context
    branch = ctx['branch']
    client.force_login(ctx['user'])
    headers = {'HTTP_X_TENANT_ID': str(ctx['tenant'].id)}

    response = client.get(
        f'/api/v1/fiscal/config/?branch={branch.id}',
        **headers,
    )
    assert response.status_code == 200
    data = response.json()
    assert data['has_fiscal_config'] is True


def test_fiscal_config_returns_false_when_no_emitter(client, fiscal_sale_context):
    from fiscal.models import FiscalEmitter

    ctx = fiscal_sale_context
    branch = ctx['branch']
    client.force_login(ctx['user'])
    headers = {'HTTP_X_TENANT_ID': str(ctx['tenant'].id)}

    # Deactivate all emitters
    FiscalEmitter.all_objects.filter(branch=branch).update(is_active=False)

    response = client.get(
        f'/api/v1/fiscal/config/?branch={branch.id}',
        **headers,
    )
    assert response.status_code == 200
    data = response.json()
    assert data['has_fiscal_config'] is False
```

- [ ] **Step 3: Rodar testes**

Run: `cd backend && python manage.py test tests.test_fiscal_api -v 2`
Expected: All tests pass

- [ ] **Step 4: Commit**

```bash
git add backend/tests/test_fiscal_api.py
git commit -m "test: add tests for request-fiscal and fiscal-config endpoints"
```

---

### Task 8: Verificação final

**Arquivos:** Nenhum — execução de verificação

- [ ] **Step 1: Rodar testes do PDV**

Run: `cd pdv && npx vitest run --reporter=verbose 2>&1 | Select-String -NotMatch "better-sqlite3"`
Expected: All PDV tests pass

- [ ] **Step 2: Rodar testes do backend**

Run: `cd backend && python manage.py test -v 2 2>&1 | tail -20`
Expected: All backend tests pass

- [ ] **Step 3: Verificar build do PDV**

Run: `cd pdv && npm run build 2>&1`
Expected: Build successful, no errors

- [ ] **Step 4: Commit final**

```bash
git add -A
git commit -m "feat: on-demand NFC-e emission via 'Imprimir Cupom Fiscal' button"
```
