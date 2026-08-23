import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './contexts/AuthContext';
import { Login } from './pages/Login';
import { Dashboard } from './pages/Dashboard';
import { Sale } from './pages/Sale';
import { CashSession } from './pages/CashSession';
import { SyncPending } from './pages/SyncPending';
import { SyncIndicator } from './components/SyncIndicator';
import { SyncStatusBar } from './components/SyncStatusBar';
import { ErrorBoundary } from './components/ErrorBoundary';

function PrivateRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated } = useAuth();
  return isAuthenticated ? <>{children}</> : <Navigate to="/login" replace />;
}

function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh' }}>
      <div style={{
        display: 'flex',
        justifyContent: 'flex-end',
        alignItems: 'center',
        padding: '8px 16px',
        background: '#fff',
        borderBottom: '1px solid #e0e0e0',
        minHeight: '48px',
      }}>
        <SyncIndicator />
      </div>
      <div style={{ flex: 1, overflow: 'auto' }}>
        {children}
      </div>
      <SyncStatusBar />
    </div>
  );
}

export function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route
        path="/*"
        element={
          <PrivateRoute>
            <ErrorBoundary>
              <AppLayout>
                <Routes>
                  <Route path="/" element={<Navigate to="/dashboard" replace />} />
                  <Route path="/dashboard" element={<Dashboard />} />
                  <Route path="/sale" element={<Sale />} />
                  <Route path="/cash-session" element={<CashSession />} />
                  <Route path="/sync-pending" element={<SyncPending />} />
                </Routes>
              </AppLayout>
            </ErrorBoundary>
          </PrivateRoute>
        }
      />
    </Routes>
  );
}
