import React, { useEffect, useState, useCallback } from 'react';

const indicatorStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: '6px',
  padding: '4px 10px',
  borderRadius: '12px',
  fontSize: '12px',
  fontWeight: 500,
  cursor: 'pointer',
  border: 'none',
  transition: 'all 0.2s ease',
};

export function SyncIndicator() {
  const [isOnline, setIsOnline] = useState(true);
  const [pendingCount, setPendingCount] = useState(0);
  const [syncing, setSyncing] = useState(false);
  const [checking, setChecking] = useState(false);

  const fetchStatus = useCallback(async () => {
    try {
      const [connResult, syncResult] = await Promise.all([
        window.electronAPI.getConnectivityStatus(),
        window.electronAPI.getSyncStatus(),
      ]);
      if (connResult.success) {
        setIsOnline(connResult.data.isOnline);
      }
      if (syncResult.success) {
        setPendingCount(syncResult.data.pendingCount);
        setSyncing(syncResult.data.status === 'syncing');
      }
    } catch {
      setIsOnline(false);
    }
  }, []);

  useEffect(() => {
    fetchStatus();
    const interval = setInterval(fetchStatus, 15000);
    return () => clearInterval(interval);
  }, [fetchStatus]);

  const handleClick = async () => {
    if (syncing) return;
    
    if (!isOnline) {
      // Offline: force connectivity check
      setChecking(true);
      try {
        const result = await window.electronAPI.checkConnectivity();
        if (result?.success) {
          setIsOnline(result.data.isOnline);
        }
      } finally {
        setChecking(false);
      }
      return;
    }
    
    // Online: start sync
    setSyncing(true);
    try {
      await window.electronAPI.startSync();
    } finally {
      await fetchStatus();
    }
  };

  const getStyle = (): React.CSSProperties => {
    if (syncing) {
      return { ...indicatorStyle, background: '#fff8e1', color: '#f57c00', border: '1px solid #ffe082' };
    }
    if (!isOnline) {
      return { ...indicatorStyle, background: '#ffebee', color: '#d32f2f', border: '1px solid #ef9a9a' };
    }
    if (pendingCount > 0) {
      return { ...indicatorStyle, background: '#fff8e1', color: '#f57c00', border: '1px solid #ffe082' };
    }
    return { ...indicatorStyle, background: '#e8f5e9', color: '#388e3c', border: '1px solid #a5d6a7' };
  };

  const getLabel = (): string => {
    if (syncing) return 'Sincronizando...';
    if (!isOnline) return checking ? 'Verificando...' : 'Offline';
    if (pendingCount > 0) return `${pendingCount} pendente${pendingCount > 1 ? 's' : ''}`;
    return 'Online';
  };

  const getDot = (): string => {
    if (syncing) return '\u23F3';
    if (!isOnline) return checking ? '\u23F3' : '\u26A0';
    if (pendingCount > 0) return '\u26A0';
    return '\u2714';
  };

  return (
    <button
      onClick={handleClick}
      style={getStyle()}
      title={
        syncing ? 'Sincronizando opera\u00E7\u00F5es...'
        : !isOnline ? (checking ? 'Verificando conex\u00E3o...' : 'Offline - clique para verificar')
        : pendingCount > 0 ? `${pendingCount} opera\u00E7\u00F5es aguardando sincroniza\u00E7\u00E3o`
        : 'Conectado ao servidor'
      }
      disabled={syncing || checking}
    >
      <span>{getDot()}</span>
      <span>{getLabel()}</span>
    </button>
  );
}
