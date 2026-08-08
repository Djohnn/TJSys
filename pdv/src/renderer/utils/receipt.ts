export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&')
    .replace(/</g, '<')
    .replace(/>/g, '>')
    .replace(/"/g, '"')
    .replace(/'/g, '&#039;');
}

export function formatReceiptQuantity(quantity: string | number): string {
  const value = Number(quantity);
  if (!Number.isFinite(value)) return String(quantity);
  return value.toFixed(1);
}

export interface ReceiptItem {
  product?: { name?: string } | string | null;
  quantity: string | number;
  line_total: string | number;
}

export interface ReceiptData {
  id: string;
  created_at: string;
  net_total: string | number;
  items?: ReceiptItem[];
}

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