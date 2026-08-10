import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { SyncStatusBar } from '../../components/SyncStatusBar';

const MOCK_NOW = new Date('2025-06-15T10:00:00Z');

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(MOCK_NOW);
  window.electronAPI = {
    getConnectivityStatus: vi.fn(),
    checkConnectivity: vi.fn(),
    getSyncStatus: vi.fn(),
    startSync: vi.fn(),
  };
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('SyncStatusBar', () => {
  it('returns null when no sync state is available', () => {
    window.electronAPI.getSyncStatus.mockResolvedValue({ success: false, data: null });
    const { container } = render(<SyncStatusBar />);
    expect(container.innerHTML).toBe('');
  });

  it('shows synced status when idle with no pending', async () => {
    window.electronAPI.getSyncStatus.mockResolvedValue({
      success: true, data: { status: 'idle', pendingCount: 0, lastSyncAt: '2025-06-15T09:55:00Z', error: null },
    });
    render(<SyncStatusBar />);
    await vi.waitFor(() => {
      expect(screen.getByText(/Sincronizado/)).toBeInTheDocument();
    }, { timeout: 3000 });
  });

  it('shows pending count when there are pending operations', async () => {
    window.electronAPI.getSyncStatus.mockResolvedValue({
      success: true, data: { status: 'idle', pendingCount: 4, lastSyncAt: '2025-06-15T09:55:00Z', error: null },
    });
    render(<SyncStatusBar />);
    await vi.waitFor(() => {
      expect(screen.getByText(/4 pendentes/)).toBeInTheDocument();
    }, { timeout: 3000 });
  });

  it('shows sync button when there are pending items', async () => {
    window.electronAPI.getSyncStatus.mockResolvedValue({
      success: true, data: { status: 'idle', pendingCount: 2, lastSyncAt: '2025-06-15T09:55:00Z', error: null },
    });
    render(<SyncStatusBar />);
    await vi.waitFor(() => {
      expect(screen.getByText('Sincronizar agora')).toBeInTheDocument();
    }, { timeout: 3000 });
  });

  it('shows progress bar when syncing', async () => {
    window.electronAPI.getSyncStatus.mockResolvedValue({
      success: true, data: { status: 'syncing', pendingCount: 10, lastSyncAt: '2025-06-15T09:55:00Z', error: null },
    });
    render(<SyncStatusBar />);
    await vi.waitFor(() => {
      expect(screen.getByText(/Sincronizando/)).toBeInTheDocument();
    }, { timeout: 3000 });
  });

  it('triggers sync when clicking sync button', async () => {
    window.electronAPI.getSyncStatus.mockResolvedValue({
      success: true, data: { status: 'idle', pendingCount: 3, lastSyncAt: null, error: null },
    });
    window.electronAPI.startSync.mockResolvedValue({
      success: true, data: { status: 'idle', pendingCount: 0, lastSyncAt: null, error: null },
    });
    render(<SyncStatusBar />);
    await vi.waitFor(() => {
      expect(screen.getByText('Sincronizar agora')).toBeInTheDocument();
    }, { timeout: 3000 });

    fireEvent.click(screen.getByText('Sincronizar agora'));
    expect(window.electronAPI.startSync).toHaveBeenCalledTimes(1);
  });

  it('shows "Nunca sincronizado" when lastSyncAt is null', async () => {
    window.electronAPI.getSyncStatus.mockResolvedValue({
      success: true, data: { status: 'idle', pendingCount: 0, lastSyncAt: null, error: null },
    });
    render(<SyncStatusBar />);
    await vi.waitFor(() => {
      expect(screen.getByText(/Nunca sincronizado/)).toBeInTheDocument();
    }, { timeout: 3000 });
  });

  it('shows "Agora mesmo" for sync less than 1 minute ago', async () => {
    window.electronAPI.getSyncStatus.mockResolvedValue({
      success: true, data: { status: 'idle', pendingCount: 0, lastSyncAt: '2025-06-15T09:59:45Z', error: null },
    });
    render(<SyncStatusBar />);
    await vi.waitFor(() => {
      expect(screen.getByText(/Agora mesmo/)).toBeInTheDocument();
    }, { timeout: 3000 });
  });

  it('shows minutes ago for sync within the hour', async () => {
    window.electronAPI.getSyncStatus.mockResolvedValue({
      success: true, data: { status: 'idle', pendingCount: 0, lastSyncAt: '2025-06-15T09:55:00Z', error: null },
    });
    render(<SyncStatusBar />);
    await vi.waitFor(() => {
      expect(screen.getByText(/H\u00E1 5 min/)).toBeInTheDocument();
    }, { timeout: 3000 });
  });

  it('shows hours and minutes for sync older than an hour', async () => {
    window.electronAPI.getSyncStatus.mockResolvedValue({
      success: true, data: { status: 'idle', pendingCount: 0, lastSyncAt: '2025-06-15T07:45:00Z', error: null },
    });
    render(<SyncStatusBar />);
    await vi.waitFor(() => {
      expect(screen.getByText(/H\u00E1 2h 15min/)).toBeInTheDocument();
    }, { timeout: 3000 });
  });
});
