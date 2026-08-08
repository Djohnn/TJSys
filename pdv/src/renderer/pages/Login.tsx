import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { Card, Button } from '../components/ui';

export function Login() {
  const [apiKey, setApiKey] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const result = await login(apiKey);
      if (result.success) {
        setSuccess(true);
        navigate('/dashboard');
      } else {
        setError(result.error || 'Erro ao fazer login');
      }
    } catch {
      setError('Erro de conexão. Verifique sua conexão e tente novamente.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '24px',
      background: 'linear-gradient(135deg, #f5f5f5 0%, #e8e8e8 100%)'
    }}>
      <Card style={{ width: '100%', maxWidth: '420px', padding: '40px' }}>
        <div style={{ textAlign: 'center', marginBottom: '32px' }}>
          <div style={{
            width: '80px', height: '80px', borderRadius: '50%',
            background: 'linear-gradient(135deg, #1976d2 0%, #1565c0 100%)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            margin: '0 auto 24px', boxShadow: '0 8px 24px rgba(25, 118, 210, 0.3)'
          }}>
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <rect x="4" y="2" width="16" height="20" rx="2"/>
              <path d="M4 10h16"/><path d="M8 14h8"/><path d="M12 18h4"/>
            </svg>
          </div>
          <h1 style={{ fontSize: '1.75rem', fontWeight: 600, marginBottom: '8px' }}>TJSys PDV</h1>
          <p style={{ color: '#757575', marginBottom: 0 }}>Sistema de Ponto de Venda</p>
        </div>

        {error && (
          <div style={{
            background: '#fce4ec', color: '#c62828', padding: '12px 16px',
            borderRadius: '8px', marginBottom: '24px', fontSize: '0.875rem',
            display: 'flex', alignItems: 'center', gap: '8px'
          }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/>
            </svg>
            {error}
          </div>
        )}

        {success && (
          <div style={{
            background: '#e8f5e9', color: '#2e7d32', padding: '12px 16px',
            borderRadius: '8px', marginBottom: '24px', fontSize: '0.875rem',
            display: 'flex', alignItems: 'center', gap: '8px'
          }}>
            Login realizado com sucesso!
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: '24px' }}>
            <label htmlFor="apiKey" style={{
              display: 'block', fontSize: '0.875rem', fontWeight: 500,
              color: '#212121', marginBottom: '8px'
            }}>
              Chave de API (API Key)
            </label>
            <input
              type="password" id="apiKey" value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="Digite sua API Key"
              style={{
                width: '100%', padding: '14px 16px', fontSize: '1rem',
                border: '1px solid #e0e0e0', borderRadius: '8px',
                backgroundColor: '#fff', color: '#212121',
                transition: 'border-color 0.2s, box-shadow 0.2s', outline: 'none'
              }}
              onFocus={(e) => e.currentTarget.style.borderColor = '#1976d2'}
              onBlur={(e) => e.currentTarget.style.borderColor = '#e0e0e0'}
              autoComplete="off" required
            />
          </div>

          <Button type="submit" fullWidth loading={loading} style={{ marginBottom: '16px' }}>
            {loading ? 'Entrando...' : 'Entrar'}
          </Button>

          <p style={{ fontSize: '0.75rem', color: '#757575', textAlign: 'center', lineHeight: 1.5 }}>
            A API Key é gerada no painel web do TJSys.
            <br />
            <a href="#" style={{ color: '#1976d2', textDecoration: 'none' }}>Obter API Key no painel web</a>
          </p>
        </form>
      </Card>
    </div>
  );
}
