import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, act, fireEvent } from '@testing-library/react';
import { SyncIndicator } from '../../components/SyncIndicator';
import { getElectronAPI } from '../../../shared/electron';

beforeEach(() => {
  window.electronAPI = {
    ...getElectronAPI(),
    getConnectivityStatus: vi.fn(),
    checkConnectivity: vi.fn(),
    getSyncStatus: vi.fn(),
    startSync: vi.fn(),
  };
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('SyncIndicator', () => {
  it('shows online state with enabled button when connected and no pending', async () => {
    vi.mocked(window.electronAPI.getConnectivityStatus).mockResolvedValue({
      success: true, data: { isOnline: true, lastOnlineAt: null, lastOfflineAt: null, lastSyncAt: null },
    });
    vi.mocked(window.electronAPI.getSyncStatus).mockResolvedValue({
      success: true, data: { status: 'idle', pendingCount: 0, lastSyncAt: null, error: null },
    });
    render(<SyncIndicator />);
    await waitFor(() => {
      expect(screen.getByText('Online')).toBeInTheDocument();
    });
    expect(screen.getByRole('button')).not.toBeDisabled();
  });

  it('shows offline state with ENABLED button when disconnected (click to check)', async () => {
    vi.mocked(window.electronAPI.getConnectivityStatus).mockResolvedValue({
      success: true, data: { isOnline: false, lastOnlineAt: null, lastOfflineAt: null, lastSyncAt: null },
    });
    vi.mocked(window.electronAPI.getSyncStatus).mockResolvedValue({
      success: true, data: { status: 'idle', pendingCount: 0, lastSyncAt: null, error: null },
    });
    render(<SyncIndicator />);
    await waitFor(() => {
      expect(screen.getByText('Offline')).toBeInTheDocument();
    });
    // Button should be ENABLED to allow manual connectivity check
    expect(screen.getByRole('button')).not.toBeDisabled();
  });

  it('shows pending count when there are pending items', async () => {
    vi.mocked(window.electronAPI.getConnectivityStatus).mockResolvedValue({
      success: true, data: { isOnline: true, lastOnlineAt: null, lastOfflineAt: null, lastSyncAt: null },
    });
    vi.mocked(window.electronAPI.getSyncStatus).mockResolvedValue({
      success: true, data: { status: 'idle', pendingCount: 3, lastSyncAt: null, error: null },
    });
    render(<SyncIndicator />);
    await waitFor(() => {
      expect(screen.getByText('3 pendentes')).toBeInTheDocument();
    });
  });

  it('shows singular pending label for single item', async () => {
    vi.mocked(window.electronAPI.getConnectivityStatus).mockResolvedValue({
      success: true, data: { isOnline: true, lastOnlineAt: null, lastOfflineAt: null, lastSyncAt: null },
    });
    vi.mocked(window.electronAPI.getSyncStatus).mockResolvedValue({
      success: true, data: { status: 'idle', pendingCount: 1, lastSyncAt: null, error: null },
    });
    render(<SyncIndicator />);
    await waitFor(() => {
      expect(screen.getByText('1 pendente')).toBeInTheDocument();
    });
  });

  it('shows syncing state with disabled button during sync', async () => {
    vi.mocked(window.electronAPI.getConnectivityStatus).mockResolvedValue({
      success: true, data: { isOnline: true, lastOnlineAt: null, lastOfflineAt: null, lastSyncAt: null },
    });
    vi.mocked(window.electronAPI.getSyncStatus).mockResolvedValue({
      success: true, data: { status: 'syncing', pendingCount: 5, lastSyncAt: null, error: null },
    });
    render(<SyncIndicator />);
    await waitFor(() => {
      expect(screen.getByText('Sincronizando...')).toBeInTheDocument();
    });
    expect(screen.getByRole('button')).toBeDisabled();
  });

  it('triggers sync on click when online with pending items', async () => {
    vi.mocked(window.electronAPI.getConnectivityStatus).mockResolvedValue({
      success: true, data: { isOnline: true, lastOnlineAt: null, lastOfflineAt: null, lastSyncAt: null },
    });
    vi.mocked(window.electronAPI.getSyncStatus).mockResolvedValue({
      success: true, data: { status: 'idle', pendingCount: 2, lastSyncAt: null, error: null },
    });
    vi.mocked(window.electronAPI.startSync).mockResolvedValue({
      success: true, data: { status: 'idle', pendingCount: 0, lastSyncAt: null, error: null },
    });
    render(<SyncIndicator />);
    await waitFor(() => {
      expect(screen.getByText('2 pendentes')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button'));
    expect(window.electronAPI.startSync).toHaveBeenCalledTimes(1);
  });

  it('does not trigger sync when offline', async () => {
    vi.mocked(window.electronAPI.getConnectivityStatus).mockResolvedValue({
      success: true, data: { isOnline: false, lastOnlineAt: null, lastOfflineAt: null, lastSyncAt: null },
    });
    vi.mocked(window.electronAPI.getSyncStatus).mockResolvedValue({
      success: true, data: { status: 'idle', pendingCount: 2, lastSyncAt: null, error: null },
    });
    render(<SyncIndicator />);
    await waitFor(() => {
      expect(screen.getByText('Offline')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button'));
    expect(window.electronAPI.startSync).not.toHaveBeenCalled();
  });

  it('triggers connectivity check when clicking offline button', async () => {
    vi.mocked(window.electronAPI.getConnectivityStatus).mockResolvedValue({
      success: true, data: { isOnline: false, lastOnlineAt: null, lastOfflineAt: null, lastSyncAt: null },
    });
    vi.mocked(window.electronAPI.getSyncStatus).mockResolvedValue({
      success: true, data: { status: 'idle', pendingCount: 0, lastSyncAt: null, error: null },
    });
    vi.mocked(window.electronAPI.checkConnectivity).mockResolvedValue({
      success: true, data: { isOnline: true },
    });
    render(<SyncIndicator />);
    await waitFor(() => {
      expect(screen.getByText('Offline')).toBeInTheDocument();
    });

    // Click offline button to trigger connectivity check
    fireEvent.click(screen.getByRole('button'));
    await waitFor(() => {
      expect(window.electronAPI.checkConnectivity).toHaveBeenCalledTimes(1);
    });
  });

  it('updates state on polling interval', async () => {
    vi.useFakeTimers();
    vi.mocked(window.electronAPI.getConnectivityStatus).mockResolvedValue({
      success: true, data: { isOnline: true, lastOnlineAt: null, lastOfflineAt: null, lastSyncAt: null },
    });
    vi.mocked(window.electronAPI.getSyncStatus).mockResolvedValue({
      success: true, data: { status: 'idle', pendingCount: 0, lastSyncAt: null, error: null },
    });
    render(<SyncIndicator />);

    await vi.waitFor(() => {
      expect(screen.queryByText('Online')).toBeInTheDocument();
    }, { interval: 50, timeout: 3000 });

    vi.mocked(window.electronAPI.getSyncStatus).mockResolvedValue({
      success: true, data: { status: 'idle', pendingCount: 7, lastSyncAt: null, error: null },
    });

    act(() => {
      vi.advanceTimersByTime(15000);
    });

    await vi.waitFor(() => {
      expect(screen.queryByText('7 pendentes')).toBeInTheDocument();
    }, { interval: 50, timeout: 3000 });
    vi.useRealTimers();
  });

  it('falls back to offline when connectivity fetch fails', async () => {
    vi.mocked(window.electronAPI.getConnectivityStatus).mockRejectedValue(new Error('fail'));
    vi.mocked(window.electronAPI.getSyncStatus).mockResolvedValue({
      success: true, data: { status: 'idle', pendingCount: 0, lastSyncAt: null, error: null },
    });
    render(<SyncIndicator />);
    await waitFor(() => {
      expect(screen.getByText('Offline')).toBeInTheDocument();
    });
    // Button should be ENABLED to allow manual check
    expect(screen.getByRole('button')).not.toBeDisabled();
  });
});
