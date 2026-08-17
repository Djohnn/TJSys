import { createContext, useContext, useState, useEffect, ReactNode, useCallback } from 'react';

interface CashSessionState {
  sessionId: string | null;
  status: 'closed' | 'open';
  openingAmount: string;
  expectedAmount: string;
  salesCount: number;
  totalSales: string;
}

export interface CloseReport {
  difference: string;
  payment_methods: Record<string, { total: string; count: number }>;
  cash_ins: any[];
  cash_outs: any[];
  cash_ins_total: string;
  cash_outs_total: string;
  expenses: any[];
  expenses_total: string;
  other_in_total: string;
  other_out_total: string;
  returns_total: string;
  expected_amount: string;
  closing_amount: string;
  opening_amount: string;
  gross_total: string;
  discount_total: string;
  surcharge_total: string;
  net_total: string;
  total_sales: string;
  average_ticket: string;
  sales_count: number;
  opened_at: string;
  closed_at: string | null;
  cash_breakdown: {
    opening: string;
    cash_sales: string;
    cash_ins: string;
    cash_outs: string;
    expenses: string;
    other_in: string;
    other_out: string;
    expected_amount: string;
    closing_amount: string | null;
  };
  movements: any[];
}

interface CashSessionContextType {
  session: CashSessionState;
  closeReport: CloseReport | null;
  setSession: (session: Partial<CashSessionState>) => void;
  clearSession: () => void;
  clearCloseReport: () => void;
  openSession: (branchId: string, openingAmount: string) => Promise<{ success: boolean; error?: string }>;
  closeSession: (closingAmount: string) => Promise<{ success: boolean; error?: string; report?: CloseReport }>;
  getCurrentSession: (branchId: string) => Promise<void>;
  refreshSession: () => Promise<void>;
}

const CashSessionContext = createContext<CashSessionContextType | null>(null);

const API_BASE = '/api/v1';

function authHeaders(): Record<string, string> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  const token = localStorage.getItem('access_token');
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const tid = localStorage.getItem('tenant_id');
  if (tid) headers['X-Tenant-ID'] = tid;
  return headers;
}

function withIdempotency(headers: Record<string, string>): Record<string, string> {
  return { ...headers, 'Idempotency-Key': crypto.randomUUID() };
}

function defaultSession(): CashSessionState {
  return {
    sessionId: null,
    status: 'closed',
    openingAmount: '0.00',
    expectedAmount: '0.00',
    salesCount: 0,
    totalSales: '0.00',
  };
}

function loadSession(): CashSessionState {
  try {
    const saved = localStorage.getItem('cash_session');
    return saved ? { ...defaultSession(), ...JSON.parse(saved) } : defaultSession();
  } catch {
    return defaultSession();
  }
}

function saveSession(session: CashSessionState) {
  localStorage.setItem('cash_session', JSON.stringify(session));
}

export function CashSessionProvider({ children }: { children: ReactNode }) {
  const [session, setSessionState] = useState<CashSessionState>(loadSession);
  const [closeReport, setCloseReport] = useState<CloseReport | null>(null);

  useEffect(() => {
    const saved = loadSession();
    setSessionState(saved);
  }, []);

  const clearCloseReport = useCallback(() => setCloseReport(null), []);

  const setSession = useCallback((newSession: Partial<CashSessionState>) => {
    setSessionState(prev => {
      const updated = { ...prev, ...newSession };
      localStorage.setItem('cash_session', JSON.stringify(updated));
      return updated;
    });
  }, []);

  const clearSession = useCallback(() => {
    localStorage.removeItem('cash_session');
    setSessionState(defaultSession());
  }, []);

  const openSession = async (branchId: string, openingAmount: string) => {
    try {
      const response = await fetch(`${API_BASE}/cash-sessions/open/`, {
        method: 'POST',
        headers: withIdempotency(authHeaders()),
        body: JSON.stringify({ branch: branchId, opening_amount: openingAmount }),
      });

      if (!response.ok) {
        const error = await response.json();
        return { success: false, error: error.detail || 'Failed to open cash session' };
      }

      const data = await response.json();
      const updated = {
        sessionId: data.id,
        status: 'open' as const,
        openingAmount: data.opening_amount,
        expectedAmount: data.expected_amount,
        salesCount: 0,
        totalSales: '0.00',
      };
      setSessionState(updated);
      saveSession(updated as CashSessionState);

      return { success: true };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Failed to open cash session' };
    }
  };

  const closeSession = async (closingAmount: string) => {
    if (!session.sessionId) {
      return { success: false, error: 'No open cash session' };
    }

    try {
      const response = await fetch(`${API_BASE}/cash-sessions/${session.sessionId}/close/`, {
        method: 'POST',
        headers: withIdempotency(authHeaders()),
        body: JSON.stringify({ closing_amount: closingAmount }),
      });

      if (!response.ok) {
        const error = await response.json();
        return { success: false, error: error.detail || 'Failed to close cash session' };
      }

      const data = await response.json();
      const report: CloseReport = {
        difference: data.difference,
        payment_methods: data.payment_methods,
        cash_ins: data.cash_ins,
        cash_outs: data.cash_outs,
        cash_ins_total: data.cash_ins_total,
        cash_outs_total: data.cash_outs_total,
        expenses: data.expenses,
        expenses_total: data.expenses_total,
        other_in_total: data.other_in_total,
        other_out_total: data.other_out_total,
        returns_total: data.returns_total,
        expected_amount: data.expected_amount,
        closing_amount: data.closing_amount,
        opening_amount: data.opening_amount,
        gross_total: data.gross_total,
        discount_total: data.discount_total,
        surcharge_total: data.surcharge_total,
        net_total: data.net_total,
        total_sales: data.total_sales,
        average_ticket: data.average_ticket,
        sales_count: data.sales_count,
        opened_at: data.opened_at,
        closed_at: data.closed_at,
        cash_breakdown: data.cash_breakdown,
        movements: data.movements,
      };
      setCloseReport(report);
      clearSession();
      return { success: true, report };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Failed to close cash session' };
    }
  };

  const getCurrentSession = async (branchId: string) => {
    try {
      const response = await fetch(`${API_BASE}/cash-sessions/current/?branch=${branchId}`, {
        headers: authHeaders(),
      });

      if (response.ok) {
        const data = await response.json();
        const updated = {
          sessionId: data.id,
          status: data.status,
          openingAmount: data.opening_amount,
          expectedAmount: data.expected_amount,
          salesCount: data.sales_count ?? 0,
          totalSales: data.total_sales ?? '0.00',
        };
        setSessionState(updated);
        saveSession(updated as CashSessionState);
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

  return (
    <CashSessionContext.Provider value={{
      session,
      closeReport,
      setSession,
      clearSession,
      clearCloseReport,
      openSession,
      closeSession,
      getCurrentSession,
      refreshSession,
    }}>
      {children}
    </CashSessionContext.Provider>
  );
}

export function useCashSession() {
  const context = useContext(CashSessionContext);
  if (!context) {
    throw new Error('useCashSession must be used within a CashSessionProvider');
  }
  return context;
}
