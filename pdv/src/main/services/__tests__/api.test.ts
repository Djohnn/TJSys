import { beforeEach, describe, expect, it, vi } from 'vitest';

const axiosMocks = vi.hoisted(() => {
  const instance = Object.assign(vi.fn(), {
    interceptors: {
      request: { use: vi.fn() },
      response: { use: vi.fn() },
    },
  });

  return { instance, post: vi.fn() };
});

const storageMocks = vi.hoisted(() => ({
  getItem: vi.fn(),
  setItem: vi.fn(),
  removeItem: vi.fn(),
}));

vi.mock('axios', () => ({
  default: {
    create: vi.fn(() => axiosMocks.instance),
    post: axiosMocks.post,
  },
}));

vi.mock('../../utils/storage', () => storageMocks);

import '../api';

type RejectedResponseHandler = (error: unknown) => Promise<unknown>;

const getRejectedResponseHandler = (): RejectedResponseHandler =>
  axiosMocks.instance.interceptors.response.use.mock.calls[0][1];

describe('API do processo principal', () => {
  beforeEach(() => {
    axiosMocks.instance.mockReset();
    axiosMocks.post.mockReset();
    storageMocks.getItem.mockReset();
    storageMocks.setItem.mockReset();
    storageMocks.removeItem.mockReset();
  });

  it('envia o tenant persistido no header de cada requisição', () => {
    storageMocks.getItem.mockImplementation((key: string) => {
      if (key === 'access_token') return 'access-token';
      if (key === 'tenant_id') return 'tenant-1';
      return null;
    });
    const requestHandler = axiosMocks.instance.interceptors.request.use.mock.calls[0][0];

    expect(requestHandler({ headers: {} })).toMatchObject({
      headers: {
        Authorization: 'Bearer access-token',
        'X-Tenant-ID': 'tenant-1',
      },
    });
  });

  it('renova os dois tokens em uma URL sem barra duplicada e repete pela instância configurada', async () => {
    storageMocks.getItem.mockImplementation((key: string) => (key === 'refresh_token' ? 'refresh-antigo' : null));
    axiosMocks.post.mockResolvedValue({
      data: { token: 'access-novo', refresh_token: 'refresh-novo' },
    });
    axiosMocks.instance.mockResolvedValue({ data: 'ok' });
    const originalRequest = { headers: {} };

    await getRejectedResponseHandler()({
      response: { status: 401 },
      config: originalRequest,
    });

    expect(axiosMocks.post).toHaveBeenCalledWith('http://localhost:8000/api/v1/devices/refresh/', {
      refresh_token: 'refresh-antigo',
    });
    expect(storageMocks.setItem).toHaveBeenCalledWith('access_token', 'access-novo');
    expect(storageMocks.setItem).toHaveBeenCalledWith('refresh_token', 'refresh-novo');
    expect(axiosMocks.instance).toHaveBeenCalledWith(originalRequest);
    expect(originalRequest).toMatchObject({ _retry: true });
  });

  it('remove toda a identidade local quando a renovação falha', async () => {
    storageMocks.getItem.mockReturnValue('refresh-antigo');
    axiosMocks.post.mockRejectedValue(new Error('refresh falhou'));
    const error = { response: { status: 401 }, config: { headers: {} } };

    await expect(getRejectedResponseHandler()(error)).rejects.toBe(error);

    expect(storageMocks.removeItem.mock.calls.map(([key]) => key)).toEqual([
      'access_token',
      'refresh_token',
      'device_id',
      'branch_id',
      'tenant_id',
      'api_key',
    ]);
  });

  it('limpa a sessão quando a resposta não contém os dois tokens válidos', async () => {
    storageMocks.getItem.mockReturnValue('refresh-antigo');
    axiosMocks.post.mockResolvedValue({ data: { token: 'access-novo', refresh_token: '' } });
    const error = { response: { status: 401 }, config: { headers: {} } };

    await expect(getRejectedResponseHandler()(error)).rejects.toBe(error);

    expect(axiosMocks.instance).not.toHaveBeenCalled();
    expect(storageMocks.setItem).not.toHaveBeenCalled();
    expect(storageMocks.removeItem).toHaveBeenCalledWith('tenant_id');
    expect(storageMocks.removeItem).toHaveBeenCalledWith('api_key');
  });

  it('rejeita o erro original sem tentar refresh quando config está ausente', async () => {
    const error = { response: { status: 401 } };

    await expect(getRejectedResponseHandler()(error)).rejects.toBe(error);

    expect(axiosMocks.post).not.toHaveBeenCalled();
  });

  it('não tenta renovar novamente uma requisição já marcada com _retry', async () => {
    // Given
    const error = { response: { status: 401 }, config: { headers: {}, _retry: true } };

    // When
    await expect(getRejectedResponseHandler()(error)).rejects.toBe(error);

    // Then
    expect(axiosMocks.post).not.toHaveBeenCalled();
    expect(axiosMocks.instance).not.toHaveBeenCalled();
  });

  it('limpa a sessão quando o access token renovado está vazio', async () => {
    // Given
    storageMocks.getItem.mockReturnValue('refresh-antigo');
    axiosMocks.post.mockResolvedValue({ data: { token: '   ', refresh_token: 'refresh-novo' } });
    const error = { response: { status: 401 }, config: { headers: {} } };

    // When
    await expect(getRejectedResponseHandler()(error)).rejects.toBe(error);

    // Then
    expect(axiosMocks.instance).not.toHaveBeenCalled();
    expect(storageMocks.setItem).not.toHaveBeenCalled();
    expect(storageMocks.removeItem).toHaveBeenCalledWith('access_token');
    expect(storageMocks.removeItem).toHaveBeenCalledWith('refresh_token');
  });
});
