import { ipcMain, IpcMainInvokeEvent } from 'electron';
import { api } from '../services/api';
import { connectivityMonitor } from '../services/connectivityMonitor';
import { contingencyPolicy } from '../services/contingencyPolicy';
import { logger } from '../utils/logger';

export function setupCashSessionHandlers() {
  ipcMain.handle('cash-session:open', async (event: IpcMainInvokeEvent, data: { branch: string; openingAmount: string }) => {
    logger.info('Opening cash session', { branch: data.branch });
    if (!connectivityMonitor.isOnline()) {
      return {
        success: false,
        error: 'Cash session open is not allowed offline; reconnect first.',
        code: 'offline_cash_session_blocked',
      };
    }
    try {
      const res = await api.post('/cash-sessions/open/', {
        branch: data.branch,
        opening_amount: data.openingAmount,
      }, {
        headers: { 'Idempotency-Key': crypto.randomUUID() },
      });
      contingencyPolicy.recordOnlineHeartbeat(extractServerTime(res.headers?.date, res.data));
      return { success: true, data: res.data };
    } catch (error) {
      logger.error('Failed to open cash session:', error);
      return { success: false, error: error instanceof Error ? error.message : 'Failed to open cash session' };
    }
  });

  ipcMain.handle('cash-session:current', async (event: IpcMainInvokeEvent, branchId: string) => {
    logger.info('Getting current cash session', { branchId });
    try {
      const res = await api.get('/cash-sessions/current/', { params: { branch: branchId } });
      contingencyPolicy.recordOnlineHeartbeat(extractServerTime(res.headers?.date, res.data));
      return { success: true, data: res.data };
    } catch (error) {
      logger.error('Failed to get current cash session:', error);
      return { success: false, error: error instanceof Error ? error.message : 'Failed to get cash session' };
    }
  });

  ipcMain.handle('cash-session:close', async (event: IpcMainInvokeEvent, data: { sessionId: string; closingAmount: string }) => {
    logger.info('Closing cash session', { sessionId: data.sessionId });
    if (!connectivityMonitor.isOnline()) {
      return {
        success: false,
        error: 'Cash session close is not allowed offline; reconnect first.',
        code: 'offline_cash_session_blocked',
      };
    }
    try {
      const res = await api.post(`/cash-sessions/${data.sessionId}/close/`, {
        closing_amount: data.closingAmount,
      }, {
        headers: { 'Idempotency-Key': crypto.randomUUID() },
      });
      contingencyPolicy.recordOnlineHeartbeat(extractServerTime(res.headers?.date, res.data));
      return { success: true, data: res.data };
    } catch (error) {
      logger.error('Failed to close cash session:', error);
      return { success: false, error: error instanceof Error ? error.message : 'Failed to close cash session' };
    }
  });

  ipcMain.handle('cash-session:list', async (event: IpcMainInvokeEvent, params?: { branch?: string }) => {
    try {
      const res = await api.get('/cash-sessions/', { params });
      contingencyPolicy.recordOnlineHeartbeat(extractServerTime(res.headers?.date, res.data));
      return { success: true, data: res.data };
    } catch (error) {
      logger.error('Failed to list cash sessions:', error);
      return { success: false, error: error instanceof Error ? error.message : 'Failed to list cash sessions' };
    }
  });

  ipcMain.handle('cash-session:movements', async (event: IpcMainInvokeEvent, sessionId: string) => {
    try {
      const res = await api.get(`/cash-sessions/${sessionId}/movements/`);
      contingencyPolicy.recordOnlineHeartbeat(extractServerTime(res.headers?.date, res.data));
      return { success: true, data: res.data };
    } catch (error) {
      logger.error('Failed to get cash movements:', error);
      return { success: false, error: error instanceof Error ? error.message : 'Failed to get movements' };
    }
  });
}

function extractServerTime(headerDate: unknown, payload: unknown): string | null {
  if (typeof headerDate === 'string' && headerDate.trim()) return headerDate;
  if (payload && typeof payload === 'object' && !Array.isArray(payload)) {
    const serverTime = (payload as { server_time?: unknown }).server_time;
    if (typeof serverTime === 'string' && serverTime.trim()) return serverTime;
  }
  return null;
}
