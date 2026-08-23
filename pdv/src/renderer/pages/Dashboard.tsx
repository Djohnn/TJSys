import { useEffect, useState, useRef, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useCashSession } from '../contexts/CashSessionContext';
import { Card, Button, CardContent, EmptyState, Spinner } from '../components/ui';
import { buildReceiptHtml } from '../utils/receipt';

const API_BASE = '/api/v1';

function authHeaders(): Record<string, string> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  const token = localStorage.getItem('access_token');
  if (token) headers.Authorization = `Bearer ${token}`;
  const tenantId = localStorage.getItem('tenant_id');
  if (tenantId) headers['X-Tenant-ID'] = tenantId;
  return headers;
}

export function Dashboard() {
  const { branchId } = useAuth();
  const { session, refreshSession } = useCashSession();
  const [loading, setLoading] = useState(true);
  const [recentSales, setRecentSales] = useState<any[]>([]);
  const [menuSaleId, setMenuSaleId] = useState<string | null>(null);
  const [reprinting, setReprinting] = useState<string | null>(null);
  const [reprintMessage, setReprintMessage] = useState<string>('');
  const [fiscalStatuses, setFiscalStatuses] = useState<Record<string, any>>({});
  const menuRef = useRef<HTMLDivElement | null>(null);

  const loadRecentSales = async () => {
    if (!branchId || !session.sessionId) {
      setRecentSales([]);
      return;
    }

    try {
      const response = await fetch(
        `${API_BASE}/sales/?branch=${branchId}&cash_session=${session.sessionId}`,
        { headers: authHeaders() },
      );
      if (!response.ok) {
        setRecentSales([]);
        return;
      }
      const data = await response.json();
      setRecentSales(Array.isArray(data) ? data : data.results ?? []);
    } catch {
      setRecentSales([]);
    }
  };

  useEffect(() => {
    const init = async () => {
      await refreshSession();
      setLoading(false);
    };
    init();
  }, []);

  useEffect(() => {
    if (!loading) {
      loadRecentSales();
    }
  }, [loading, branchId, session.sessionId]);

  useEffect(() => {
    if (!menuSaleId) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuSaleId(null);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [menuSaleId]);

  useEffect(() => {
    if (!recentSales.length) return;
    const fetchStatuses = async () => {
      const headers = authHeaders();
      const results: Record<string, any> = {};
      const batch = recentSales.slice(0, 20);
      await Promise.all(
        batch.map(async (sale: any) => {
          try {
            const resp = await fetch(`/api/v1/sales/${sale.id}/fiscal-status/`, { headers });
            if (resp.ok) {
              const data = await resp.json();
              results[sale.id] = data;
            }
          } catch {
            // ignore network errors
          }
        }),
      );
      setFiscalStatuses(results);
    };
    fetchStatuses();
  }, [recentSales]);

  const handleReprint = useCallback(async (saleId: string, type: 'fiscal' | 'balcao') => {
    setMenuSaleId(null);
    setReprinting(saleId);
    setReprintMessage('');
    try {
      const electronAPI = window.electronAPI;
      const detailResult = await electronAPI.getSaleDetail(saleId);
      if (!detailResult?.success) {
        setReprintMessage(`Erro ao buscar venda: ${detailResult?.error || 'falha desconhecida'}`);
        return;
      }
      const sale = detailResult.data;

      const itemsWithNames = await Promise.all(
        (sale.items || []).map(async (item: any) => {
          if (typeof item.product === 'object' && item.product?.name) return item;
          const productResult = await electronAPI.getProduct(item.product);
          return {
            ...item,
            product: { name: productResult?.success ? productResult.data?.name : 'Produto' },
          };
        }),
      );

      let html: string;
      const label = type === 'fiscal' ? 'fiscal' : 'balcao';
      const fileName = `cupom_${label}_${String(sale.id).slice(0, 8)}`;

      if (type === 'fiscal') {
        let fiscalInfo = {};
        try {
          const statusResp = await fetch(`/api/v1/sales/${saleId}/fiscal-status/`, { headers: authHeaders() });
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
        ? electronAPI.printFiscalReceipt
        : electronAPI.printBalcaoReceipt;
      const fallbackPrint = electronAPI.printReceipt;

      const printResult = await (printFn || fallbackPrint)({ html, fileName });
      if (printResult?.success) {
        setReprintMessage(`Cupom reimpresso e salvo em: ${printResult.savedPath}`);
      } else {
        setReprintMessage(`Falha na impressão: ${printResult?.error || 'erro desconhecido'}`);
      }
    } catch (e) {
      setReprintMessage(`Erro: ${e instanceof Error ? e.message : 'falha desconhecida'}`);
    } finally {
      setReprinting(null);
    }
  }, []);

  const handleRequestFiscal = useCallback(async (saleId: string) => {
    setMenuSaleId(null);
    setReprintMessage('');
    try {
      const resp = await fetch(`/api/v1/sales/${saleId}/request-fiscal/`, {
        method: 'POST',
        headers: { ...authHeaders(), 'Idempotency-Key': crypto.randomUUID() },
      });
      const data = await resp.json();
      if (!resp.ok) {
        setReprintMessage(`❌ ${data.detail || 'Erro ao solicitar emissão fiscal.'}`);
        return;
      }
      const fiscalStatus = data.fiscal_status;
      const errorDetail = data.error_detail || '';
      if (fiscalStatus === 'FAILED' || fiscalStatus === 'REJECTED') {
        setReprintMessage(`❌ Emissão fiscal falhou: ${errorDetail || 'erro desconhecido'}`);
      } else if (fiscalStatus === 'CONCLUDED') {
        setReprintMessage('✅ Documento fiscal autorizado com sucesso!');
      } else if (fiscalStatus === 'PROCESSING') {
        setReprintMessage('⏳ Emissão fiscal em processamento no provedor...');
      } else {
        setReprintMessage('⏳ Emissão fiscal solicitada. Aguarde o processamento...');
      }
    } catch (error) {
      setReprintMessage('❌ Erro de rede ao solicitar emissão fiscal.');
    }
  }, []);

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '400px' }}>
        <Spinner size="lg" />
      </div>
    );
  }

  return (
    <div style={{ padding: '24px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
        <div>
          <h1 style={{ fontSize: '1.5rem', fontWeight: 600, marginBottom: '4px' }}>Dashboard</h1>
          <p style={{ color: '#757575', fontSize: '0.875rem' }}>
            {session.sessionId ? `Caixa ${session.status === 'open' ? 'aberto' : 'fechado'}` : 'Nenhum caixa aberto'}
          </p>
        </div>
        <div style={{ display: 'flex', gap: '12px' }}>
          {session.sessionId ? (
            <Link to="/cash-session"><Button variant="danger">Fechar Caixa</Button></Link>
          ) : (
            <Link to="/cash-session"><Button variant="outline">Abrir Caixa</Button></Link>
          )}
          <Link to="/sale"><Button>Nova Venda</Button></Link>
        </div>
      </div>

      {session.sessionId ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '16px', marginBottom: '24px' }}>
          <Card><CardContent>
            <div style={{ fontSize: '0.875rem', color: '#757575', marginBottom: '4px' }}>Abertura</div>
            <div style={{ fontSize: '1.5rem', fontWeight: 600 }}>{session.openingAmount}</div>
            <div style={{ fontSize: '0.75rem', color: '#757575', marginTop: '4px' }}>Valor de abertura</div>
          </CardContent></Card>
          <Card><CardContent>
            <div style={{ fontSize: '0.875rem', color: '#757575', marginBottom: '4px' }}>Esperado</div>
            <div style={{ fontSize: '1.5rem', fontWeight: 600 }}>{session.expectedAmount}</div>
            <div style={{ fontSize: '0.75rem', color: '#757575', marginTop: '4px' }}>Valor esperado no caixa</div>
          </CardContent></Card>
          <Card><CardContent>
            <div style={{ fontSize: '0.875rem', color: '#757575', marginBottom: '4px' }}>Vendas</div>
            <div style={{ fontSize: '1.5rem', fontWeight: 600 }}>{session.salesCount || 0}</div>
            <div style={{ fontSize: '0.75rem', color: '#757575', marginTop: '4px' }}>Vendas realizadas</div>
          </CardContent></Card>
          <Card><CardContent>
            <div style={{ fontSize: '0.875rem', color: '#757575', marginBottom: '4px' }}>Total Vendido</div>
            <div style={{ fontSize: '1.5rem', fontWeight: 600 }}>{session.totalSales}</div>
            <div style={{ fontSize: '0.75rem', color: '#757575', marginTop: '4px' }}>Total em vendas</div>
          </CardContent></Card>
        </div>
      ) : (
        <Card style={{ padding: '48px 24px', textAlign: 'center' }}>
          <EmptyState
            icon={<svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <rect x="4" y="2" width="16" height="20" rx="2"/><path d="M4 10h16"/><path d="M8 14h8"/><path d="M12 18h4"/>
            </svg>}
            title="Nenhum caixa aberto"
            description="Abra o caixa para começar a vender"
            action={{ label: 'Abrir Caixa', onClick: () => window.location.href = '/cash-session' }}
          />
        </Card>
      )}

      <section style={{ marginTop: '24px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
          <h2 style={{ fontSize: '1.125rem', fontWeight: 600 }}>Vendas Recentes</h2>
        </div>

        {reprintMessage && (
          <div
            role="status"
            data-testid="reprint-message"
            style={{
              padding: '12px 16px',
              marginBottom: '12px',
              borderRadius: '8px',
              background: reprintMessage.startsWith('Erro') || reprintMessage.startsWith('Falha') ? '#fce4ec' : '#e8f5e9',
              color: reprintMessage.startsWith('Erro') || reprintMessage.startsWith('Falha') ? '#c62828' : '#2e7d32',
              fontSize: '0.875rem',
            }}
          >
            {reprintMessage}
          </div>
        )}

        {recentSales.length > 0 ? (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ textAlign: 'left', borderBottom: '1px solid #e0e0e0' }}>
                  <th style={{ padding: '12px 16px', fontWeight: 600, fontSize: '0.75rem', color: '#757575', textTransform: 'uppercase' }}>Venda</th>
                  <th style={{ padding: '12px 16px', fontWeight: 600, fontSize: '0.75rem', color: '#757575', textTransform: 'uppercase' }}>Cliente</th>
                  <th style={{ padding: '12px 16px', textAlign: 'right', fontWeight: 600, fontSize: '0.75rem', color: '#757575', textTransform: 'uppercase' }}>Total</th>
                  <th style={{ padding: '12px 16px', textAlign: 'center', fontWeight: 600, fontSize: '0.75rem', color: '#757575', textTransform: 'uppercase' }}>Status</th>
                  <th style={{ padding: '12px 16px', fontWeight: 600, fontSize: '0.75rem', color: '#757575', textTransform: 'uppercase' }}>Hora</th>
                  <th style={{ padding: '12px 16px', textAlign: 'center', fontWeight: 600, fontSize: '0.75rem', color: '#757575', textTransform: 'uppercase' }}>Ações</th>
                </tr>
              </thead>
              <tbody>
                {recentSales.slice(0, 5).map((sale: any) => (
                  <tr key={sale.id} style={{ borderBottom: '1px solid #f5f5f5' }}>
                    <td style={{ padding: '12px 16px', fontSize: '0.875rem' }}>
                        #{sale.id.slice(0, 8)}
                        {fiscalStatuses[sale.id] && (
                          <span style={{
                            display: 'inline-block',
                            padding: '2px 8px',
                            borderRadius: '10px',
                            fontSize: '0.65rem',
                            fontWeight: 600,
                            marginLeft: '8px',
                            backgroundColor: fiscalStatuses[sale.id].fiscal_status === 'CONCLUDED' ? '#e8f5e9' :
                                             fiscalStatuses[sale.id].fiscal_status === 'REJECTED' ? '#fce4ec' : '#fff3e0',
                            color: fiscalStatuses[sale.id].fiscal_status === 'CONCLUDED' ? '#2e7d32' :
                                   fiscalStatuses[sale.id].fiscal_status === 'REJECTED' ? '#c62828' : '#e65100',
                          }}>
                            {fiscalStatuses[sale.id].fiscal_status === 'CONCLUDED' ? 'NFC-e' :
                             fiscalStatuses[sale.id].fiscal_status === 'REJECTED' ? 'Rejeitado' : 'Pendente'}
                          </span>
                        )}
                    </td>
                    <td style={{ padding: '12px 16px', fontSize: '0.875rem' }}>{sale.customer || 'Consumidor final'}</td>
                    <td style={{ padding: '12px 16px', textAlign: 'right', fontSize: '0.875rem', fontWeight: 600 }} data-testid={`sale-total-${sale.id}`}>{sale.net_total}</td>
                    <td style={{ padding: '12px 16px', textAlign: 'center' }}>
                      <span style={{
                        padding: '4px 8px', borderRadius: '12px', fontSize: '0.75rem', fontWeight: 500,
                        backgroundColor: sale.status === 'confirmed' ? '#e8f5e9' : sale.status === 'cancelled' ? '#fce4ec' : '#fff3e0',
                        color: sale.status === 'confirmed' ? '#2e7d32' : sale.status === 'cancelled' ? '#c62828' : '#f57c00'
                      }}>
                        {sale.status === 'confirmed' ? 'Confirmada' : sale.status === 'cancelled' ? 'Cancelada' : 'Pendente'}
                      </span>
                    </td>
                    <td style={{ padding: '12px 16px', fontSize: '0.875rem', color: '#757575' }}>
                      {new Date(sale.created_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                    </td>
                    <td style={{ padding: '12px 16px', textAlign: 'center', position: 'relative' }}>
                      <button
                        type="button"
                        aria-label={`Ações da venda ${sale.id.slice(0, 8)}`}
                        data-testid={`sale-actions-${sale.id}`}
                        onClick={(e) => {
                          e.stopPropagation();
                          setMenuSaleId(menuSaleId === sale.id ? null : sale.id);
                        }}
                        disabled={reprinting === sale.id}
                        style={{
                          background: 'none',
                          border: 'none',
                          cursor: reprinting === sale.id ? 'wait' : 'pointer',
                          padding: '4px 8px',
                          fontSize: '1rem',
                          color: '#757575',
                          borderRadius: '4px',
                          lineHeight: 1,
                        }}
                        title={reprinting === sale.id ? 'Reimprimindo...' : 'Mais ações'}
                      >
                        {reprinting === sale.id ? '...' : '⋮'}
                      </button>
                      {menuSaleId === sale.id && (
                        <div
                          ref={menuRef}
                          data-testid={`sale-menu-${sale.id}`}
                          style={{
                            position: 'absolute',
                            right: '16px',
                            top: '40px',
                            zIndex: 50,
                            background: '#fff',
                            border: '1px solid #e0e0e0',
                            borderRadius: '8px',
                            boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
                            minWidth: '180px',
                            overflow: 'hidden',
                          }}
                        >
                          <button
                            type="button"
                            onClick={() => handleReprint(sale.id, 'balcao')}
                            style={{
                              display: 'block',
                              width: '100%',
                              padding: '12px 16px',
                              background: 'none',
                              border: 'none',
                              textAlign: 'left',
                              cursor: 'pointer',
                              fontSize: '0.875rem',
                              color: '#1976d2',
                            }}
                          >
                            Reimprimir Cupom Balcão
                          </button>
                          {fiscalStatuses[sale.id]?.fiscal_status === 'CONCLUDED' ? (
                            <button
                              type="button"
                              onClick={() => handleReprint(sale.id, 'fiscal')}
                              style={{
                                display: 'block',
                                width: '100%',
                                padding: '12px 16px',
                                background: 'none',
                                border: 'none',
                                textAlign: 'left',
                                cursor: 'pointer',
                                fontSize: '0.875rem',
                                color: '#1976d2',
                              }}
                            >
                              Reimprimir Cupom Fiscal
                            </button>
                          ) : fiscalStatuses[sale.id]?.fiscal_status === 'PENDING' || fiscalStatuses[sale.id]?.fiscal_status === 'PROCESSING' ? (
                            <button
                              type="button"
                              disabled
                              style={{
                                display: 'block',
                                width: '100%',
                                padding: '12px 16px',
                                background: 'none',
                                border: 'none',
                                textAlign: 'left',
                                fontSize: '0.875rem',
                                color: '#9e9e9e',
                                cursor: 'not-allowed',
                              }}
                            >
                              Emissão NFC-e em andamento...
                            </button>
                          ) : fiscalStatuses[sale.id]?.fiscal_status === 'REJECTED' ? (
                            <>
                              <button
                                type="button"
                                disabled
                                style={{
                                  display: 'block',
                                  width: '100%',
                                  padding: '12px 16px',
                                  background: 'none',
                                  border: 'none',
                                  textAlign: 'left',
                                  fontSize: '0.875rem',
                                  color: '#c62828',
                                  cursor: 'not-allowed',
                                }}
                              >
                                NFC-e rejeitada: {fiscalStatuses[sale.id]?.error_detail}
                              </button>
                              <button
                                type="button"
                                onClick={() => handleRequestFiscal(sale.id)}
                                style={{
                                  display: 'block',
                                  width: '100%',
                                  padding: '12px 16px',
                                  background: 'none',
                                  border: 'none',
                                  textAlign: 'left',
                                  cursor: 'pointer',
                                  fontSize: '0.875rem',
                                  color: '#1976d2',
                                }}
                              >
                                Tentar novamente
                              </button>
                            </>
                          ) : (
                            <button
                              type="button"
                              onClick={() => handleRequestFiscal(sale.id)}
                              style={{
                                display: 'block',
                                width: '100%',
                                padding: '12px 16px',
                                background: 'none',
                                border: 'none',
                                textAlign: 'left',
                                cursor: 'pointer',
                                fontSize: '0.875rem',
                                color: '#1976d2',
                              }}
                            >
                              Solicitar Cupom Fiscal
                            </button>
                          )}
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <Card style={{ padding: '48px 24px', textAlign: 'center' }}>
            <EmptyState
              icon={<svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7h16v10l-8 4m0-10L4 7m0 10l8 4"/>
              </svg>}
              title="Nenhuma venda registrada"
              description="Faça sua primeira venda do dia"
            />
          </Card>
        )}
      </section>
    </div>
  );
}
