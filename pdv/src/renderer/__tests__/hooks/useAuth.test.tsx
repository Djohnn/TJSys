import { renderHook, act, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useAuth } from '../../hooks/useAuth';

describe('useAuth', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it('persiste a api_key no login e valida a sessão após reload', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response(JSON.stringify({
        token: 'access-token',
        refresh_token: 'refresh-token',
        device_id: 'device-1',
        branch_id: 'branch-1',
      }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        token: 'access-token-reloaded',
        refresh_token: 'refresh-token-reloaded',
        device_id: 'device-1',
        branch_id: 'branch-1',
      }), { status: 200 }));

    const firstMount = renderHook(() => useAuth());
    await waitFor(() => expect(firstMount.result.current.loading).toBe(false));

    await act(async () => {
      await firstMount.result.current.login('api-key-1');
    });

    expect(localStorage.getItem('api_key')).toBe('api-key-1');
    firstMount.unmount();

    const reloaded = renderHook(() => useAuth());
    await waitFor(() => expect(reloaded.result.current.loading).toBe(false));

    expect(reloaded.result.current.isAuthenticated).toBe(true);
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      '/api/v1/devices/validate/',
      expect.objectContaining({
        body: JSON.stringify({ api_key: 'api-key-1' }),
      }),
    );
  });
});
