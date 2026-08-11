import Database from 'better-sqlite3';
import { app } from 'electron';
import { copyFileSync, existsSync } from 'node:fs';
import { join } from 'path';
import { logger } from '../utils/logger';
import { api } from './api';
import { getItem } from '../utils/storage';

const TENANT_ID_KEY = 'tenant_id';

export interface CachedProduct {
  id: string;
  sku: string;
  name: string;
  base_unit_id: string;
  requires_lot: boolean;
  requires_expiry: boolean;
  is_active: boolean;
  updated_at: string;
}

export interface CachedPrice {
  id: string;
  product_id: string;
  amount: string;
  valid_from: string;
  valid_to: string | null;
  updated_at: string;
}

export interface SearchResult {
  products: CachedProduct[];
  fromCache: boolean;
}

interface BackendProduct {
  id: string;
  sku: string;
  name: string;
  base_unit: string;
  requires_lot?: boolean;
  requires_expiry?: boolean;
  is_active?: boolean;
  updated_at?: string;
}

interface BackendProductPrice {
  id: string;
  amount: string | number;
  valid_from: string;
  valid_to?: string | null;
  updated_at?: string;
  is_active?: boolean;
}

interface PaginatedResponse<T> {
  results?: T[];
  next?: string | null;
}

class CatalogCache {
  private db: Database.Database | null = null;
  private tenantId: string | null = null;
  private lastSync: Date | null = null;
  private syncTail: Promise<void> = Promise.resolve();

  init(tenantId?: string): void {
    this.close();
    if (tenantId) this.ensureTenantDatabase(tenantId);
  }

  private databasePath(tenantId: string): string {
    const safeTenantId = encodeURIComponent(tenantId).replace(/%/g, '_');
    return join(app.getPath('userData'), `catalog-${safeTenantId}.db`);
  }

  private quarantineLegacyDatabase(): void {
    const userData = app.getPath('userData');
    const legacyPath = join(userData, 'catalog.db');
    const quarantinePath = join(userData, 'catalog-legacy-unscoped.db');

    if (!existsSync(legacyPath) || existsSync(quarantinePath)) return;

    // The legacy database has no tenant identity. Preserve it as a backup,
    // but never copy its rows into a tenant-scoped database.
    copyFileSync(legacyPath, quarantinePath);
    logger.warn(`Legacy catalog database quarantined at ${quarantinePath}`);
  }

  private ensureTenantDatabase(tenantId: string | null = getItem(TENANT_ID_KEY) ?? this.tenantId): boolean {
    if (!tenantId) {
      this.close();
      logger.warn('Catalog cache unavailable without tenant context');
      return false;
    }

    if (this.db && this.tenantId === tenantId) return true;

    this.close();
    this.quarantineLegacyDatabase();
    this.db = new Database(this.databasePath(tenantId));
    this.db.pragma('journal_mode = WAL');
    this.tenantId = tenantId;
    this.createTables();
    return true;
  }

  private createTables(): void {
    if (!this.db) return;

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS products (
        id TEXT PRIMARY KEY,
        sku TEXT NOT NULL,
        name TEXT NOT NULL,
        base_unit_id TEXT NOT NULL,
        requires_lot INTEGER NOT NULL DEFAULT 0,
        requires_expiry INTEGER NOT NULL DEFAULT 0,
        is_active INTEGER NOT NULL DEFAULT 1,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS prices (
        id TEXT PRIMARY KEY,
        product_id TEXT NOT NULL,
        amount TEXT NOT NULL,
        valid_from TEXT NOT NULL,
        valid_to TEXT,
        updated_at TEXT NOT NULL,
        FOREIGN KEY (product_id) REFERENCES products(id)
      );

      CREATE INDEX IF NOT EXISTS idx_products_sku ON products(sku);
      CREATE INDEX IF NOT EXISTS idx_products_name ON products(name);
      CREATE INDEX IF NOT EXISTS idx_prices_product ON prices(product_id);
    `);
  }

  async syncFromBackend(): Promise<{ products: number; prices: number }> {
    const previousSync = this.syncTail;
    let release!: () => void;
    this.syncTail = new Promise<void>((resolve) => { release = resolve; });
    await previousSync;
    try {
      return await this.refreshCatalogSnapshot();
    } finally {
      release();
    }
  }

  private async refreshCatalogSnapshot(): Promise<{ products: number; prices: number }> {
    if (!this.db) {
      logger.warn('Catalog cache not initialized');
      return { products: 0, prices: 0 };
    }

    if (!this.ensureTenantDatabase()) return { products: 0, prices: 0 };

    try {
      const products: BackendProduct[] = [];
      const pricesByProduct = new Map<string, BackendProductPrice[]>();

      let nextUrl: string | null = '/products/';
      let firstRequest = true;
      const visitedUrls = new Set<string>();

      while (nextUrl) {
        if (visitedUrls.has(nextUrl)) throw new Error(`Repeated catalog cursor: ${nextUrl}`);
        visitedUrls.add(nextUrl);
        const response = firstRequest
          ? await api.get(nextUrl, { params: { page_size: 100, is_active: 'true' } })
          : await api.get(nextUrl);
        firstRequest = false;

        const page = response.data as PaginatedResponse<BackendProduct>;
        const results = page.results || [];
        if (results.length === 0) {
          break;
        }

        products.push(...results);

        // Fetch prices for each product
        for (const product of results) {
          try {
            const prices: BackendProductPrice[] = [];
            let priceUrl: string | null = `/products/${product.id}/prices/`;
            let firstPriceRequest = true;
            const visitedPriceUrls = new Set<string>();
            while (priceUrl) {
              if (visitedPriceUrls.has(priceUrl)) throw new Error(`Repeated price cursor: ${priceUrl}`);
              visitedPriceUrls.add(priceUrl);
              const priceResponse = firstPriceRequest
                ? await api.get(priceUrl, { params: { is_active: 'true' } })
                : await api.get(priceUrl);
              firstPriceRequest = false;
              const priceData = priceResponse.data as PaginatedResponse<BackendProductPrice> | BackendProductPrice[];
              if (Array.isArray(priceData)) {
                prices.push(...priceData);
                priceUrl = null;
              } else {
                prices.push(...(priceData.results || []));
                priceUrl = priceData.next ?? null;
              }
            }

            pricesByProduct.set(product.id, prices);
          } catch (priceError) {
            throw new Error(`Prices unavailable for product ${product.id}`, { cause: priceError });
          }
        }

        // Check if there are more pages
        nextUrl = page.next ?? null;
      }

      const productIds = new Set(products.map((product) => product.id));
      const refresh = this.db.transaction(() => {
        const deleteObsoletePrices = this.db!.prepare(
          `DELETE FROM prices${productIds.size ? ` WHERE product_id NOT IN (${Array.from(productIds, () => '?').join(',')})` : ''}`
        );
        const deleteObsoleteProducts = this.db!.prepare(
          `DELETE FROM products${productIds.size ? ` WHERE id NOT IN (${Array.from(productIds, () => '?').join(',')})` : ''}`
        );
        const insertProduct = this.db!.prepare(`
          INSERT OR REPLACE INTO products
          (id, sku, name, base_unit_id, requires_lot, requires_expiry, is_active, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `);
        const deletePrices = this.db!.prepare('DELETE FROM prices WHERE product_id = ?');
        const insertPrice = this.db!.prepare(`
          INSERT OR REPLACE INTO prices
          (id, product_id, amount, valid_from, valid_to, updated_at)
          VALUES (?, ?, ?, ?, ?, ?)
        `);

        if (productIds.size) {
          deleteObsoletePrices.run(...Array.from(productIds));
          deleteObsoleteProducts.run(...Array.from(productIds));
        } else {
          this.db!.prepare('DELETE FROM prices').run();
          deleteObsoleteProducts.run();
        }

        for (const product of products) {
          insertProduct.run(
            product.id, product.sku, product.name, product.base_unit,
            product.requires_lot ? 1 : 0, product.requires_expiry ? 1 : 0,
            product.is_active ? 1 : 0, product.updated_at || new Date().toISOString()
          );
          deletePrices.run(product.id);
          for (const productPrice of pricesByProduct.get(product.id) ?? []) {
            if (productPrice.amount !== undefined && productPrice.is_active !== false) {
              insertPrice.run(
                productPrice.id, product.id, productPrice.amount,
                productPrice.valid_from, productPrice.valid_to ?? null,
                productPrice.updated_at || new Date().toISOString()
              );
            }
          }
        }

        return Array.from(pricesByProduct.values()).reduce(
          (count, productPrices) => count + productPrices.filter((item) => item.amount !== undefined && item.is_active !== false).length,
          0
        );
      });
      const totalPrices = refresh();
      const totalProducts = products.length;
      this.lastSync = new Date();
      logger.info(`Catalog sync completed: ${totalProducts} products, ${totalPrices} prices`);

      return { products: totalProducts, prices: totalPrices };
    } catch (error) {
      logger.error('Failed to sync catalog from backend:', error);
      // No database write happens before the final transaction. Returning a
      // zero result makes the failed snapshot explicit to its caller.
      return { products: 0, prices: 0 };
    }
  }

  searchProducts(query: string): CachedProduct[] {
    if (!this.ensureTenantDatabase()) return [];
    const db = this.db;
    if (!db) return [];

    const stmt = db.prepare(`
      SELECT * FROM products 
      WHERE (sku LIKE ? OR name LIKE ?) AND is_active = 1
      ORDER BY sku
      LIMIT 20
    `);

    const searchTerm = `%${query}%`;
    return stmt.all(searchTerm, searchTerm) as CachedProduct[];
  }

  getProductById(id: string): CachedProduct | null {
    if (!this.ensureTenantDatabase()) return null;
    const db = this.db;
    if (!db) return null;
    const stmt = db.prepare('SELECT * FROM products WHERE id = ?');
    return (stmt.get(id) as CachedProduct | undefined) ?? null;
  }

  getProductBySku(sku: string): CachedProduct | null {
    if (!this.ensureTenantDatabase()) return null;
    const db = this.db;
    if (!db) return null;
    const stmt = db.prepare('SELECT * FROM products WHERE sku = ? AND is_active = 1');
    return (stmt.get(sku) as CachedProduct | undefined) ?? null;
  }

  getPrice(productId: string, at: Date = new Date()): CachedPrice | null {
    if (!this.ensureTenantDatabase()) return null;
    const db = this.db;
    if (!db) return null;
    const stmt = db.prepare(`
      SELECT * FROM prices 
      WHERE product_id = ? AND valid_from <= ?
      AND (valid_to IS NULL OR valid_to > ?)
      ORDER BY valid_from DESC
      LIMIT 1
    `);
    const atStr = at.toISOString();
    return (stmt.get(productId, atStr, atStr) as CachedPrice | undefined) ?? null;
  }

  updateProduct(product: CachedProduct): void {
    if (!this.db) return;
    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO products 
      (id, sku, name, base_unit_id, requires_lot, requires_expiry, is_active, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);
    stmt.run(
      product.id, product.sku, product.name, product.base_unit_id,
      product.requires_lot ? 1 : 0, product.requires_expiry ? 1 : 0,
      product.is_active ? 1 : 0, product.updated_at
    );
  }

  updatePrice(price: CachedPrice): void {
    if (!this.db) return;
    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO prices 
      (id, product_id, amount, valid_from, valid_to, updated_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    stmt.run(
      price.id, price.product_id, price.amount,
      price.valid_from, price.valid_to, price.updated_at
    );
  }

  getLastSync(): Date | null {
    return this.lastSync;
  }

  close(): void {
    if (this.db) {
      this.db.close();
      this.db = null;
    }
    this.tenantId = null;
  }
}

export const catalogCache = new CatalogCache();
