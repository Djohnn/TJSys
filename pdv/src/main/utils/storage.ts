import { app } from 'electron';
import * as fs from 'fs';
import { join } from 'path';

const STORAGE_FILE = 'tjsys-pdv-state.json';

function getStoragePath(): string {
  return join(app.getPath('userData'), STORAGE_FILE);
}

function readStore(): Record<string, string> {
  try {
    const data = fs.readFileSync(getStoragePath(), 'utf-8');
    return JSON.parse(data);
  } catch {
    return {};
  }
}

function writeStore(store: Record<string, string>): void {
  fs.writeFileSync(getStoragePath(), JSON.stringify(store, null, 2), 'utf-8');
}

export function getItem(key: string): string | null {
  const store = readStore();
  return store[key] ?? null;
}

export function setItem(key: string, value: string): void {
  const store = readStore();
  store[key] = value;
  writeStore(store);
}

export function removeItem(key: string): void {
  const store = readStore();
  delete store[key];
  writeStore(store);
}

export function clear(): void {
  writeStore({});
}
