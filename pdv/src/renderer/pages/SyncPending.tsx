import { useEffect, useState, useCallback } from 'react';
import { Card, Button, CardContent, EmptyState, Spinner } from '../components/ui';

interface PendingView {
  id: number;
  uuid: string;
  type: string;
  status: 'pending' | 'syncing' | 'synced' | 'conflict' | 'failed' | 'migration_review';
  created_at: string;
  synced_at: string | null;
  retry_count: number;
  last_error: string | null;
  conflict_resolution: string | null;
  total?: string;
  paymentMethod?: string;
}

const statusLabels: Record<string, { label: string; bg: string; color: string }> = {
  pending: { label: 'Pendente', bg: '#fff8e1', color: '#f57c00' },
  syncing: { label: 'Sincronizando', bg: '#e3f2fd', color: '#1976d2' },
  synced: { label: 'Sincronizada', bg: '#e8f5e9', color: '#2e7d32' },
  conflict: { label: 'Conflito', bg: '#fce4ec', color: '#c62828' },
  failed: { label: 'Falha', bg: '#fce4ec', color: '#c62828' },
  migration_review: { label: 'Migração pendente', bg: '#ede7f6', color: '#5e35b1' },
};

function methodLabel(method: string | undefined): string {
  switch (method) {
    case 'cash': return 'Dinheiro';
    case 'card_external_confirmed': return 'Cartão (confirmado externamente)';
    case 'pix_external_confirmed': return 'Pix (confirmado externamente)';
    default: return method || '—';
  }
}

export function SyncPending() {
  const [entries, setEntries] = useState<PendingView[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [message, setMessage] = useState('');

  const load = useCallback(async () => {
    try {
      const result = await window.electronAPI.getJournal();
      if (result.success) {
        const enriched = (result.data as any[]).map((entry) => {
          let total: string | undefined;
          let paymentMethod: string | undefined;
          try {
            const payload = JSON.parse(entry.payload as string) as Record<string, unknown>;
            if (typeof payload.total_amount === 'string') total = payload.total_amount;
            const payments = Array.isArray(payload.payments) ? (payload.payments as Array<{ method?: string }>) : [];
            paymentMethod = payments.map((p) => p.method).join(', ');
          } catch {
            total = undefined;
            paymentMethod = undefined;
          }
          return {
            id: entry.id,
            uuid: entry.uuid,
            type: entry.type,
            status: entry.status,
            created_at: entry.created_at,
            synced_at: entry.synced_at,
            retry_count: entry.retry_count,
            last_error: entry.last_error,
            conflict_resolution: entry.conflict_resolution,
            total,
            paymentMethod,
          } as PendingView;
        });
        setEntries(enriched);
      }
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const interval = setInterval(load, 15000);
    return () => clearInterval(interval);
  }, [load]);

  const handleSync = async () => {
    setSyncing(true);
    setMessage('');
    try {
      await window.electronAPI.startSync();
      await load();
      setMessage('Sincronização concluída. Verifique o status de cada operação.');
    } catch {
      setMessage('Falha ao iniciar a sincronização.');
    } finally {
      setSyncing(false);
    }
  };

  const formatAge = (iso: string): string => {
    const diff = Date.now() - new Date(iso).getTime();
    const minutes = Math.floor(diff / 60000);
    if (minutes < 1) return 'agora mesmo';
    if (minutes < 60) return `há ${minutes} min`;
    const hours = Math.floor(minutes / 60);
    return `há ${hours}h ${minutes % 60}min`;
  };

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '400px' }}>
        <Spinner size="lg" />
      </div>
    );
  }

  const hasEntries = entries.length > 0;
  const pendingCount = entries.filter((e) => e.status === 'pending' || e.status === 'syncing').length;

  return (
    <div style={{ padding: '24px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
        <div>
          <h1 style={{ fontSize: '1.5rem', fontWeight: 600, marginBottom: '4px' }}>Pendências de Sincronização</h1>
          <p style={{ color: '#757575', fontSize: '0.875rem' }}>
            {pendingCount > 0
              ? `${pendingCount} operações offline aguardando sincronização`
              : 'Nenhuma operação offline pendente'}
          </p>
        </div>
        <Button variant={pendingCount > 0 ? 'primary' : 'outline'} onClick={handleSync} disabled={syncing}>
          {syncing ? 'Sincronizando...' : 'Sincronizar agora'}
        </Button>
      </div>

      {message && (
        <div
          role="status"
          data-testid="sync-pending-message"
          style={{
            padding: '12px 16px',
            marginBottom: '12px',
            borderRadius: '8px',
            background: '#e8f5e9',
            color: '#2e7d32',
            fontSize: '0.875rem',
          }}
        >
          {message}
        </div>
      )}

      {hasEntries ? (
        <Card>
          <CardContent style={{ padding: 0 }}>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ textAlign: 'left', borderBottom: '1px solid #e0e0e0' }}>
                    <th style={{ padding: '12px 16px', fontWeight: 600, fontSize: '0.75rem', color: '#757575', textTransform: 'uppercase' }}>Seq.</th>
                    <th style={{ padding: '12px 16px', fontWeight: 600, fontSize: '0.75rem', color: '#757575', textTransform: 'uppercase' }}>Status</th>
                    <th style={{ padding: '12px 16px', fontWeight: 600, fontSize: '0.75rem', color: '#757575', textTransform: 'uppercase' }}>Valor</th>
                    <th style={{ padding: '12px 16px', fontWeight: 600, fontSize: '0.75rem', color: '#757575', textTransform: 'uppercase' }}>Pagamento</th>
                    <th style={{ padding: '12px 16px', textAlign: 'right', fontWeight: 600, fontSize: '0.75rem', color: '#757575', textTransform: 'uppercase' }}>Idade</th>
                    <th style={{ padding: '12px 16px', fontWeight: 600, fontSize: '0.75rem', color: '#757575', textTransform: 'uppercase' }}>Detalhe</th>
                  </tr>
                </thead>
                <tbody>
                  {entries.map((entry) => {
                    const statusStyle = statusLabels[entry.status] || { label: entry.status, bg: '#eeeeee', color: '#616161' };
                    return (
                      <tr key={entry.uuid} style={{ borderBottom: '1px solid #f5f5f5' }} data-testid={`pending-row-${entry.id}`}>
                        <td style={{ padding: '12px 16px', fontSize: '0.875rem' }}>{entry.id}</td>
                        <td style={{ padding: '12px 16px' }}>
                          <span
                            data-testid={`pending-status-${entry.id}`}
                            style={{
                              display: 'inline-block',
                              padding: '2px 10px',
                              borderRadius: '12px',
                              fontSize: '0.75rem',
                              fontWeight: 600,
                              backgroundColor: statusStyle.bg,
                              color: statusStyle.color,
                            }}
                          >
                            {statusStyle.label}
                          </span>
                        </td>
                        <td style={{ padding: '12px 16px', fontSize: '0.875rem', fontWeight: 600 }}>{entry.total ? `R$ ${entry.total}` : '—'}</td>
                        <td style={{ padding: '12px 16px', fontSize: '0.875rem' }}>{methodLabel(entry.paymentMethod)}</td>
                        <td style={{ padding: '12px 16px', textAlign: 'right', fontSize: '0.875rem', color: '#757575' }}>{formatAge(entry.created_at)}</td>
                        <td style={{ padding: '12px 16px', fontSize: '0.8125rem', color: entry.last_error ? '#c62828' : '#757575' }}>
                          {entry.last_error || entry.conflict_resolution || (entry.status === 'synced' ? 'Sincronizada com sucesso' : 'Aguardando backend')}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      ) : (
        <Card style={{ padding: '48px 24px', textAlign: 'center' }}>
          <EmptyState
            icon={<svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M20 6L9 17l-5-5" />
            </svg>}
            title="Tudo em dia"
            description="Nenhuma venda offline aguardando sincronização"
          />
        </Card>
      )}
    </div>
  );
}
