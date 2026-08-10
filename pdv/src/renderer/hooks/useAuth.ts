import { useEffect, useState } from 'react';

export function useAuth() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    checkAuth();
  }, []);

  const checkAuth = async () => {
    const token = localStorage.getItem('access_token');
    try {
      if (token) {
        try {
          // Verify token is still valid
          const response = await fetch('/api/v1/devices/validate/', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ api_key: localStorage.getItem('api_key') || '' }),
          });
          if (response.ok) {
            setIsAuthenticated(true);
          } else {
            localStorage.clear();
            setIsAuthenticated(false);
          }
        } catch {
          localStorage.clear();
          setIsAuthenticated(false);
        }
      } else {
        setIsAuthenticated(false);
      }
    } finally {
      setLoading(false);
    }
  };

  const login = async (apiKey: string) => {
    try {
      const response = await fetch('/api/v1/devices/validate/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ api_key: apiKey }),
      });

      if (!response.ok) {
        const error = await response.json();
        return { success: false, error: error.detail || 'Invalid API key' };
      }

      const data = await response.json();
      localStorage.setItem('access_token', data.token);
      localStorage.setItem('refresh_token', data.refresh_token);
      localStorage.setItem('device_id', data.device_id);
      localStorage.setItem('branch_id', data.branch_id || '');
      setIsAuthenticated(true);

      return { success: true };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Login failed' };
    }
  };

  const logout = () => {
    localStorage.removeItem('access_token');
    localStorage.removeItem('refresh_token');
    localStorage.removeItem('device_id');
    localStorage.removeItem('branch_id');
    setIsAuthenticated(false);
  };

  return { isAuthenticated, loading, login, logout };
}
