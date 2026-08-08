import { app, BrowserWindow, ipcMain } from 'electron';
import { writeFile, unlink } from 'fs/promises';
import { join } from 'path';
import { logger } from '../utils/logger';

type PrintReceiptPayload = {
  html: string;
  fileName: string;
};

function sanitizeFileName(fileName: string): string {
  return fileName.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 80) || 'cupom_nao_fiscal';
}

export function setupPrintingHandlers() {
  ipcMain.handle('printing:receipt', async (_event, payload: PrintReceiptPayload) => {
    return handlePrint(payload);
  });

  ipcMain.handle('printing:fiscal', async (_event, payload: PrintReceiptPayload) => {
    const header = `
      <div style="text-align:center;margin-bottom:16px;padding-bottom:12px;border-bottom:2px solid #333">
        <h2 style="margin:0;font-size:1rem">CUPOM FISCAL</h2>
        <small style="color:#666">Documento Fiscal Eletrônico</small>
      </div>`;
    return handlePrint({ html: header + payload.html, fileName: payload.fileName });
  });

  ipcMain.handle('printing:balcao', async (_event, payload: PrintReceiptPayload) => {
    const header = `
      <div style="text-align:center;margin-bottom:16px;padding-bottom:12px;border-bottom:2px solid #333">
        <h2 style="margin:0;font-size:1rem">CUPOM BALCÃO</h2>
        <small style="color:#666">Comprovante Não Fiscal</small>
      </div>`;
    return handlePrint({ html: header + payload.html, fileName: payload.fileName });
  });
}

async function handlePrint(payload: PrintReceiptPayload) {
  const safeFileName = sanitizeFileName(payload.fileName);
  const pdfPath = join(app.getPath('temp'), `${safeFileName}.pdf`);
  let printWindow: BrowserWindow | null = null;

  try {
    printWindow = new BrowserWindow({
      show: false,
      webPreferences: {
        sandbox: true,
        nodeIntegration: false,
        contextIsolation: true,
      },
    });

    await printWindow.loadURL(
      `data:text/html;charset=utf-8,${encodeURIComponent(payload.html)}`,
    );

    // PDF é gerado só como intermediário técnico do printToPDF,
    // não é persistido — é apagado no finally, abaixo.
    const pdf = await printWindow.webContents.printToPDF({
      printBackground: true,
      pageSize: {
        width: 80000,
        height: 500000,
      },
      margins: {
        marginType: 'none',
      },
    });
    await writeFile(pdfPath, pdf);

    await new Promise<void>((resolve, reject) => {
      printWindow?.webContents.print(
        {
          silent: false,
          printBackground: true,
        },
        (success, failureReason) => {
          if (success) {
            resolve();
            return;
          }
          reject(new Error(failureReason || 'Falha ao abrir impressão do cupom.'));
        },
      );
    });

    return { success: true };
  } catch (error) {
    logger.error('Failed to print receipt:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Falha ao imprimir cupom.',
    };
  } finally {
    printWindow?.close();
    try {
      await unlink(pdfPath);
    } catch {
      // arquivo pode não ter chegado a ser criado; ignora.
    }
  }
}
