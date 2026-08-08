import { beforeEach, describe, expect, it, vi } from 'vitest';

const axiosMocks = vi.hoisted(() => {
  const instance = Object.assign(vi.fn(), {
    interceptors: {
      request: { use: vi.fn() },
      response: { use: vi.fn() },
    },
  });

  return { instance };
});

vi.mock('axios', () => ({
  default: {
    create: vi.fn(() => axiosMocks.instance),
  },
}));

import '../api';

type RejectedResponseHandler = (error: unknown) => Promise<unknown>;

const getRejectedResponseHandler = (): RejectedResponseHandler =>
  axiosMocks.instance.interceptors.response.use.mock.calls[0][1];

describe('API do renderer', () => {
  beforeEach(() => {
    localStorage.clear();
    axiosMocks.instance.mockReset();
    vi.restoreAllMocks();
  });

  it('renova os dois tokens em uma URL sem barra duplicada e repete pela instância configurada', async () => {
    localStorage.setItem('refresh_token', 'refresh-antigo');
    localStorage.setItem('tenant_id', 'tenant-1');
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({
        token: 'access-novo',
        refresh_token: 'refresh-novo',
      }),
    });
    vi.stubGlobal('fetch', fetchMock);
    axiosMocks.instance.mockResolvedValue({ data: 'ok' });
    const originalRequest = { headers: {} };

    await getRejectedResponseHandler()({
      response: { status: 401 },
      config: originalRequest,
    });

    expect(fetchMock).toHaveBeenCalledWith('/api/v1/devices/refresh/', expect.any(Object));
    expect(localStorage.getItem('access_token')).toBe('access-novo');
    expect(localStorage.getItem('refresh_token')).toBe('refresh-novo');
    expect(axiosMocks.instance).toHaveBeenCalledWith(originalRequest);
    expect(originalRequest).toMatchObject({ _retry: true });
  });

  it('remove toda a identidade local quando a renovação falha', async () => {
    for (const key of ['access_token', 'refresh_token', 'device_id', 'branch_id', 'tenant_id', 'api_key']) {
      localStorage.setItem(key, `${key}-valor`);
    }
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('refresh falhou')));
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const error = { response: { status: 401 }, config: { headers: {} } };

    await expect(getRejectedResponseHandler()(error)).rejects.toBe(error);

    expect(
      ['access_token', 'refresh_token', 'device_id', 'branch_id', 'tenant_id', 'api_key'].map((key) =>
        localStorage.getItem(key)
      )
    ).toEqual([null, null, null, null, null, null]);
  });
});
