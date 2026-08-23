import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useCashSession } from '../contexts/CashSessionContext';
import { Card, CardHeader, CardContent, Button, InputGroup, Spinner } from '../components/ui';

const methodLabels: Record<string, string> = {
  cash: 'Dinheiro',
  pix: 'Pix',
  card_external: 'Cartão',
  card_integrated: 'Cartão',
  card_debit: 'Cartão Débito',
  card_credit: 'Cartão Crédito',
  debit: 'Débito',
  credit: 'Crédito',
  voucher: 'Vale',
};

function fmtBR(iso: string) {
  const d = new Date(iso);
  return d.toLocaleDateString('pt-BR', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

function DiffTag({ value }: { value: string }) {
  const n = parseFloat(value);
  if (n === 0) return null;
  return (
    <span style={{
      display: 'inline-block', padding: '2px 10px', borderRadius: '12px',
      fontSize: '0.8rem', fontWeight: 700,
      backgroundColor: n > 0 ? '#fff3e0' : '#fce4ec',
      color: n > 0 ? '#e65100' : '#c62828',
    }}>
      {n > 0 ? `+R$ ${value} (Sobra)` : `-R$ ${Math.abs(n).toFixed(2)} (Falta)`}
    </span>
  );
}

export function CashSession() {
  const { isAuthenticated } = useAuth();
  const { session, closeReport, openSession, closeSession, refreshSession, clearCloseReport } = useCashSession();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [openingAmount, setOpeningAmount] = useState('');
  const [closingAmount, setClosingAmount] = useState('');
  const [error, setError] = useState('');
  const [showCloseModal, setShowCloseModal] = useState(false);
  const [showReportModal, setShowReportModal] = useState(false);

  useEffect(() => {
    if (!isAuthenticated) {
      navigate('/login');
      return;
    }
    refreshSession();
    setLoading(false);
  }, [isAuthenticated, navigate]);

  useEffect(() => {
    if (closeReport) {
      setShowReportModal(true);
    }
  }, [closeReport]);

  useEffect(() => {
    const style = document.createElement('style');
    style.id = 'cash-report-print-style';
    style.textContent = printStyles;
    document.head.appendChild(style);
    return () => { const el = document.getElementById('cash-report-print-style'); if (el) el.remove(); };
  }, []);

  const handleOpen = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!openingAmount || parseFloat(openingAmount) <= 0) {
      setError('Informe um valor de abertura válido');
      return;
    }
    try {
      const result = await openSession(localStorage.getItem('branch_id') || '', openingAmount);
      if (result.success) {
        navigate('/dashboard');
      } else {
        setError(result.error || 'Erro ao abrir caixa');
      }
    } catch {
      setError('Erro ao abrir caixa');
    }
  };

  const handleClose = async () => {
    if (!closingAmount || parseFloat(closingAmount) <= 0) {
      setError('Informe um valor de fechamento válido');
      return;
    }
    try {
      const result = await closeSession(closingAmount);
      if (result.success) {
        setShowCloseModal(false);
        setClosingAmount('');
      } else {
        setError(result.error || 'Erro ao fechar caixa');
      }
    } catch {
      setError('Erro ao fechar caixa');
    }
  };

  const handleCloseReport = () => {
    setShowReportModal(false);
    clearCloseReport();
  };

  const handlePrintReport = () => {
    window.print();
  };

  if (!isAuthenticated) return null;

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '400px' }}>
        <Spinner size="lg" />
      </div>
    );
  }

  return (
    <div style={{ padding: '24px', minHeight: '100vh' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
        <div>
          <h1 style={{ fontSize: '1.5rem', fontWeight: 600, marginBottom: '4px' }}>Gestão de Caixa</h1>
          <p style={{ color: '#757575', fontSize: '0.875rem' }}>
            {session.sessionId ? `Caixa ${session.status === 'open' ? 'aberto' : 'fechado'}` : 'Nenhum caixa aberto'}
          </p>
        </div>
        <div style={{ display: 'flex', gap: '12px' }}>
          <Link to="/dashboard"><Button variant="secondary">Dashboard</Button></Link>
          <Link to="/sale"><Button>Nova Venda</Button></Link>
        </div>
      </div>

      {session.sessionId ? (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '16px', marginBottom: '24px' }}>
            <Card>
              <CardHeader><h3 style={{ margin: 0, fontSize: '0.875rem', color: '#757575', fontWeight: 500 }}>Status</h3></CardHeader>
              <CardContent>
                <span style={{
                  display: 'inline-flex', alignItems: 'center', gap: '8px', padding: '8px 16px',
                  borderRadius: '20px', fontSize: '0.875rem', fontWeight: 600,
                  backgroundColor: session.status === 'open' ? '#e8f5e9' : '#fce4ec',
                  color: session.status === 'open' ? '#2e7d32' : '#c62828'
                }}>
                  {session.status === 'open' ? 'Aberto' : 'Fechado'}
                </span>
              </CardContent>
            </Card>
            <Card>
              <CardHeader><h3 style={{ margin: 0, fontSize: '0.875rem', color: '#757575', fontWeight: 500 }}>Abertura</h3></CardHeader>
              <CardContent>
                <div style={{ fontSize: '1.5rem', fontWeight: 600 }}>{session.openingAmount}</div>
                <div style={{ fontSize: '0.75rem', color: '#757575', marginTop: '4px' }}>Valor de abertura</div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader><h3 style={{ margin: 0, fontSize: '0.875rem', color: '#757575', fontWeight: 500 }}>Esperado</h3></CardHeader>
              <CardContent>
                <div style={{ fontSize: '1.5rem', fontWeight: 600 }}>{session.expectedAmount}</div>
                <div style={{ fontSize: '0.75rem', color: '#757575', marginTop: '4px' }}>Valor esperado no caixa</div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader><h3 style={{ margin: 0, fontSize: '0.875rem', color: '#757575', fontWeight: 500 }}>Vendas</h3></CardHeader>
              <CardContent>
                <div style={{ fontSize: '1.5rem', fontWeight: 600 }}>{session.salesCount || 0}</div>
                <div style={{ fontSize: '0.75rem', color: '#757575', marginTop: '4px' }}>Vendas realizadas</div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader><h3 style={{ margin: 0, fontSize: '0.875rem', color: '#757575', fontWeight: 500 }}>Total Vendido</h3></CardHeader>
              <CardContent>
                <div style={{ fontSize: '1.5rem', fontWeight: 600 }}>{session.totalSales}</div>
                <div style={{ fontSize: '0.75rem', color: '#757575', marginTop: '4px' }}>Total em vendas</div>
              </CardContent>
            </Card>
          </div>

          <div style={{ display: 'flex', gap: '16px', marginBottom: '24px' }}>
            <Button variant="secondary" onClick={() => { setError(''); setShowCloseModal(true); }} style={{ flex: 1 }}>Fechar Caixa</Button>
            <Link to="/sale" style={{ flex: 1 }}><Button style={{ width: '100%' }}>Nova Venda</Button></Link>
            <Link to="/dashboard" style={{ flex: 1 }}><Button variant="secondary" style={{ width: '100%' }}>Dashboard</Button></Link>
          </div>
        </>
      ) : (
        <Card style={{ padding: '48px 24px', textAlign: 'center' }}>
          <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ marginBottom: '16px', opacity: 0.5 }}>
            <rect x="4" y="2" width="16" height="20" rx="2"/>
            <path d="M4 10h16"/><path d="M8 14h8"/><path d="M12 18h4"/>
          </svg>
          <h3 style={{ margin: '16px 0 8px', fontSize: '1.125rem', fontWeight: 600 }}>Nenhum caixa aberto</h3>
          <p style={{ color: '#757575', marginBottom: '24px' }}>Abra o caixa para começar a vender</p>
          <form onSubmit={handleOpen}>
            <InputGroup style={{ maxWidth: '300px', margin: '0 auto 16px' }}>
              <label htmlFor="openingAmount">Valor de Abertura</label>
              <input type="number" id="openingAmount" step="0.01" min="0.01"
                value={openingAmount} onChange={(e) => setOpeningAmount(e.target.value)} placeholder="0,00" />
            </InputGroup>
            <Button type="submit" fullWidth style={{ marginTop: '16px' }}>Abrir Caixa</Button>
            {error && <div style={{ color: '#c62828', marginTop: '12px', fontSize: '0.875rem' }}>{error}</div>}
          </form>
        </Card>
      )}

      {showCloseModal && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000
        }}>
          <div style={{ background: '#fff', borderRadius: '12px', padding: '24px', maxWidth: '400px', width: '100%' }}>
            <h3 style={{ marginBottom: '16px' }}>Fechar Caixa</h3>
            <InputGroup style={{ marginBottom: '16px' }}>
              <label htmlFor="closingAmount">Valor de Fechamento</label>
              <input type="number" id="closingAmount" step="0.01" min="0.01"
                value={closingAmount} onChange={(e) => setClosingAmount(e.target.value)} placeholder="0,00" />
            </InputGroup>
            {error && (
              <div style={{ color: '#c62828', marginBottom: '12px', fontSize: '0.875rem' }}>
                {error}
              </div>
            )}
            <div style={{ display: 'flex', gap: '12px' }}>
              <Button variant="secondary" onClick={() => { setError(''); setShowCloseModal(false); }} style={{ flex: 1 }}>Cancelar</Button>
              <Button variant="danger" onClick={handleClose} style={{ flex: 1 }}>Fechar</Button>
            </div>
          </div>
        </div>
      )}

      {showReportModal && closeReport && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000
        }}>
          <div style={{
            background: '#fff', borderRadius: '12px', padding: '24px', maxWidth: '520px',
            width: '100%', maxHeight: '85vh', overflowY: 'auto'
          }} className="report-print-area">
            <h3 style={{ marginBottom: '16px', fontSize: '1.25rem' }}>FECHAMENTO DE CAIXA</h3>

            {/* Secao 1: Informacoes da Abertura */}
            <Section title="1. INFORMAÇÕES DA ABERTURA">
              <Row label="Data/Hora abertura" value={fmtBR(closeReport.opened_at)} />
              {closeReport.closed_at && (
                <Row label="Data/Hora fechamento" value={fmtBR(closeReport.closed_at)} />
              )}
              <Row label="Valor inicial (Fundo de caixa)" value={`R$ ${closeReport.opening_amount}`} />
              <Row label="Valor esperado" value={`R$ ${closeReport.expected_amount}`} />
            </Section>

            {/* Secao 2: Resumo Geral das Vendas */}
            <Section title="2. RESUMO GERAL DAS VENDAS">
              <Row label="Quantidade de vendas" value={String(closeReport.sales_count)} />
              <Row label="Valor bruto vendido" value={`R$ ${closeReport.gross_total}`} />
              <Row label="Descontos concedidos" value={`-R$ ${closeReport.discount_total}`} />
              {parseFloat(closeReport.surcharge_total) > 0 && (
                <Row label="Acréscimos" value={`+R$ ${closeReport.surcharge_total}`} />
              )}
              <Row label="Valor líquido vendido" value={`R$ ${closeReport.net_total}`} bold />
              <Row label="Ticket médio" value={`R$ ${closeReport.average_ticket}`} />
            </Section>

            {/* Secao 3: Vendas por Forma de Pagamento */}
            <Section title="3. VENDAS POR FORMA DE PAGAMENTO">
              {Object.keys(closeReport.payment_methods).length === 0 ? (
                <Row label="Nenhuma venda" value="" />
              ) : (
                <>
                  {Object.entries(closeReport.payment_methods).map(([method, data]) => (
                    <Row
                      key={method}
                      label={`${methodLabels[method] || method} (${data.count}x)`}
                      value={`R$ ${data.total}`}
                    />
                  ))}
                  <Row label="Total recebido" value={`R$ ${closeReport.net_total}`} bold divider />
                </>
              )}
            </Section>

            {/* Secao 4: Movimentacoes do Caixa */}
            <Section title="4. MOVIMENTAÇÕES DO CAIXA">
              {/* Reforcos */}
              <SubSection title="Reforços">
                {closeReport.cash_ins.length === 0 ? (
                  <Row label="Nenhum reforço" value="" />
                ) : (
                  <>
                    {closeReport.cash_ins.map((m: any) => (
                      <Row
                        key={m.id}
                        label={`${m.notes || 'Reforço'}`}
                        value={`+R$ ${m.amount}`}
                        valueColor="#2e7d32"
                      />
                    ))}
                  </>
                )}
              </SubSection>

              {/* Sangrias */}
              <SubSection title="Sangrias">
                {closeReport.cash_outs.length === 0 ? (
                  <Row label="Nenhuma sangria" value="" />
                ) : (
                  <>
                    {closeReport.cash_outs.map((m: any) => (
                      <Row
                        key={m.id}
                        label={m.notes || 'Sangria'}
                        value={`-R$ ${m.amount}`}
                        valueColor="#c62828"
                      />
                    ))}
                  </>
                )}
              </SubSection>

              {/* Devolucoes */}
              <SubSection title="Devoluções / Estornos">
                {parseFloat(closeReport.returns_total) === 0 ? (
                  <Row label="Nenhuma devolução" value="" />
                ) : (
                  <Row label="Total devolvido" value={`-R$ ${closeReport.returns_total}`} valueColor="#c62828" />
                )}
              </SubSection>
            </Section>

            {/* Secao 5: Outras Movimentacoes */}
            <Section title="5. OUTRAS MOVIMENTAÇÕES">
              {closeReport.expenses.length === 0 &&
               parseFloat(closeReport.other_in_total) === 0 &&
               parseFloat(closeReport.other_out_total) === 0 ? (
                <Row label="Nenhuma movimentação adicional" value="" />
              ) : (
                <>
                  {closeReport.expenses.map((m: any) => (
                    <Row key={m.id} label={m.notes || 'Despesa'} value={`-R$ ${m.amount}`} valueColor="#c62828" />
                  ))}
                  {parseFloat(closeReport.other_in_total) > 0 && (
                    <Row label="Outras entradas" value={`+R$ ${closeReport.other_in_total}`} valueColor="#2e7d32" />
                  )}
                  {parseFloat(closeReport.other_out_total) > 0 && (
                    <Row label="Outras saídas" value={`-R$ ${closeReport.other_out_total}`} valueColor="#c62828" />
                  )}
                </>
              )}
            </Section>

            {/* Secao 6: Conferencia do Dinheiro */}
            <Section title="6. CONFERÊNCIA DO DINHEIRO">
              <div style={{ fontFamily: 'monospace', fontSize: '0.8rem', lineHeight: 1.6, marginBottom: '8px' }}>
                <div>Abertura .....................R$ {closeReport.cash_breakdown.opening}</div>
                <div>Vendas (dinheiro) ...........R$ {closeReport.cash_breakdown.cash_sales}</div>
                {parseFloat(closeReport.cash_breakdown.cash_ins) > 0 && (
                  <div>Reforços ....................R$ {closeReport.cash_breakdown.cash_ins}</div>
                )}
                {parseFloat(closeReport.cash_breakdown.cash_outs) > 0 && (
                  <div>Sangrias ....................R$ {closeReport.cash_breakdown.cash_outs}</div>
                )}
                {parseFloat(closeReport.cash_breakdown.expenses) > 0 && (
                  <div>Despesas ....................R$ {closeReport.cash_breakdown.expenses}</div>
                )}
                {parseFloat(closeReport.cash_breakdown.other_in) > 0 && (
                  <div>Outras entradas .............R$ {closeReport.cash_breakdown.other_in}</div>
                )}
                {parseFloat(closeReport.cash_breakdown.other_out) > 0 && (
                  <div>Outras saídas ...............R$ {closeReport.cash_breakdown.other_out}</div>
                )}
                <div style={{ borderTop: '1px dashed #999', marginTop: '4px', paddingTop: '4px', fontWeight: 700 }}>
                  Esperado ......................R$ {closeReport.cash_breakdown.expected_amount}
                </div>
              </div>
              <Row label="Valor contado" value={`R$ ${closeReport.closing_amount}`} />
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '8px' }}>
                <span style={{ fontSize: '0.875rem', fontWeight: 600 }}>Diferença</span>
                <DiffTag value={closeReport.difference} />
              </div>
            </Section>

            {/* Secao 7: Resumo Financeiro */}
            <Section title="7. RESUMO FINANCEIRO">
              <Row label="Fundo de caixa" value={`R$ ${closeReport.opening_amount}`} />
              <Row label="Total vendido" value={`R$ ${closeReport.net_total}`} />
              <Row label="Total em dinheiro" value={`R$ ${(closeReport.payment_methods['cash']?.total || '0.00')}`} />
              <Row label="Total via PIX" value={`R$ ${(closeReport.payment_methods['pix']?.total || '0.00')}`} />
              <Row label="Total no cartão" value={`R$ ${(
                parseFloat(closeReport.payment_methods['card_external']?.total || '0') +
                parseFloat(closeReport.payment_methods['card_integrated']?.total || '0')
              ).toFixed(2)}`} />
              {parseFloat(closeReport.cash_ins_total) > 0 && (
                <Row label="Total reforços" value={`R$ ${closeReport.cash_ins_total}`} />
              )}
              {parseFloat(closeReport.cash_outs_total) > 0 && (
                <Row label="Total sangrias" value={`R$ ${closeReport.cash_outs_total}`} />
              )}
              {parseFloat(closeReport.returns_total) > 0 && (
                <Row label="Total devoluções" value={`R$ ${closeReport.returns_total}`} />
              )}
              {parseFloat(closeReport.expenses_total) > 0 && (
                <Row label="Total despesas" value={`R$ ${closeReport.expenses_total}`} />
              )}
              <Row label="Saldo esperado em dinheiro" value={`R$ ${closeReport.expected_amount}`} bold divider />
              <Row label="Valor contado" value={`R$ ${closeReport.closing_amount}`} />
              <Row
                label="Diferença"
                value={`R$ ${closeReport.difference}`}
                bold
                valueColor={
                  parseFloat(closeReport.difference) > 0 ? '#c62828'
                  : parseFloat(closeReport.difference) < 0 ? '#2e7d32'
                  : '#212121'
                }
              />
            </Section>

            <div className="no-print" style={{ display: 'flex', gap: '12px', marginTop: '20px' }}>
              <Button variant="secondary" onClick={handlePrintReport} style={{ flex: 1 }}>
                Imprimir / Salvar PDF
              </Button>
              <Button variant="primary" onClick={handleCloseReport} style={{ flex: 1 }}>
                Concluir
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const printStyles = `
@media print {
  body * { visibility: hidden; }
  .report-print-area, .report-print-area * { visibility: visible; }
  .report-print-area {
    position: absolute;
    left: 0;
    top: 0;
    width: 100%;
  }
  .no-print { display: none !important; }
}`;

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: '20px' }}>
      <div style={{
        fontSize: '0.75rem', fontWeight: 700, color: '#616161',
        textTransform: 'uppercase', letterSpacing: '0.5px',
        marginBottom: '8px', paddingBottom: '4px',
        borderBottom: '1px solid #e0e0e0',
      }}>
        {title}
      </div>
      {children}
    </div>
  );
}

function SubSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: '12px' }}>
      <div style={{ fontSize: '0.8rem', fontWeight: 600, color: '#9e9e9e', marginBottom: '4px' }}>
        {title}
      </div>
      {children}
    </div>
  );
}

function Row({ label, value, bold, valueColor, divider }: {
  label: string; value: string; bold?: boolean; valueColor?: string; divider?: boolean;
}) {
  return (
    <div style={{
      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      padding: '4px 0', fontSize: '0.875rem',
      borderBottom: divider ? '1px solid #e0e0e0' : 'none',
      marginBottom: divider ? '4px' : '0',
    }}>
      <span style={{ color: '#424242', fontWeight: bold ? 700 : 400 }}>{label}</span>
      <span style={{ fontWeight: bold ? 700 : 600, color: valueColor || '#212121' }}>{value}</span>
    </div>
  );
}
