import { useState, useEffect, useCallback } from 'react';

interface CashSessionState {
  sessionId: string | null;
  status: 'closed' | 'open';
  openingAmount: string;
  expectedAmount: string;
  salesCount: number;
  totalSales: string;
}

interface UseCashSessionReturn {
  session: {
    sessionId: string | null;
    status: 'closed' | 'open';
    openingAmount: string;
    expectedAmount: string;
    salesCount: number;
    totalSales: string;
  };
  setSession: (session: Partial<CashSessionState>) => void;
  clearSession: () => void;
  openSession: (branchId: string, openingAmount: string) => Promise<{ success: boolean; error?: string }>;
  closeSession: (closingAmount: string) => Promise<{ success: boolean; error?: string }>;
  getCurrentSession: (branchId: string) => Promise<void>;
  refreshSession: () => Promise<void>;
}

export function useCashSession(): UseCashSessionReturn {
  const [session, setSessionState] = useState<CashSessionState>({
    sessionId: null,
    status: 'closed',
    openingAmount: '0.00',
    expectedAmount: '0.00',
    salesCount: 0,
    totalSales: '0.00',
  });

  useEffect(() => {
    const savedSession = localStorage.getItem('cash_session');
    if (savedSession) {
      try {
        const parsed = JSON.parse(savedSession);
        setSessionState(parsed);
      } catch (e) {
        console.error('Failed to parse saved session:', e);
      }
    }
  }, []);

  const setSession = useCallback((newSession: Partial<CashSessionState>) => {
    setSessionState(prev => {
      const updated = { ...prev, ...newSession };
      localStorage.setItem('cash_session', JSON.stringify(updated));
      return updated;
    });
  }, []);

  const clearSession = useCallback(() => {
    const cleared = {
      sessionId: null,
      status: 'closed' as const,
      openingAmount: '0.00',
      expectedAmount: '0.00',
      salesCount: 0,
      totalSales: '0.00',
    };
    localStorage.removeItem('cash_session');
    setSessionState(cleared);
  }, []);

  const openSession = async (branchId: string, openingAmount: string) => {
    try {
      const response = await fetch('/api/v1/cash-sessions/open/', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('access_token')}`,
        },
        body: JSON.stringify({
          branch: branchId,
          opening_amount: openingAmount,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        return { success: false, error: error.detail || 'Failed to open cash session' };
      }

      const data = await response.json();
      setSession({
        sessionId: data.id,
        status: 'open',
        openingAmount: data.opening_amount,
        expectedAmount: data.expected_amount,
        salesCount: 0,
        totalSales: '0.00',
      });

      return { success: true };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Failed to open cash session' };
    }
  };

  const closeSession = async (closingAmount: string) => {
    const sessionId = session.sessionId;
    if (!sessionId) {
      return { success: false, error: 'No open cash session' };
    }

    try {
      const response = await fetch(`/api/v1/cash-sessions/${sessionId}/close/`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('access_token')}`,
        },
        body: JSON.stringify({ closing_amount: closingAmount }),
      });

      if (!response.ok) {
        const error = await response.json();
        return { success: false, error: error.detail || 'Failed to close cash session' };
      }

      clearSession();
      return { success: true };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Failed to close cash session' };
    }
  };

  const getCurrentSession = async (branchId: string) => {
    try {
      const response = await fetch(`/api/v1/cash-sessions/current/?branch=${branchId}`, {
        headers: { 'Authorization': `Bearer ${localStorage.getItem('access_token')}` },
      });

      if (response.ok) {
        const data = await response.json();
        setSession({
          sessionId: data.id,
          status: data.status,
          openingAmount: data.opening_amount,
          expectedAmount: data.expected_amount,
          salesCount: data.sales_count,
          totalSales: data.total_sales,
        });
      } else if (response.status === 404) {
        clearSession();
      }
    } catch (error) {
      console.error('Failed to get current session:', error);
    }
  };

  const refreshSession = async () => {
    const branchId = localStorage.getItem('branch_id');
    if (branchId) {
      await getCurrentSession(branchId);
    }
  };

  return {
    session: {
      sessionId: session.sessionId || null,
      status: session.status || 'closed',
      openingAmount: session.openingAmount || '0.00',
      expectedAmount: session.expectedAmount || '0.00',
      salesCount: session.salesCount || 0,
      totalSales: session.totalSales || '0.00',
    },
    setSession,
    clearSession,
    openSession,
    closeSession,
    getCurrentSession,
    refreshSession,
  };
}
