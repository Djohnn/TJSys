import { ipcMain } from 'electron';
import { api } from '../services/api';
import { logger } from '../utils/logger';
import type {
  CashSessionCloseInput,
  CashSessionOpenInput,
  ElectronResult,
} from '../../shared/electron';
import type { CashMovement, CashSession } from '../../shared/types';
import { unwrapResults, type PaginatedResponse } from './response';

export function setupCashSessionHandlers() {
  ipcMain.handle('cash-session:open', async (
    _event,
    data: CashSessionOpenInput,
  ): Promise<ElectronResult<CashSession>> => {
    logger.info('Opening cash session', { branch: data.branch });
    try {
      const res = await api.post<CashSession>('/cash-sessions/open/', {
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

  ipcMain.handle('cash-session:current', async (
    _event,
    branchId: string,
  ): Promise<ElectronResult<CashSession | null>> => {
    logger.info('Getting current cash session', { branchId });
    try {
      const res = await api.get<CashSession>('/cash-sessions/current/', { params: { branch: branchId } });
      return { success: true, data: res.data };
    } catch (error) {
      logger.error('Failed to get current cash session:', error);
      return { success: false, error: error instanceof Error ? error.message : 'Failed to get cash session' };
    }
  });

  ipcMain.handle('cash-session:close', async (
    _event,
    data: CashSessionCloseInput,
  ): Promise<ElectronResult<CashSession>> => {
    logger.info('Closing cash session', { sessionId: data.sessionId });
    try {
      const res = await api.post<CashSession>(`/cash-sessions/${data.sessionId}/close/`, {
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

  ipcMain.handle('cash-session:list', async (
    _event,
    params?: { branch?: string },
  ): Promise<ElectronResult<CashSession[]>> => {
    try {
      const res = await api.get<CashSession[] | PaginatedResponse<CashSession>>('/cash-sessions/', { params });
      return { success: true, data: unwrapResults(res.data) };
    } catch (error) {
      logger.error('Failed to list cash sessions:', error);
      return { success: false, error: error instanceof Error ? error.message : 'Failed to list cash sessions' };
    }
  });

  ipcMain.handle('cash-session:movements', async (
    _event,
    sessionId: string,
  ): Promise<ElectronResult<CashMovement[]>> => {
    try {
      const res = await api.get<CashMovement[] | PaginatedResponse<CashMovement>>(`/cash-sessions/${sessionId}/movements/`);
      return { success: true, data: unwrapResults(res.data) };
    } catch (error) {
      logger.error('Failed to get cash movements:', error);
      return { success: false, error: error instanceof Error ? error.message : 'Failed to get movements' };
    }
  });
}
