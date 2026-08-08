// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  printMock: vi.fn((_options, callback) => callback(true)),
  printToPDFMock: vi.fn().mockResolvedValue(Buffer.from('pdf')),
  loadURLMock: vi.fn().mockResolvedValue(undefined),
  closeMock: vi.fn(),
  writeFileMock: vi.fn().mockResolvedValue(undefined),
  unlinkMock: vi.fn().mockResolvedValue(undefined),
  getPathMock: vi.fn().mockReturnValue('C:\\temp'),
  handleMock: vi.fn(),
}));

vi.mock('electron', () => ({
  app: {
    getPath: mocks.getPathMock,
  },
  BrowserWindow: vi.fn().mockImplementation(function () {
    return {
      loadURL: mocks.loadURLMock,
      close: mocks.closeMock,
      webContents: {
        print: mocks.printMock,
        printToPDF: mocks.printToPDFMock,
      },
    };
  }),
  ipcMain: {
    handle: mocks.handleMock,
  },
}));

vi.mock('fs/promises', () => ({
  writeFile: mocks.writeFileMock,
  unlink: mocks.unlinkMock,
}));

vi.mock('../utils/logger', () => ({
  logger: { error: vi.fn() },
}));

import { setupPrintingHandlers } from '../ipc/printing';

describe('printing IPC', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.printMock.mockImplementation((_options, callback) => callback(true));
    mocks.printToPDFMock.mockResolvedValue(Buffer.from('pdf'));
    mocks.loadURLMock.mockResolvedValue(undefined);
    mocks.writeFileMock.mockResolvedValue(undefined);
    mocks.unlinkMock.mockResolvedValue(undefined);
    mocks.getPathMock.mockReturnValue('C:\\temp');
  });

  it('prints via data URL sem persistir HTML, com PDF temporário apagado no finally', async () => {
    setupPrintingHandlers();
    const handler = mocks.handleMock.mock.calls.find(([channel]) => channel === 'printing:receipt')?.[1];

    const result = await handler({}, {
      fileName: 'cupom_nao_fiscal_sale-1',
      html: '<html><body>Produto PDV</body></html>',
    });

    expect(mocks.loadURLMock).toHaveBeenCalledWith(
      'data:text/html;charset=utf-8,' + encodeURIComponent('<html><body>Produto PDV</body></html>'),
    );
    expect(mocks.printToPDFMock).toHaveBeenCalledOnce();
    expect(mocks.writeFileMock).toHaveBeenCalledWith(
      'C:\\temp\\cupom_nao_fiscal_sale-1.pdf',
      Buffer.from('pdf'),
    );
    expect(mocks.unlinkMock).toHaveBeenCalledWith('C:\\temp\\cupom_nao_fiscal_sale-1.pdf');
    expect(mocks.printMock).toHaveBeenCalledWith(
      expect.objectContaining({ silent: false, printBackground: true }),
      expect.any(Function),
    );
    expect(mocks.closeMock).toHaveBeenCalledOnce();
    expect(result).toEqual({ success: true });
  });

  it('não escreve nenhum arquivo .html em disco', async () => {
    setupPrintingHandlers();
    const handler = mocks.handleMock.mock.calls.find(([channel]) => channel === 'printing:receipt')?.[1];

    await handler({}, {
      fileName: 'cupom_balcao_sale-2',
      html: '<html><body>x</body></html>',
    });

    const htmlWrites = mocks.writeFileMock.mock.calls.filter(([, , encoding]) => encoding === 'utf-8');
    expect(htmlWrites).toHaveLength(0);
    expect(mocks.writeFileMock.mock.calls.every(([path]) => !path.endsWith('.html'))).toBe(true);
  });

  it('retorna erro e ainda apaga o PDF temporário quando o printToPDF falha', async () => {
    mocks.printToPDFMock.mockRejectedValueOnce(new Error('printToPDF exploded'));
    setupPrintingHandlers();
    const handler = mocks.handleMock.mock.calls.find(([channel]) => channel === 'printing:receipt')?.[1];

    const result = await handler({}, {
      fileName: 'cupom_nao_fiscal_sale-3',
      html: '<html><body>x</body></html>',
    });

    expect(result).toEqual({
      success: false,
      error: 'printToPDF exploded',
    });
    expect(mocks.unlinkMock).toHaveBeenCalledWith('C:\\temp\\cupom_nao_fiscal_sale-3.pdf');
    expect(mocks.closeMock).toHaveBeenCalledOnce();
  });

  it('exposição printing:fiscal e printing:balcao adicionam o cabeçalho correto', async () => {
    setupPrintingHandlers();
    const fiscal = mocks.handleMock.mock.calls.find(([channel]) => channel === 'printing:fiscal')?.[1];
    const balcao = mocks.handleMock.mock.calls.find(([channel]) => channel === 'printing:balcao')?.[1];

    const html = '<html><body>corpo</body></html>';
    await fiscal({}, { fileName: 'cupom_fiscal_1', html });
    await balcao({}, { fileName: 'cupom_balcao_1', html });

    const loaded = mocks.loadURLMock.mock.calls.map(([url]) => decodeURIComponent(url));
    expect(loaded[0]).toContain('CUPOM FISCAL');
    expect(loaded[1]).toContain('CUPOM BALCÃO');
    expect(loaded[0]).toContain(html);
    expect(loaded[1]).toContain(html);
  });
});
