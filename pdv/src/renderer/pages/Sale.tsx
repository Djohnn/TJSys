import { useState, useEffect, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useCashSession } from '../contexts/CashSessionContext';
import { Card, Button, Input } from '../components/ui';
import { SaleConfirmationToast } from '../components/SaleConfirmationToast';
import { buildReceiptHtml } from '../utils/receipt';
import { formatQuantity, QuantityFormatOptions } from '../../shared/quantity';

function parseProductPrice(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function quantityOptionsForProduct(product: any): QuantityFormatOptions {
  const unit = product?.base_unit && typeof product.base_unit === 'object'
    ? product.base_unit
    : product?.unit && typeof product.unit === 'object'
      ? product.unit
      : null;
  const flatSymbol = product?.unit_symbol ?? product?.base_unit_symbol;
  const flatPrecision = product?.unit_precision ?? product?.quantity_precision ?? product?.decimal_places;
  if (!unit) return { symbol: flatSymbol, precision: flatPrecision };
  return {
    symbol: flatSymbol ?? unit.symbol,
    precision: flatPrecision ?? unit.precision ?? unit.quantity_precision ?? unit.decimal_places,
  };
}

function authHeaders(): Record<string, string> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  const token = localStorage.getItem('access_token');
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const tid = localStorage.getItem('tenant_id');
  if (tid) headers['X-Tenant-ID'] = tid;
  return headers;
}

const methodLabels: Record<string, string> = {
  cash: 'Dinheiro',
  pix: 'Pix',
  card_debit: 'Cartão Débito',
  card_credit: 'Cartão Crédito',
};

export function Sale() {
  const { isAuthenticated } = useAuth();
  const { session } = useCashSession();
  const navigate = useNavigate();

  const [items, setItems] = useState<Array<{
    product: any;
    quantity: number;
    factor: number;
    unitPrice: number;
    discount: number;
    lineTotal: number;
  }>>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [showSearch, setShowSearch] = useState(false);
  const [payments, setPayments] = useState<Array<{ method: string; amount: number; reference: string }>>([]);
  const [pendingMethod, setPendingMethod] = useState<'cash' | 'pix' | 'card_debit' | 'card_credit'>('cash');
  const [pendingAmount, setPendingAmount] = useState('');
  const [pendingReceived, setPendingReceived] = useState('');
  const [pendingReference, setPendingReference] = useState('');
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState('');
  const [confirmationSale, setConfirmationSale] = useState<{
    id: string;
    saleNumber: string;
    data: any;
  } | null>(null);
  const [hasFiscalConfig, setHasFiscalConfig] = useState(false);

  useEffect(() => {
    if (!isAuthenticated) {
      navigate('/login');
    }
  }, [isAuthenticated, navigate]);

  const calculateTotals = useCallback(() => {
    const grossTotal = items.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0);
    const discountTotal = items.reduce((sum, item) => sum + item.discount, 0);
    const netTotal = grossTotal - discountTotal;
    const paymentTotal = payments.reduce((sum, p) => sum + p.amount, 0);
    return { grossTotal, discountTotal, netTotal, paymentTotal };
  }, [items, payments]);

  const { grossTotal, discountTotal, netTotal, paymentTotal } = calculateTotals();
  const remaining = Math.max(netTotal - paymentTotal, 0);
  const isCash = pendingMethod === 'cash';

  const pendingNum = parseFloat(pendingAmount) || 0;
  const receivedNum = parseFloat(pendingReceived) || 0;
  const changePreview = isCash && receivedNum > remaining + pendingNum
    ? receivedNum - (remaining + pendingNum)
    : isCash && receivedNum > 0 && receivedNum >= pendingNum
      ? receivedNum - pendingNum
      : 0;

  useEffect(() => {
    if (!isCash && remaining > 0) {
      setPendingAmount(remaining.toFixed(2));
    }
  }, [pendingMethod, remaining, isCash]);

  const handleProductSelect = (product: any) => {
    setShowSearch(false);
    setSearchQuery('');
    setSearchResults([]);
    const unitPrice = parseProductPrice(product.price);
    if (unitPrice === null) {
      setError(`${product.name || 'Produto'} não pode ser adicionado sem preço válido.`);
      return;
    }
    setError('');

    const existingIndex = items.findIndex(item => item.product.id === product.id);
    if (existingIndex >= 0) {
      setItems(prev => {
        const newItems = [...prev];
        newItems[existingIndex] = {
          ...newItems[existingIndex],
          quantity: newItems[existingIndex].quantity + 1,
          lineTotal: (newItems[existingIndex].quantity + 1) * newItems[existingIndex].unitPrice - newItems[existingIndex].discount
        };
        return newItems;
      });
    } else {
      setItems(prev => [...prev, {
        product,
        quantity: 1,
        factor: 1,
        unitPrice,
        discount: 0,
          lineTotal: unitPrice,
        }]);
    }
  };

  const handleSearchChange = async (query: string) => {
    setSearchQuery(query);
    if (query.length >= 2) {
      try {
        const response = await fetch(`/api/v1/products/?search=${encodeURIComponent(query)}`, {
          headers: authHeaders()
        });
        if (response.ok) {
          const data = await response.json();
          setSearchResults(data.results || data);
        }
      } catch (e) {
        console.error('Search error:', e);
      }
      setShowSearch(true);
    } else {
      setSearchResults([]);
      setShowSearch(false);
    }
  };

  const updateItemQuantity = (index: number, quantity: number) => {
    if (quantity <= 0 || !Number.isFinite(quantity)) {
      setItems(prev => prev.filter((_, i) => i !== index));
      return;
    }
    setItems(prev => {
      const newItems = [...prev];
      newItems[index] = {
        ...newItems[index],
        quantity,
        lineTotal: quantity * newItems[index].unitPrice - newItems[index].discount
      };
      return newItems;
    });
  };

  const updateItemDiscount = (index: number, discount: number) => {
    setItems(prev => {
      const newItems = [...prev];
      const item = newItems[index];
      const lineTotal = item.quantity * item.unitPrice - discount;
      if (lineTotal < 0) return prev;
      newItems[index] = { ...item, discount, lineTotal };
      return newItems;
    });
  };

  const removeItem = (index: number) => {
    setItems(prev => prev.filter((_, i) => i !== index));
  };

  const addPayment = () => {
    if (pendingNum <= 0) return;
    if (!isCash && pendingNum > remaining) return;
    const effectiveAmount = isCash
      ? Math.min(pendingNum, remaining + (pendingNum > remaining ? 0 : 0))
      : pendingNum;
    if (effectiveAmount <= 0) return;
    setPayments(prev => [...prev, {
      method: pendingMethod,
      amount: effectiveAmount,
      reference: pendingReference,
    }]);
    setPendingAmount('');
    setPendingReceived('');
    setPendingReference('');
  };

  const removePayment = (index: number) => {
    setPayments(prev => prev.filter((_, i) => i !== index));
  };

  const isConfirmEnabled = items.length > 0 && payments.length > 0 && paymentTotal >= netTotal;

  const handleSubmit = async () => {
    if (items.length === 0) {
      setError('Adicione pelo menos um item à venda');
      return;
    }
    if (payments.length === 0) {
      setError('Adicione pelo menos um pagamento');
      return;
    }
    if (items.some(item => parseProductPrice(item.product.price) === null)) {
      setError('Todos os produtos devem ter um preço válido antes da venda.');
      return;
    }
    if (paymentTotal < parseFloat(netTotal.toFixed(2))) {
      setError(`Pagamento insuficiente. Faltam ${(parseFloat(netTotal.toFixed(2)) - paymentTotal).toFixed(2)}`);
      return;
    }
    if (!session.sessionId) {
      setError('Nenhum caixa aberto. Abra o caixa primeiro.');
      return;
    }

    setProcessing(true);
    setError('');

    try {
      const itemsPayload = items.map(item => ({
        product: item.product.id,
        unit: typeof item.product.base_unit === 'object' ? item.product.base_unit?.id : item.product.base_unit,
        quantity: item.quantity.toString(),
        factor: item.factor.toString(),
        discount_amount: item.discount.toFixed(2)
      }));

const paymentsPayload = payments.map(p => ({
        method: p.method,
        amount: p.amount.toFixed(2),
        reference: p.reference || undefined
      }));

      const electronAPI = window.electronAPI;
      const branch = localStorage.getItem('branch_id');
      const stockLocation = localStorage.getItem('stock_location_id');
      if (!branch || !stockLocation) {
        throw new Error('Filial e local de estoque devem estar configurados.');
      }
      const saleData = {
        branch,
        stock_location: stockLocation,
        items: itemsPayload,
        payments: paymentsPayload,
      };

      let sale;
      if (electronAPI?.createSale) {
        const result = await electronAPI.createSale(saleData);
        if (!result.success) {
          throw new Error(result.error || 'Erro ao criar venda');
        }
        sale = result.data;
      } else {
        const response = await fetch('/api/v1/sales/counter/', {
          method: 'POST',
          headers: { ...authHeaders(), 'Idempotency-Key': crypto.randomUUID() },
          body: JSON.stringify(saleData),
        });

        if (!response.ok) {
          const errData = await response.json();
          throw new Error(errData.detail || 'Erro ao criar venda');
        }

        sale = await response.json();
      }

      const enrichedItems = sale.items?.map((saleItem: any) => {
        const cartItem = items.find(item => item.product.id === saleItem.product);
        return {
          ...saleItem,
          product: cartItem?.product || saleItem.product,
        };
      });
      const enrichedSaleData = { ...sale, items: enrichedItems || sale.items };
      setConfirmationSale({
        id: sale.id,
        saleNumber: String(sale.id).slice(0, 8),
        data: enrichedSaleData,
      });
      setItems([]);
      setPayments([]);
      setError('');

      const branchId = localStorage.getItem('branch_id');
      if (branchId) {
        fetch(`/api/v1/fiscal/config/?branch=${branchId}`, { headers: authHeaders() })
          .then(res => res.ok ? res.json() : { has_fiscal_config: false })
          .then(data => setHasFiscalConfig(data.has_fiscal_config === true))
          .catch(() => setHasFiscalConfig(false));
      }
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Erro ao processar venda');
    } finally {
      setProcessing(false);
    }
  };

  if (!isAuthenticated) return null;

  const handlePrintBalcao = async () => {
    if (!confirmationSale) return;
    const html = buildReceiptHtml(confirmationSale.data);
    const fileName = `cupom_balcao_${confirmationSale.saleNumber}`;
    const electronAPI = window.electronAPI;
    if (electronAPI?.printBalcaoReceipt) {
      await electronAPI.printBalcaoReceipt({ html, fileName });
    } else if (electronAPI?.printReceipt) {
      await electronAPI.printReceipt({ html, fileName });
    } else {
      const printWindow = window.open('', '_blank');
      if (printWindow) {
        printWindow.document.write(html);
        printWindow.print();
      }
    }
  };

  const handlePrintFiscal = async () => {
    if (!confirmationSale) return;
    setProcessing(true);

    const saleId = confirmationSale.id;
    const headers = authHeaders();

    try {
      // Check if fiscal document already exists and is authorized
      const statusResponse = await fetch(`/api/v1/sales/${saleId}/fiscal-status/`, { headers });

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
          const electronAPI = window.electronAPI;
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

      // No existing doc or not authorized — request new emission
      const requestResponse = await fetch(`/api/v1/sales/${saleId}/request-fiscal/`, {
        method: 'POST',
        headers: { ...headers, 'Idempotency-Key': crypto.randomUUID() },
      });

      const requestData = await requestResponse.json();

      if (!requestResponse.ok) {
        setError(requestData.detail || 'Erro ao solicitar emissão fiscal.');
        return;
      }

      const fiscalStatus = requestData.fiscal_status;
      const errorDetail = requestData.error_detail || '';

      if (fiscalStatus === 'FAILED' || fiscalStatus === 'REJECTED') {
        setError(`Emissão fiscal falhou: ${errorDetail || 'erro desconhecido'}`);
      } else if (fiscalStatus === 'CONCLUDED') {
        setConfirmationSale(null);
        setError('');
      } else if (fiscalStatus === 'PROCESSING') {
        setError('Emissão fiscal em processamento. Acompanhe o status no histórico de vendas.');
      } else {
        setError('Emissão fiscal solicitada. Acompanhe o status no histórico de vendas.');
      }
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Erro de rede ao solicitar emissão fiscal.');
    } finally {
      setProcessing(false);
    }
  };

  return (
    <div style={{ display: 'flex', height: '100vh', flexDirection: 'column' }}>
      {/* Header */}
      <header style={{
        background: '#fff', borderBottom: '1px solid #e0e0e0', padding: '16px 24px',
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        position: 'sticky', top: 0, zIndex: 100
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <h1 style={{ fontSize: '1.25rem', fontWeight: 600, color: '#1976d2' }}>TJSys PDV</h1>
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginLeft: '24px', paddingLeft: '24px', borderLeft: '1px solid #e0e0e0' }}>
            <span style={{ fontSize: '0.875rem', color: '#757575' }}>Caixa: </span>
            <strong>{session.status === 'open' ? 'ABERTO' : 'FECHADO'}</strong>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <span style={{ fontSize: '0.875rem', color: '#757575' }}>
            {localStorage.getItem('branch_id') ? `Filial: ${localStorage.getItem('branch_id')}` : ''}
          </span>
          {session.status === 'open' && (
            <Link to="/cash-session">
              <Button variant="danger">Fechar Caixa</Button>
            </Link>
          )}
          <Button variant="secondary" onClick={() => navigate('/dashboard')}>Dashboard</Button>
        </div>
      </header>

      <main style={{ flex: 1, padding: '24px', overflow: 'auto' }}>
        {error && (
          <div style={{
            background: '#fce4ec', border: '1px solid #ef9a9a', borderRadius: '8px',
            padding: '16px', marginBottom: '24px', display: 'flex',
            justifyContent: 'space-between', alignItems: 'center'
          }}>
            <span style={{ color: '#c62828' }}>{error}</span>
            <button onClick={() => setError('')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#c62828', fontSize: '1.25rem' }}>x</button>
          </div>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 400px', gap: '24px', height: 'calc(100vh - 200px)', minHeight: '600px' }}>
          {/* Left Panel */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {/* Product Search */}
            <Card style={{ padding: '24px', position: 'relative' }}>
              <h3 style={{ marginBottom: '16px', fontSize: '1rem', fontWeight: 600 }}>Adicionar Produtos</h3>
              <Input
                placeholder="Buscar produto (SKU ou nome)..."
                value={searchQuery}
                onChange={(e) => handleSearchChange(e.target.value)}
              />
              {showSearch && searchResults.length > 0 && (
                <div style={{
                  position: 'absolute', zIndex: 10, left: '24px', right: '24px',
                  background: '#fff', border: '1px solid #e0e0e0', borderRadius: '8px',
                  boxShadow: '0 4px 12px rgba(0,0,0,0.15)', maxHeight: '300px', overflowY: 'auto'
                }}>
                  {searchResults.slice(0, 10).map((product: any) => (
                    <div key={product.id} onClick={() => handleProductSelect(product)}
                      style={{ padding: '12px 16px', cursor: 'pointer', borderBottom: '1px solid #f0f0f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div>
                        <div style={{ fontWeight: 500, fontSize: '0.875rem' }}>{product.name}</div>
                        <div style={{ fontSize: '0.75rem', color: '#757575' }}>SKU: {product.sku}</div>
                      </div>
                      <div style={{ fontWeight: 600, color: '#1976d2', fontSize: '0.875rem' }}>
                        {parseProductPrice(product.price) === null
                          ? 'Sem preço'
                          : `R$ ${parseProductPrice(product.price)!.toFixed(2)}`}
                      </div>
                    </div>
                  ))}
                  {searchResults.length > 10 && (
                    <div style={{ padding: '12px', textAlign: 'center', color: '#757575', fontSize: '0.875rem' }}>
                      Mostrando 10 de {searchResults.length} resultados
                    </div>
                  )}
                </div>
              )}
            </Card>

            {/* Cart */}
            <Card style={{ flex: 1, display: 'flex', flexDirection: 'column', padding: '24px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 600 }}>Carrinho ({items.length})</h3>
                {items.length > 0 && (
                  <Button variant="secondary" size="sm" onClick={() => setItems([])}>Limpar</Button>
                )}
              </div>

              {items.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '48px 24px', color: '#757575' }}>
                  <p style={{ margin: 0, fontSize: '0.875rem' }}>Carrinho vazio</p>
                  <p style={{ margin: '8px 0 0', fontSize: '0.75rem', color: '#9e9e9e' }}>Busque e adicione produtos acima</p>
                </div>
              ) : (
                <div style={{ flex: 1, overflowY: 'auto', marginBottom: '16px' }}>
                  {items.map((item, index) => (
                    <div key={index} style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '12px', borderBottom: '1px solid #f0f0f0' }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: 500, fontSize: '0.875rem', marginBottom: '4px' }}>{item.product.name}</div>
                        <div style={{ display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap' }}>
                          <span style={{ fontSize: '0.75rem', color: '#757575' }}>
                            Qtd: {formatQuantity(item.quantity, quantityOptionsForProduct(item.product))}
                          </span>
                          <input type="number" min="1" value={item.quantity}
                            onChange={(e) => updateItemQuantity(index, parseFloat(e.target.value) || 1)}
                            style={{ width: '60px', padding: '4px 8px', fontSize: '0.875rem' }} />
                          <span style={{ fontSize: '0.75rem', color: '#757575' }}>Desc:</span>
                          <input type="number" min="0" step="0.01" value={item.discount.toFixed(2)}
                            onChange={(e) => updateItemDiscount(index, parseFloat(e.target.value) || 0)}
                            style={{ width: '80px', padding: '4px 8px', fontSize: '0.875rem' }} />
                        </div>
                      </div>
                      <div style={{ fontWeight: 600, fontSize: '0.875rem', color: '#1976d2', whiteSpace: 'nowrap' }}>
                        R$ {item.lineTotal.toFixed(2)}
                      </div>
                      <button onClick={() => removeItem(index)}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#c62828', padding: '4px' }}>
                        X
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          </div>

          {/* Right Panel - Payment */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <Card style={{ padding: '24px' }}>
              <h3 style={{ marginBottom: '16px', fontSize: '1rem', fontWeight: 600 }}>Pagamento</h3>

              {/* Method selector */}
              <div style={{ display: 'flex', gap: '8px', marginBottom: '16px', flexWrap: 'wrap' }}>
                {(['cash', 'pix', 'card_debit', 'card_credit'] as const).map(method => (
                  <label key={method} style={{
                    display: 'flex', alignItems: 'center', gap: '8px', padding: '12px 16px',
                    border: `2px solid ${pendingMethod === method ? '#1976d2' : '#e0e0e0'}`,
                    borderRadius: '8px', cursor: 'pointer',
                    background: pendingMethod === method ? '#e3f2fd' : '#fff',
                    transition: 'all 0.2s'
                  }}>
                    <input type="radio" name="pendingMethod" value={method}
                      checked={pendingMethod === method}
                      onChange={() => {
                        setPendingMethod(method);
                        if (method !== 'cash') {
                          setPendingReceived('');
                        } else {
                          setPendingAmount('');
                          setPendingReceived('');
                        }
                      }}
                      style={{ display: 'none' }} />
                    <span style={{ fontWeight: 500, color: pendingMethod === method ? '#1976d2' : '#333' }}>
                      {methodLabels[method]}
                    </span>
                  </label>
                ))}
              </div>

              {/* Dinheiro: received + change */}
              {isCash ? (
                <div style={{ marginBottom: '16px' }}>
                  <div style={{ marginBottom: '12px' }}>
                    <label style={{ display: 'block', fontSize: '0.75rem', color: '#757575', marginBottom: '4px' }}>
                      Valor recebido
                    </label>
                    <input type="number" step="0.01" min="0" value={pendingReceived}
                      onChange={(e) => {
                        setPendingReceived(e.target.value);
                        const r = parseFloat(e.target.value) || 0;
                        if (r > 0) {
                          const eff = Math.min(r, remaining);
                          setPendingAmount(eff.toFixed(2));
                        } else {
                          setPendingAmount('');
                        }
                      }}
                      placeholder="0,00"
                      style={{ width: '100%', padding: '12px 16px', fontSize: '1rem', border: '1px solid #e0e0e0', borderRadius: '8px' }} />
                  </div>
                  <div style={{
                    padding: '12px', borderRadius: '8px', textAlign: 'center',
                    backgroundColor: changePreview > 0 ? '#e8f5e9' : '#f5f5f5',
                    color: changePreview > 0 ? '#2e7d32' : '#757575',
                    fontWeight: 600, fontSize: '1.125rem', marginBottom: '12px'
                  }}>
                    Troco: R$ {changePreview.toFixed(2)}
                  </div>
                  {remaining > 0 && (
                    <div style={{ textAlign: 'center', color: '#e65100', fontSize: '0.8rem', marginBottom: '8px' }}>
                      Falta receber: R$ {remaining.toFixed(2)}
                    </div>
                  )}
                </div>
              ) : (
                /* PIX / Cartao: auto-filled amount */
                <div style={{ marginBottom: '16px' }}>
                  <div style={{
                    padding: '16px', borderRadius: '8px', textAlign: 'center',
                    backgroundColor: '#e3f2fd', color: '#1976d2', fontWeight: 700,
                    fontSize: '1.5rem', marginBottom: '8px'
                  }}>
                    R$ {pendingNum.toFixed(2)}
                  </div>
                  <div style={{ textAlign: 'center', fontSize: '0.8rem', color: '#757575', marginBottom: '8px' }}>
                    {pendingMethod === 'pix' ? 'Valor do PIX' : 'Valor da venda no cartão'}
                  </div>
                  {remaining > 0 && (
                    <div style={{ textAlign: 'center', color: '#e65100', fontSize: '0.8rem', marginBottom: '8px' }}>
                      Falta receber: R$ {remaining.toFixed(2)}
                    </div>
                  )}
                </div>
              )}

              {/* Reference */}
              <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', fontSize: '0.75rem', color: '#757575', marginBottom: '4px' }}>Referência</label>
                <input type="text" value={pendingReference}
                  onChange={(e) => setPendingReference(e.target.value)} placeholder="Opcional"
                  style={{ width: '100%', padding: '12px 16px', border: '1px solid #e0e0e0', borderRadius: '8px', fontSize: '1rem' }} />
              </div>

              <Button variant="primary" fullWidth onClick={addPayment}
                disabled={!(isCash ? receivedNum > 0 : remaining > 0)}
                title={!isCash && remaining <= 0 ? 'Valor já totalmente recebido' : ''}>
                Adicionar Pagamento
              </Button>

              {/* Payment list */}
              {payments.length > 0 && (
                <div style={{ marginTop: '16px', paddingTop: '16px', borderTop: '1px solid #f0f0f0' }}>
                  <h4 style={{ margin: '0 0 12px', fontSize: '0.875rem', fontWeight: 600 }}>Pagamentos</h4>
                  {payments.map((payment, index) => {
                    const pMethod = methodLabels[payment.method] || payment.method;
                    return (
                      <div key={index} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px', background: '#fafafa', borderRadius: '8px', marginBottom: '8px' }}>
                        <div>
                          <div style={{ fontWeight: 500, fontSize: '0.875rem' }}>{pMethod}</div>
                          {payment.reference && <div style={{ fontSize: '0.75rem', color: '#757575' }}>Ref: {payment.reference}</div>}
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                          <span style={{ fontWeight: 600, color: '#1976d2' }}>R$ {payment.amount.toFixed(2)}</span>
                          <button onClick={() => removePayment(index)}
                            style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#c62828' }}>X</button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </Card>

            {/* Totals + Confirm */}
            <Card style={{ padding: '24px', background: '#f5f5f5' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: '#757575' }}>Subtotal</span>
                  <span style={{ fontWeight: 500 }}>R$ {grossTotal.toFixed(2)}</span>
                </div>
                {discountTotal > 0 && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', color: '#c62828' }}>
                    <span>Desconto</span>
                    <span style={{ fontWeight: 500 }}>-R$ {discountTotal.toFixed(2)}</span>
                  </div>
                )}
                <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px solid #e0e0e0', paddingTop: '8px', marginTop: '8px' }}>
                  <span style={{ fontSize: '1.125rem', fontWeight: 600 }}>Total da venda</span>
                  <span style={{ fontSize: '1.125rem', fontWeight: 700, color: '#1976d2' }}>R$ {netTotal.toFixed(2)}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: '8px' }}>
                  <span>Total recebido</span>
                  <span style={{ fontWeight: 600, color: paymentTotal >= netTotal ? '#2e7d32' : '#c62828' }}>
                    R$ {paymentTotal.toFixed(2)}
                  </span>
                </div>
                {remaining > 0 && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', color: '#e65100', fontWeight: 600 }}>
                    <span>Falta receber</span>
                    <span>R$ {remaining.toFixed(2)}</span>
                  </div>
                )}
                {paymentTotal > netTotal && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', color: '#2e7d32', fontWeight: 600, borderTop: '1px dashed #e0e0e0', paddingTop: '8px' }}>
                    <span>Troco</span>
                    <span>R$ {(paymentTotal - netTotal).toFixed(2)}</span>
                  </div>
                )}
              </div>

              <Button variant="primary" fullWidth size="lg" onClick={handleSubmit}
                disabled={processing || !isConfirmEnabled}
                style={{ marginTop: '24px', fontSize: '1rem', padding: '16px' }}>
                {processing ? 'Processando...'
                  : items.length === 0 ? 'Adicione itens ao carrinho'
                  : payments.length === 0 ? 'Adicione um pagamento'
                  : remaining > 0 ? `Falta R$ ${remaining.toFixed(2)}`
                  : 'Confirmar Venda'}
              </Button>
            </Card>
          </div>
        </div>
      </main>

      {confirmationSale && (
        <SaleConfirmationToast
          saleId={confirmationSale.id}
          saleNumber={confirmationSale.saleNumber}
          hasFiscalConfig={hasFiscalConfig}
          onPrintFiscal={handlePrintFiscal}
          onPrintBalcao={handlePrintBalcao}
          onClose={() => setConfirmationSale(null)}
        />
      )}
    </div>
  );
}
