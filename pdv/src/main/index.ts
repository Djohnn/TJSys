import 'dotenv/config';
import { app, BrowserWindow, dialog } from 'electron';
import { join } from 'path';
import { isDev } from './utils/env';
import { setupAuthHandlers } from './ipc/auth';
import { setupApiHandlers } from './ipc/api';
import { setupCatalogHandlers } from './ipc/catalog';
import { setupDeviceHandlers } from './ipc/device';
import { setupSaleHandlers } from './ipc/sale';
import { setupCashSessionHandlers } from './ipc/cash-session';
import { setupCatalogCacheHandlers } from './ipc/catalog-cache';
import { setupSyncHandlers } from './ipc/sync';
import { setupConnectivityHandlers } from './ipc/connectivity';
import { setupPrintingHandlers } from './ipc/printing';
import { catalogCache } from './services/catalogCache';
import { operationJournal } from './services/operationJournal';
import { connectivityMonitor } from './services/connectivityMonitor';
import { syncEngine } from './services/syncEngine';
import { logger } from './utils/logger';

let mainWindow: Electron.BrowserWindow | null = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 1024,
    minHeight: 720,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
    titleBarStyle: 'hidden',
    titleBarOverlay: {
      color: '#ffffff',
      symbolColor: '#000000',
    },
    show: false,
    icon: join(__dirname, '../../build/icon.png'),
  });

  if (isDev()) {
    const devUrl = process.env.VITE_DEV_SERVER_URL || 'http://localhost:5173';
    mainWindow.loadURL(devUrl);
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'));
  }

  mainWindow.once('ready-to-show', () => {
    mainWindow?.show();
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.whenReady().then(async () => {
  // Initialize services
  catalogCache.init();
  operationJournal.init();
  connectivityMonitor.init();
  syncEngine.init();

  // Setup IPC handlers
  setupAuthHandlers();
  setupApiHandlers();
  setupCatalogHandlers();
  setupCatalogCacheHandlers();
  setupDeviceHandlers();
  setupSaleHandlers();
  setupCashSessionHandlers();
  setupSyncHandlers();
  setupConnectivityHandlers();
  setupPrintingHandlers();

  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

process.on('uncaughtException', (error) => {
  logger.error('Uncaught exception:', error);
  if (mainWindow) {
    dialog.showErrorBox('Erro Inesperado', `Ocorreu um erro inesperado: ${error.message}`);
  }
});

process.on('unhandledRejection', (reason) => {
  logger.error('Unhandled rejection:', reason);
});
