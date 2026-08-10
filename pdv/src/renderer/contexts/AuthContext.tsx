import { createContext, useContext, useState, useEffect, ReactNode } from 'react';

interface AuthContextType {
  isAuthenticated: boolean;
  deviceId: string | null;
  branchId: string | null;
  login: (apiKey: string) => Promise<{ success: boolean; error?: string }>;
  logout: () => void;
  refreshAuth: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

const API_BASE = '/api/v1';

function getToken(): string | null {
  return localStorage.getItem('access_token');
}

function authHeaders(): Record<string, string> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  const token = localStorage.getItem('access_token');
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const tid = localStorage.getItem('tenant_id');
  if (tid) headers['X-Tenant-ID'] = tid;
  return headers;
}

function simpleHeaders(): Record<string, string> {
  return { 'Content-Type': 'application/json' };
}

function setAuthData(data: { token: string; refresh_token: string; device_id: string; branch_id?: string; tenant_id?: string }) {
  localStorage.setItem('access_token', data.token);
  localStorage.setItem('refresh_token', data.refresh_token);
  localStorage.setItem('device_id', data.device_id);
  localStorage.setItem('branch_id', data.branch_id ?? '');
  localStorage.setItem('tenant_id', data.tenant_id ?? '');
}

function clearAuthData() {
  localStorage.removeItem('access_token');
  localStorage.removeItem('refresh_token');
  localStorage.removeItem('device_id');
  localStorage.removeItem('branch_id');
  localStorage.removeItem('tenant_id');
  localStorage.removeItem('api_key');
  localStorage.removeItem('cash_session');
  localStorage.removeItem('stock_location_id');
}

async function syncPrimaryStockLocation(): Promise<void> {
  try {
    const response = await fetch(`${API_BASE}/stock-locations/`, {
      headers: authHeaders(),
    });
    if (!response.ok) return;

    const data = await response.json();
    const locations = Array.isArray(data) ? data : data.results || (data.id ? [data] : []);
    const location = locations.find((item: any) => item.is_primary) || locations[0];
    if (location?.id) {
      localStorage.setItem('stock_location_id', location.id);
    }
  } catch (error) {
    console.error('Failed to sync stock location:', error);
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [isAuthenticated, setIsAuthenticated] = useState(!!getToken());
  const [deviceId, setDeviceId] = useState<string | null>(localStorage.getItem('device_id'));
  const [branchId, setBranchId] = useState<string | null>(localStorage.getItem('branch_id'));

  useEffect(() => {
    checkAuth();
  }, []);

  const checkAuth = async () => {
    const token = getToken();
    if (!token) {
      setIsAuthenticated(false);
      return;
    }

    try {
      const apiKey = localStorage.getItem('api_key');
      if (!apiKey) {
        setIsAuthenticated(false);
        return;
      }

      const response = await fetch(`${API_BASE}/devices/validate/`, {
        method: 'POST',
        headers: simpleHeaders(),
        body: JSON.stringify({ api_key: apiKey }),
      });

      if (response.ok) {
        const data = await response.json();
        setAuthData(data);
        localStorage.setItem('api_key', apiKey);

        if ((window as any).electronAPI?.syncAuthTokens) {
          (window as any).electronAPI.syncAuthTokens({
            token: data.token,
            refresh_token: data.refresh_token,
            device_id: data.device_id,
            branch_id: data.branch_id,
            tenant_id: data.tenant_id,
            api_key: apiKey,
          }).catch((err: any) => console.error('Failed to sync auth tokens:', err));
        }

        await syncPrimaryStockLocation();
        setIsAuthenticated(true);
        setDeviceId(data.device_id);
        setBranchId(data.branch_id ?? null);
      } else {
        clearAuthData();
        setIsAuthenticated(false);
        setDeviceId(null);
        setBranchId(null);
      }
    } catch (error) {
      console.error('Auth check failed:', error);
    }
  };

  const login = async (apiKey: string) => {
    try {
      const response = await fetch(`${API_BASE}/devices/validate/`, {
        method: 'POST',
        headers: simpleHeaders(),
        body: JSON.stringify({ api_key: apiKey }),
      });

      if (!response.ok) {
        const error = await response.json();
        return { success: false, error: error.detail || 'Invalid API key' };
      }

      const data = await response.json();
      setAuthData(data);
      localStorage.setItem('api_key', apiKey);

      // Sync auth tokens to main process for IPC calls
      if ((window as any).electronAPI?.syncAuthTokens) {
        (window as any).electronAPI.syncAuthTokens({
          token: data.token,
          refresh_token: data.refresh_token,
          device_id: data.device_id,
          branch_id: data.branch_id,
          tenant_id: data.tenant_id,
          api_key: apiKey,
        }).catch((err: any) => console.error('Failed to sync auth tokens:', err));
      }

      await syncPrimaryStockLocation();

      setIsAuthenticated(true);
      setDeviceId(data.device_id);
      setBranchId(data.branch_id ?? null);

      return { success: true };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Login failed' };
    }
  };

  const logout = () => {
    clearAuthData();
    if ((window as any).electronAPI?.logout) {
      (window as any).electronAPI.logout().catch(() => {});
    }
    setIsAuthenticated(false);
    setDeviceId(null);
    setBranchId(null);
  };

  const refreshAuth = async () => {
    const refreshToken = localStorage.getItem('refresh_token');
    if (!refreshToken) return;

    try {
      const response = await fetch(`${API_BASE}/devices/refresh/`, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({ refresh_token: refreshToken }),
      });

      if (response.ok) {
        const data = await response.json();
        localStorage.setItem('access_token', data.token);
        localStorage.setItem('refresh_token', data.refresh_token);
        setIsAuthenticated(true);
      } else {
        clearAuthData();
        setIsAuthenticated(false);
        setDeviceId(null);
        setBranchId(null);
      }
    } catch (error) {
      console.error('Failed to refresh auth:', error);
    }
  };

  return (
    <AuthContext.Provider value={{
      isAuthenticated,
      deviceId,
      branchId,
      login,
      logout,
      refreshAuth,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
