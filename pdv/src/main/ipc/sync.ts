import { ipcMain, IpcMainInvokeEvent } from 'electron';
import { operationJournal } from '../services/operationJournal';
import { syncEngine } from '../services/syncEngine';
import { logger } from '../utils/logger';

export function setupSyncHandlers() {
  ipcMain.handle('sync:status', async () => {
    return { success: true, data: syncEngine.getState() };
  });

  ipcMain.handle('sync:start', async () => {
    try {
      const state = await syncEngine.syncAll();
      return { success: true, data: state };
    } catch (error) {
      logger.error('Manual sync failed:', error);
      return { success: false, error: error instanceof Error ? error.message : 'Sync failed' };
    }
  });

  ipcMain.handle('sync:pending', async () => {
    try {
      const pending = operationJournal.getPending();
      return { success: true, data: { count: pending.length, operations: pending } };
    } catch (error) {
      logger.error('Failed to get pending operations:', error);
      return { success: false, error: error instanceof Error ? error.message : 'Failed to get pending' };
    }
  });

  ipcMain.handle('sync:journal', async () => {
    try {
      const entries = operationJournal.getAll();
      return { success: true, data: entries };
    } catch (error) {
      logger.error('Failed to get journal:', error);
      return { success: false, error: error instanceof Error ? error.message : 'Failed to get journal' };
    }
  });
}
