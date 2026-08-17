import React, { useEffect, useState, useCallback } from 'react';
import type { SyncState } from '../../shared/types';

const barStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  padding: '8px 16px',
  fontSize: '12px',
  color: '#757575',
  borderTop: '1px solid #e0e0e0',
  background: '#fafafa',
};

const progressBarStyle: React.CSSProperties = {
  height: '4px',
  borderRadius: '2px',
  background: '#e0e0e0',
  flex: 1,
  margin: '0 12px',
  overflow: 'hidden',
};

const progressFillStyle: React.CSSProperties = {
  height: '100%',
  background: '#1976d2',
  borderRadius: '2px',
  transition: 'width 0.3s ease',
};

const buttonStyle: React.CSSProperties = {
  padding: '4px 12px',
  borderRadius: '4px',
  border: '1px solid #1976d2',
  background: '#fff',
  color: '#1976d2',
  fontSize: '11px',
  fontWeight: 500,
  cursor: 'pointer',
  display: 'flex',
  alignItems: 'center',
  gap: '4px',
};

export function SyncStatusBar() {
  const [syncState, setSyncState] = useState<SyncState | null>(null);
  const [syncing, setSyncing] = useState(false);

  const fetchStatus = useCallback(async () => {
    try {
      const result = await window.electronAPI.getSyncStatus();
      if (result.success) {
        setSyncState(result.data);
        setSyncing(result.data.status === 'syncing');
      }
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    fetchStatus();
    const interval = setInterval(fetchStatus, 30000);
    return () => clearInterval(interval);
  }, [fetchStatus]);

  const handleSyncNow = async () => {
    setSyncing(true);
    try {
      const result = await window.electronAPI.startSync();
      if (result.success) {
        setSyncState(result.data);
        setSyncing(result.data.status === 'syncing');
      }
    } finally {
      setSyncing(false);
      await fetchStatus();
    }
  };

  const getLastSyncText = (): string => {
    if (!syncState?.lastSyncAt) return 'Nunca sincronizado';
    const diff = Date.now() - new Date(syncState.lastSyncAt).getTime();
    const minutes = Math.floor(diff / 60000);
    if (minutes < 1) return 'Agora mesmo';
    if (minutes < 60) return `H\u00E1 ${minutes} min`;
    const hours = Math.floor(minutes / 60);
    return `H\u00E1 ${hours}h ${minutes % 60}min`;
  };

  if (!syncState) return null;

  const hasPending = syncState.pendingCount > 0;

  return (
    <div style={barStyle}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <span>
          {syncing ? '\u23F3 Sincronizando...' : hasPending ? `\u26A0 ${syncState.pendingCount} pendente${syncState.pendingCount > 1 ? 's' : ''}` : '\u2714 Sincronizado'}
        </span>
        <span style={{ color: '#9e9e9e' }}>|</span>
        <span>{getLastSyncText()}</span>
      </div>

      {syncing && (
        <div style={progressBarStyle}>
          <div style={{ ...progressFillStyle, width: '60%' }} />
        </div>
      )}

      {hasPending && !syncing && (
        <div style={{ display: 'flex', gap: '8px' }}>
          <a href="/sync-pending" style={{ textDecoration: 'none' }}>
            <button type="button" style={buttonStyle}>Pendências</button>
          </a>
          <button type="button" onClick={handleSyncNow} style={buttonStyle}>
            Sincronizar agora
          </button>
        </div>
      )}
    </div>
  );
}
