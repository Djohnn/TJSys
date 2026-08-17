export interface CachedProduct {
  id: string;
  sku: string;
  name: string;
  baseUnitId: string;
  requiresLot: boolean;
  requiresExpiry: boolean;
  isActive: boolean;
  price: string;
  priceUpdatedAt: string;
}

export interface CachedPrice {
  id: string;
  productId: string;
  amount: string;
  validFrom: string;
  validTo: string | null;
}

export interface SearchResult {
  products: CachedProduct[];
  fromCache: boolean;
}

class CatalogCacheImpl {
  async init(): Promise<void> {
    if (!localStorage.getItem('catalog_db_initialized')) {
      localStorage.setItem('catalog_products', '[]');
      localStorage.setItem('catalog_prices', '[]');
      localStorage.setItem('catalog_last_sync', '0');
      localStorage.setItem('catalog_db_initialized', '1');
    }
  }

  async syncFromBackend(): Promise<{ products: number; prices: number }> {
    localStorage.setItem('catalog_last_sync', Date.now().toString());
    return { products: 0, prices: 0 };
  }

  searchProducts(query: string): CachedProduct[] {
    const products = JSON.parse(localStorage.getItem('catalog_products') || '[]');
    const q = query.toLowerCase();
    return products.filter((p: any) =>
      (p.sku || '').toLowerCase().includes(q) || (p.name || '').toLowerCase().includes(q)
    ).slice(0, 20);
  }

  getProductById(id: string): any {
    const products = JSON.parse(localStorage.getItem('catalog_products') || '[]');
    return products.find((p: any) => p.id === id) || null;
  }

  getProductBySku(sku: string): any {
    const products = JSON.parse(localStorage.getItem('catalog_products') || '[]');
    return products.find((p: any) => p.sku === sku) || null;
  }

  getPrice(productId: string): any {
    const prices = JSON.parse(localStorage.getItem('catalog_prices') || '[]');
    const now = new Date().toISOString();
    return prices
      .filter((p: any) => p.product_id === productId && p.valid_from <= now && (!p.valid_to || p.valid_to > now))
      .sort((a: any, b: any) => new Date(b.valid_from).getTime() - new Date(a.valid_from).getTime())[0] || null;
  }

  updateProduct(product: any): void {
    const products = JSON.parse(localStorage.getItem('catalog_products') || '[]');
    const index = products.findIndex((p: any) => p.id === product.id);
    if (index >= 0) products[index] = product;
    else products.push(product);
    localStorage.setItem('catalog_products', JSON.stringify(products));
  }

  updatePrice(price: any): void {
    const prices = JSON.parse(localStorage.getItem('catalog_prices') || '[]');
    const index = prices.findIndex((p: any) => p.id === price.id);
    if (index >= 0) prices[index] = price;
    else prices.push(price);
    localStorage.setItem('catalog_prices', JSON.stringify(prices));
  }

  getLastSync(): Date | null {
    const timestamp = localStorage.getItem('catalog_last_sync');
    return timestamp ? new Date(parseInt(timestamp)) : null;
  }
}

export const catalogCache = new CatalogCacheImpl();
