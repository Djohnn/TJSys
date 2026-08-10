import { ipcMain } from 'electron';
import { api } from '../services/api';
import { logger } from '../utils/logger';

export function setupCashSessionHandlers() {
  ipcMain.handle('cash-session:open', async (_event, data: { branch: string; openingAmount: string }) => {
    logger.info('Opening cash session', { branch: data.branch });
    try {
      const res = await api.post('/cash-sessions/open/', {
        branch: data.branch,
        opening_amount: data.openingAmount,
      }, {
        headers: { 'Idempotency-Key': crypto.randomUUID() },
      });
      return { success: true, data: res.data };
    } catch (error) {
      logger.error('Failed to open cash session:', error);
      return { success: false, error: error instanceof Error ? error.message : 'Failed to open cash session' };
    }
  });

  ipcMain.handle('cash-session:current', async (_event, branchId: string) => {
    logger.info('Getting current cash session', { branchId });
    try {
      const res = await api.get('/cash-sessions/current/', { params: { branch: branchId } });
      return { success: true, data: res.data };
    } catch (error) {
      logger.error('Failed to get current cash session:', error);
      return { success: false, error: error instanceof Error ? error.message : 'Failed to get cash session' };
    }
  });

  ipcMain.handle('cash-session:close', async (_event, data: { sessionId: string; closingAmount: string }) => {
    logger.info('Closing cash session', { sessionId: data.sessionId });
    try {
      const res = await api.post(`/cash-sessions/${data.sessionId}/close/`, {
        closing_amount: data.closingAmount,
      }, {
        headers: { 'Idempotency-Key': crypto.randomUUID() },
      });
      return { success: true, data: res.data };
    } catch (error) {
      logger.error('Failed to close cash session:', error);
      return { success: false, error: error instanceof Error ? error.message : 'Failed to close cash session' };
    }
  });

  ipcMain.handle('cash-session:list', async (_event, params?: { branch?: string }) => {
    try {
      const res = await api.get('/cash-sessions/', { params });
      return { success: true, data: res.data };
    } catch (error) {
      logger.error('Failed to list cash sessions:', error);
      return { success: false, error: error instanceof Error ? error.message : 'Failed to list cash sessions' };
    }
  });

  ipcMain.handle('cash-session:movements', async (_event, sessionId: string) => {
    try {
      const res = await api.get(`/cash-sessions/${sessionId}/movements/`);
      return { success: true, data: res.data };
    } catch (error) {
      logger.error('Failed to get cash movements:', error);
      return { success: false, error: error instanceof Error ? error.message : 'Failed to get movements' };
    }
  });
}
