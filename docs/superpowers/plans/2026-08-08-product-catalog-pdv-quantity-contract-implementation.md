# Product, Catalog, PDV, and Quantity Contract Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make every active product follow a stable create → price → PDV sale → stock update flow while displaying quantities according to the product unit.

**Architecture:** Preserve the backend's paginated catalog API and normalize collections at the frontend boundary. Use the existing `ProductPrice` model as the single base-price source, `Unit.symbol` plus `Unit.precision` as the quantity contract, and the existing transactional/idempotent sale service for stock effects. Pure quantity-formatting modules in web and PDV share the same contract cases, while backend validation remains authoritative.

**Tech Stack:** Django 5/DRF/pytest/PostgreSQL, React 18/TypeScript/TanStack Query/Vitest/Testing Library, Electron/React/Vitest, Playwright E2E, Graphify.

**Design spec:** `docs/superpowers/specs/2026-08-08-product-catalog-pdv-quantity-contract-design.md`

---

## File map

**New files**

- `frontend/src/api/collections.ts` — normalize array and paginated collection contracts.
- `frontend/src/api/collections.test.ts` — unit tests for valid and malformed collection payloads.
- `frontend/src/utils/quantity.ts` — web quantity formatting and precision checks.
- `frontend/src/utils/quantity.test.ts` — contract examples for UN and KG.
- `pdv/src/shared/quantity.ts` — PDV-safe quantity formatting and validation.
- `pdv/src/shared/__tests__/quantity.test.ts` — the same contract cases in the PDV package.
- `backend/catalog/services/quantity.py` — authoritative Decimal precision validation.
- `backend/catalog/migrations/0015_normalize_known_unit_precision.py` — fill missing KG precision without overwriting configured precision.
- `backend/tests/test_quantity_contract.py` — API/service contract for UN, KG, sales, and inventory.
- `frontend/e2e/product-pdv-stock-flow.spec.ts` — browser scenario for product creation and stock verification.
- `pdv/e2e/product-stock-sale.spec.ts` — browser scenario for search, three-unit sale, and no-price behavior.

**Modified files**

- `frontend/src/catalog/catalogApi.ts` — typed image, product, and base-price endpoints.
- `frontend/src/catalog/ProductMediaPanel.tsx` — local error state instead of editor crash.
- `frontend/src/catalog/ProductEditorPage.tsx` — stable edit URL and persisted identity.
- `frontend/src/catalog/ProductIdentityStep.tsx` — edit defaults and update submission.
- `frontend/src/catalog/ProductPricesStep.tsx` — base price before optional tiers.
- `frontend/src/catalog/catalogSchemas.ts` — persisted product mapping and price forms.
- `frontend/src/catalog/catalogPages.test.tsx` — editor, images, navigation, and price behavior.
- `backend/catalog/models.py` — enforce tier/base-price relationship in model validation.
- `backend/catalog/serializers.py` — unit metadata, price status, and tier validation.
- `backend/catalog/views.py` — efficient product/unit loading and existing price endpoints.
- `backend/inventory/serializers.py` — expose unit and branch metadata with balances/movements/lots.
- `backend/inventory/services/operations.py` — precision validation for every stock movement.
- `backend/inventory/services/product_stock.py` — validate initial stock and policy quantities.
- `backend/sales/services.py` — validate sold quantity before price/payment/stock writes.
- `backend/sales/views.py` — map precision and stock errors to stable problem codes.
- `frontend/src/inventory/inventoryApi.ts` — unit metadata in inventory response types.
- `frontend/src/inventory/BalancesPage.tsx` — formatted balance quantity.
- `frontend/src/inventory/MovementsPage.tsx` — formatted movement quantity.
- `frontend/src/inventory/LotsPage.tsx` — formatted lot quantity.
- `frontend/src/catalog/ProductInventoryStep.tsx` — shared formatter instead of string replacement.
- `frontend/src/purchasing/PurchaseOrderDetailPage.tsx` — formatted ordered quantity.
- `frontend/src/purchasing/ReceiptDetailPage.tsx` — formatted ordered/received quantities.
- `frontend/src/purchasing/ReceiptForm.tsx` — formatted read-only quantity labels.
- `frontend/src/inventory/inventoryPages.test.tsx` — visible integer/KG assertions.
- `frontend/src/purchasing/receiving.test.tsx` — receiving quantity assertions.
- `pdv/src/renderer/pages/Sale.tsx` — no-price guard and unit-aware quantity UI.
- `pdv/src/renderer/utils/receipt.ts` — unit-aware receipt quantity.
- `pdv/src/renderer/__tests__/pages/Sale.test.tsx` — no-price, integer, and KG behavior.
- `pdv/src/renderer/__tests__/utils/receipt.test.ts` — exact receipt strings.
- `backend/tests/test_pdv_device_flow.py` — product search price/unit contract and three-unit sale.
- `backend/tests/test_service_sales_inventory.py` — non-stock product regression.
- `.github/workflows/e2e.yml` — run the vertical product/PDV scenarios as a required gate.

---

### Task 1: Normalize image collections and isolate media failures

**Files:**

- Create: `frontend/src/api/collections.ts`
- Create: `frontend/src/api/collections.test.ts`
- Modify: `frontend/src/catalog/catalogApi.ts:53-78`
- Modify: `frontend/src/catalog/ProductMediaPanel.tsx:21-82`
- Test: `frontend/src/catalog/catalogPages.test.tsx:1890-1920`

- [ ] **Step 1: Write the failing collection contract tests**

```ts
import { describe, expect, it } from 'vitest'
import { collectionItems } from './collections'

describe('collectionItems', () => {
  const item = { id: 'img-1' }

  it('accepts a legacy array', () => {
    expect(collectionItems([item])).toEqual([item])
  })

  it('extracts results from a paginated response', () => {
    expect(collectionItems({ count: 1, next: null, previous: null, results: [item] }))
      .toEqual([item])
  })

  it('rejects a malformed collection', () => {
    expect(() => collectionItems({ results: null })).toThrow('Invalid collection response')
  })
})
```

- [ ] **Step 2: Run the new test and verify RED**

Run: `cd frontend && npm test -- --run src/api/collections.test.ts`

Expected: FAIL because `./collections` does not exist.

- [ ] **Step 3: Implement the collection boundary**

```ts
export interface CollectionPage<T> {
  count: number
  next: string | null
  previous: string | null
  results: T[]
}

export function collectionItems<T>(payload: unknown): T[] {
  if (Array.isArray(payload)) return payload as T[]
  if (
    payload !== null &&
    typeof payload === 'object' &&
    Array.isArray((payload as { results?: unknown }).results)
  ) {
    return (payload as { results: T[] }).results
  }
  throw new Error('Invalid collection response')
}
```

Change `fetchProductImages` to normalize at the API boundary:

```ts
export async function fetchProductImages(
  tenantId: string,
  productId: string,
): Promise<ProductImage[]> {
  const payload = await apiRequest<unknown>(`/catalog/products/${productId}/images/`, {
    tenantId,
  })
  return collectionItems<ProductImage>(payload)
}
```

Read query errors in `ProductMediaPanel` without dereferencing invalid data:

```tsx
const { data: images = [], isError } = useQuery({
  queryKey: ['product-images', tenantId, productId],
  queryFn: () => fetchProductImages(tenantId, productId!),
  enabled: !!tenantId && !!productId,
})

{isError && (
  <p role="alert" className="mb-3 text-sm text-red-600">
    Não foi possível carregar as imagens. O restante do cadastro permanece disponível.
  </p>
)}
```

- [ ] **Step 4: Add component regressions for paginated and malformed responses**

```ts
it('keeps the editor usable with paginated images', async () => {
  server.use(http.get(`${BASE}/catalog/products/p1/images/`, () =>
    HttpResponse.json({ count: 0, next: null, previous: null, results: [] }),
  ))
  renderProductEditorEdit()
  expect(await screen.findByTestId('product-editor-page')).toBeInTheDocument()
  expect(screen.getByTestId('step-tab-prices')).toBeEnabled()
})

it('shows a local media error instead of a blank page', async () => {
  server.use(http.get(`${BASE}/catalog/products/p1/images/`, () =>
    HttpResponse.json({ results: null }),
  ))
  renderProductEditorEdit()
  expect(await screen.findByRole('alert')).toHaveTextContent('carregar as imagens')
  expect(screen.getByTestId('step-tab-prices')).toBeEnabled()
})
```

- [ ] **Step 5: Run focused frontend tests**

Run: `cd frontend && npm test -- --run src/api/collections.test.ts src/catalog/catalogPages.test.tsx`

Expected: both test files PASS and no `images.filter is not a function` in output.

- [ ] **Step 6: Commit Task 1**

```bash
git add frontend/src/api/collections.ts frontend/src/api/collections.test.ts frontend/src/catalog/catalogApi.ts frontend/src/catalog/ProductMediaPanel.tsx frontend/src/catalog/catalogPages.test.tsx
git commit -m "fix(catalog): normalize product image collections"
```

---

### Task 2: Persist the product editor lifecycle in the URL

**Files:**

- Modify: `frontend/src/catalog/catalogApi.ts:100-210`
- Modify: `frontend/src/catalog/catalogSchemas.ts:1-90`
- Modify: `frontend/src/catalog/ProductEditorPage.tsx:31-116`
- Modify: `frontend/src/catalog/ProductIdentityStep.tsx:25-115`
- Test: `frontend/src/catalog/catalogPages.test.tsx:1058-1280`

- [ ] **Step 1: Write failing navigation and reload tests**

Add a location probe to the existing MemoryRouter test harness so the URL assertion observes router state without depending on `window.location`:

```ts
function LocationProbe() {
  const location = useLocation()
  return <span data-testid="location-display">{location.pathname}</span>
}
```

```ts
it('replaces the create URL with the persisted edit URL and opens prices', async () => {
  renderProductEditorCreate()
  await fillRequiredIdentityAndStock(user)
  await user.click(screen.getByRole('button', { name: 'Continuar' }))

  await waitFor(() => {
    expect(screen.getByTestId('location-display')).toHaveTextContent('/catalog/products/p-created/edit')
  })
  expect(screen.getByTestId('step-tab-prices')).toHaveAttribute('aria-selected', 'true')
})

it('loads persisted identity after opening the edit URL directly', async () => {
  renderProductEditorEdit('/catalog/products/p1/edit')
  expect(await screen.findByDisplayValue('Produto A')).toBeInTheDocument()
  expect(screen.getByDisplayValue('SKU-A')).toBeInTheDocument()
})
```

- [ ] **Step 2: Run the editor tests and verify RED**

Run: `cd frontend && npm test -- --run src/catalog/catalogPages.test.tsx -t "persisted edit URL|loads persisted identity"`

Expected: FAIL because creation remains on `/new` and edit identity has no loaded defaults.

- [ ] **Step 3: Add product retrieval and form mapping**

```ts
export function fetchProduct(tenantId: string, productId: string): Promise<Product> {
  return apiRequest<Product>(`/catalog/products/${productId}/`, { tenantId }) as Promise<Product>
}

export function productToFormData(product: Product): ProductFormData {
  return {
    name: product.name,
    description: product.description ?? '',
    sku: product.sku,
    barcode: product.barcode ?? '',
    category: product.category,
    unit: product.unit,
    is_active: product.is_active,
    product_kind: product.product_kind,
    brand: product.brand ?? '',
    model: product.model ?? '',
    tags: Array.isArray(product.tags) ? product.tags.join(', ') : '',
    scale_code: product.scale_code ?? '',
    tracks_inventory: product.tracks_inventory,
    stock: null,
  }
}
```

Extend the `Product` interface with `description`, `price`, `unit_symbol`, and `unit_precision` using the backend field names.

- [ ] **Step 4: Make create and edit use persisted state**

```tsx
const productQuery = useQuery({
  queryKey: ['product', tenantId, urlProductId],
  queryFn: () => fetchProduct(tenantId, urlProductId!),
  enabled: !!tenantId && !!urlProductId,
})

const updateMutation = useMutation({
  mutationFn: (data: ProductFormData) =>
    updateProduct(tenantId, urlProductId!, toProductPayload(data).product),
  onSuccess: () => setFeedback({ kind: 'success', text: 'Produto atualizado com sucesso.' }),
})

const handleIdentitySubmit = (data: ProductFormData) => {
  if (urlProductId) {
    updateMutation.mutate(data)
    return
  }
  createMutation.mutate(data)
}
```

Use the successful ID immediately:

```tsx
onSuccess: (result) => {
  navigate(`/catalog/products/${result.product.id}/edit`, { replace: true })
  setActiveTab('prices')
  setFeedback({ kind: 'success', text: 'Produto criado com sucesso.' })
}
```

Render the identity step only after persisted data loads:

```tsx
<ProductIdentityStep
  key={productQuery.data?.version ?? 'new'}
  initialData={productQuery.data ? productToFormData(productQuery.data) : undefined}
  onSubmit={handleIdentitySubmit}
/>
```

- [ ] **Step 5: Verify create, edit, and reload behavior**

Run: `cd frontend && npm test -- --run src/catalog/catalogPages.test.tsx -t "ProductEditorPage"`

Expected: editor tests PASS; create navigates to the edit URL; direct edit loads identity.

- [ ] **Step 6: Commit Task 2**

```bash
git add frontend/src/catalog/catalogApi.ts frontend/src/catalog/catalogSchemas.ts frontend/src/catalog/ProductEditorPage.tsx frontend/src/catalog/ProductIdentityStep.tsx frontend/src/catalog/catalogPages.test.tsx
git commit -m "fix(catalog): persist product editor lifecycle"
```

---

### Task 3: Make ProductPrice the base-price contract

**Files:**

- Modify: `backend/catalog/models.py:460-520`
- Modify: `backend/catalog/serializers.py:150-235`
- Modify: `backend/catalog/views.py:292-330,445-490`
- Modify: `frontend/src/catalog/catalogApi.ts:20-50,280-335`
- Modify: `frontend/src/catalog/catalogSchemas.ts:90-115`
- Modify: `frontend/src/catalog/ProductPricesStep.tsx:1-155`
- Test: `backend/tests/test_catalog_refactoring_api.py:360-520`
- Test: `frontend/src/catalog/catalogPages.test.tsx:814-900`

- [ ] **Step 1: Write backend RED tests for base price and tier ownership**

```py
@pytest.mark.django_db
def test_price_tier_requires_active_base_price_from_same_product(api_context):
    ctx = api_context
    other_price = ProductPrice.all_objects.create(
        tenant=ctx['tenant'],
        product=ctx['other_product'],
        amount=Decimal('9.90'),
        valid_from=timezone.now(),
    )
    response = ctx['client'].post(
        f"/api/v1/products/{ctx['product'].id}/price-tiers/",
        {'price': str(other_price.id), 'min_quantity': '2', 'amount': '8.90'},
        format='json',
    )
    assert response.status_code == 400
    assert 'price' in response.json()


@pytest.mark.django_db
def test_current_base_price_is_returned_by_product_search(api_context):
    ctx = api_context
    ProductPrice.all_objects.create(
        tenant=ctx['tenant'],
        product=ctx['product'],
        amount=Decimal('19.90'),
        valid_from=timezone.now(),
    )
    response = ctx['client'].get('/api/v1/products/?search=SKU-A')
    assert response.status_code == 200
    assert response.json()['results'][0]['price'] == '19.90'
    assert response.json()['results'][0]['price_status'] == 'priced'
```

- [ ] **Step 2: Run backend price tests and verify RED**

Run: `cd backend && ..\.venv\Scripts\python.exe -m pytest tests/test_catalog_refactoring_api.py -k "base_price or tier_requires" -q`

Expected: tier ownership is accepted incorrectly and `price_status` is missing.

- [ ] **Step 3: Enforce the tier relationship and explicit price state**

```py
class ProductPriceTierSerializer(FullCleanModelSerializer):
    def validate(self, attrs):
        attrs = super().validate(attrs)
        product = self.context['view'].kwargs.get('product_pk')
        price = attrs.get('price')
        if price is None:
            raise serializers.ValidationError({'price': 'Base price is required.'})
        if str(price.product_id) != str(product):
            raise serializers.ValidationError({'price': 'Base price must belong to this product.'})
        if price.tenant_id != self.context['request'].tenant.id or not price.is_active:
            raise serializers.ValidationError({'price': 'Base price must be active in this tenant.'})
        return attrs
```

Add explicit state to `ProductSerializer`:

```py
price_status = serializers.SerializerMethodField()

def get_price_status(self, obj):
    return 'priced' if self.get_price(obj) is not None else 'missing'
```

Include `price_status` in `fields` and prefetch/select data required by the existing price resolver without changing its precedence.

- [ ] **Step 4: Write frontend RED tests for base price before tiers**

```ts
it('creates a base price and links a quantity tier to it', async () => {
  renderProductEditorEdit()
  await user.click(screen.getByTestId('step-tab-prices'))
  await user.type(screen.getByLabelText('Preço-base'), '19.90')
  await user.click(screen.getByRole('button', { name: 'Salvar preço-base' }))
  expect(await screen.findByText('Preço-base salvo.')).toBeInTheDocument()

  await user.type(screen.getByTestId('tier-min-quantity-input'), '10')
  await user.type(screen.getByTestId('tier-amount-input'), '17.90')
  await user.click(screen.getByTestId('add-tier-button'))
  expect(lastTierRequest).toMatchObject({ price: 'price-1', min_quantity: '10', amount: '17.90' })
})
```

- [ ] **Step 5: Implement typed base-price API and UI**

```ts
export interface ProductPrice {
  id: string
  product: string
  amount: string
  valid_from: string
  valid_to: string | null
  is_active: boolean
  version: number
}

export interface ProductPriceTier {
  id: string
  product: string
  price: string | null
  min_quantity: string
  amount: string
  is_active: boolean
  version: number
}

export async function fetchProductPrices(tenantId: string, productId: string) {
  const payload = await apiRequest<unknown>(productExtensionPath(productId, 'prices'), { tenantId })
  return collectionItems<ProductPrice>(payload)
}

export function createProductPrice(tenantId: string, productId: string, amount: string) {
  return apiRequest<ProductPrice>(productExtensionPath(productId, 'prices'), {
    method: 'POST',
    tenantId,
    body: { amount, valid_from: new Date().toISOString() },
  }) as Promise<ProductPrice>
}

export function updateProductPrice(
  tenantId: string,
  productId: string,
  price: ProductPrice,
  amount: string,
) {
  return apiRequest<ProductPrice>(`${productExtensionPath(productId, 'prices')}${price.id}/`, {
    method: 'PATCH',
    tenantId,
    headers: { 'If-Match': String(price.version) },
    body: { amount },
  }) as Promise<ProductPrice>
}
```

In `ProductPricesStep`, disable tier creation until `activeBasePrice` exists and send:

```ts
createProductPriceTier(tenantId, productId, {
  price: activeBasePrice.id,
  min_quantity: data.min_quantity,
  amount: data.amount,
})
```

- [ ] **Step 6: Run backend and frontend pricing suites**

Run: `cd backend && ..\.venv\Scripts\python.exe -m pytest tests/test_catalog_pricing.py tests/test_catalog_refactoring_api.py -q`

Expected: all selected backend pricing tests PASS.

Run: `cd frontend && npm test -- --run src/catalog/catalogPages.test.tsx -t "Preços|price"`

Expected: base-price and tier UI tests PASS.

- [ ] **Step 7: Commit Task 3**

```bash
git add backend/catalog/models.py backend/catalog/serializers.py backend/catalog/views.py backend/tests/test_catalog_refactoring_api.py frontend/src/catalog/catalogApi.ts frontend/src/catalog/catalogSchemas.ts frontend/src/catalog/ProductPricesStep.tsx frontend/src/catalog/catalogPages.test.tsx
git commit -m "fix(pricing): establish product base price contract"
```

---

### Task 4: Enforce quantity precision in backend domain operations

**Files:**

- Create: `backend/catalog/services/quantity.py`
- Create: `backend/catalog/migrations/0015_normalize_known_unit_precision.py`
- Create: `backend/tests/test_quantity_contract.py`
- Modify: `backend/inventory/services/operations.py:20-45,185-345`
- Modify: `backend/inventory/services/product_stock.py:120-185`
- Modify: `backend/sales/services.py:231-345`
- Modify: `backend/sales/views.py:90-120`

- [ ] **Step 1: Write failing domain precision tests**

```py
from decimal import Decimal

import pytest

from catalog.services.quantity import QuantityPrecisionError, validate_quantity_for_unit


def test_un_accepts_integer_and_rejects_fraction(unit_un):
    assert validate_quantity_for_unit(Decimal('10.000000'), unit_un) == Decimal('10.000000')
    with pytest.raises(QuantityPrecisionError):
        validate_quantity_for_unit(Decimal('1.500000'), unit_un)


def test_kg_accepts_three_decimal_places(unit_kg):
    assert validate_quantity_for_unit(Decimal('0.500000'), unit_kg) == Decimal('0.500000')
    with pytest.raises(QuantityPrecisionError):
        validate_quantity_for_unit(Decimal('0.500100'), unit_kg)
```

Add integration scenarios to the same file: initial UN stock `10.5` is rejected, KG stock `1.500` succeeds, UN sale `1.5` is rejected before writes, and KG sale `1.000` succeeds.

- [ ] **Step 2: Run the quantity contract and verify RED**

Run: `cd backend && ..\.venv\Scripts\python.exe -m pytest tests/test_quantity_contract.py -q`

Expected: FAIL because the quantity service does not exist and fractional UN values are currently accepted.

- [ ] **Step 3: Implement the authoritative Decimal validator**

```py
from decimal import Decimal, InvalidOperation


class QuantityPrecisionError(ValueError):
    code = 'invalid_quantity_precision'


def validate_quantity_for_unit(value, unit):
    try:
        quantity = Decimal(str(value))
        quantum = Decimal('1').scaleb(-unit.precision)
        normalized = quantity.quantize(quantum)
    except (InvalidOperation, ValueError) as exc:
        raise QuantityPrecisionError('Quantity is not a valid decimal.') from exc
    if normalized != quantity:
        raise QuantityPrecisionError(
            f'Unit {unit.symbol} accepts at most {unit.precision} decimal places.'
        )
    return quantity
```

Call it before `create_stock_movement`, for all initial stock policy quantities, and for every normalized sale item. Sales must validate before creating `Sale`, `SalePayment`, or `StockOperation`.

- [ ] **Step 4: Map the domain error to a stable API problem**

```py
if isinstance(exc, QuantityPrecisionError):
    return _problem(exc, 'invalid_quantity_precision', status.HTTP_400_BAD_REQUEST)
```

Keep insufficient stock mapped to `409`; do not convert precision errors to conflicts.

- [ ] **Step 5: Add the safe KG precision data migration**

```py
from django.db import migrations


def set_kg_precision(apps, schema_editor):
    Unit = apps.get_model('catalog', 'Unit')
    Unit.objects.filter(symbol__iexact='KG', precision=0).update(precision=3)


class Migration(migrations.Migration):
    dependencies = [('catalog', '0014_productimage_file_alter_productimage_object_key')]
    operations = [migrations.RunPython(set_kg_precision, migrations.RunPython.noop)]
```

- [ ] **Step 6: Verify migration and backend integration**

Run: `cd backend && ..\.venv\Scripts\python.exe manage.py makemigrations --check --dry-run`

Expected: `No changes detected` for the Task 4 model state.

Run: `cd backend && ..\.venv\Scripts\python.exe -m pytest tests/test_quantity_contract.py tests/test_service_sales_inventory.py tests/test_pdv_device_flow.py -q`

Expected: all selected tests PASS.

- [ ] **Step 7: Commit Task 4**

```bash
git add backend/catalog/services/quantity.py backend/catalog/migrations/0015_normalize_known_unit_precision.py backend/inventory/services/operations.py backend/inventory/services/product_stock.py backend/sales/services.py backend/sales/views.py backend/tests/test_quantity_contract.py
git commit -m "feat(quantity): enforce unit precision in domain operations"
```

---

### Task 5: Expose unit metadata and format every web quantity surface

**Files:**

- Create: `frontend/src/utils/quantity.ts`
- Create: `frontend/src/utils/quantity.test.ts`
- Modify: `backend/catalog/serializers.py:65-120`
- Modify: `backend/inventory/serializers.py:55-165`
- Modify: `backend/inventory/views.py:418-450`
- Modify: `frontend/src/catalog/catalogApi.ts:3-24`
- Modify: `frontend/src/inventory/inventoryApi.ts:8-75`
- Modify: `frontend/src/inventory/BalancesPage.tsx:119-130`
- Modify: `frontend/src/inventory/MovementsPage.tsx:145-165`
- Modify: `frontend/src/inventory/LotsPage.tsx:115-132`
- Modify: `frontend/src/catalog/ProductInventoryStep.tsx:27-35,100-140`
- Modify: `frontend/src/purchasing/PurchaseOrderDetailPage.tsx:115-128`
- Modify: `frontend/src/purchasing/ReceiptDetailPage.tsx:80-92`
- Modify: `frontend/src/purchasing/ReceiptForm.tsx:145-255`
- Test: `frontend/src/inventory/inventoryPages.test.tsx`
- Test: `frontend/src/purchasing/receiving.test.tsx`

- [ ] **Step 1: Write exact formatter contract tests**

```ts
import { describe, expect, it } from 'vitest'
import { formatQuantity, quantityMatchesPrecision } from './quantity'

describe('formatQuantity', () => {
  const un = { symbol: 'UN', precision: 0 }
  const kg = { symbol: 'KG', precision: 3 }

  it.each([
    ['10.000000', '10'],
    ['100.000000', '100'],
    ['101.000000', '101'],
    ['1000.000000', '1000'],
  ])('formats indivisible %s as %s', (value, expected) => {
    expect(formatQuantity(value, un)).toBe(expected)
  })

  it.each([
    ['0.500000', '0.500kg'],
    ['1.000000', '1kg'],
    ['1.250000', '1.250kg'],
  ])('formats kilograms %s as %s', (value, expected) => {
    expect(formatQuantity(value, kg)).toBe(expected)
  })

  expect(quantityMatchesPrecision('1.5', un)).toBe(false)
  expect(quantityMatchesPrecision('0.500', kg)).toBe(true)
})
```

- [ ] **Step 2: Run formatter tests and verify RED**

Run: `cd frontend && npm test -- --run src/utils/quantity.test.ts`

Expected: FAIL because the utility does not exist.

- [ ] **Step 3: Implement string-safe formatting without floating-point conversion**

```ts
export interface QuantityUnit {
  symbol: string
  precision: number
}

function parts(value: string | number) {
  const raw = String(value).trim()
  const match = raw.match(/^(-?)(\d+)(?:\.(\d+))?$/)
  if (!match) return null
  return { sign: match[1], whole: match[2], fraction: match[3] ?? '' }
}

export function quantityMatchesPrecision(value: string | number, unit: QuantityUnit): boolean {
  const parsed = parts(value)
  if (!parsed) return false
  return parsed.fraction.replace(/0+$/, '').length <= unit.precision
}

export function formatQuantity(value: string | number, unit: QuantityUnit): string {
  const parsed = parts(value)
  if (!parsed) return String(value)
  const significant = parsed.fraction.replace(/0+$/, '')
  const suffix = unit.symbol.toUpperCase() === 'KG' ? 'kg' : ''
  if (unit.precision === 0 || significant.length === 0) {
    return `${parsed.sign}${parsed.whole}${suffix}`
  }
  const fixed = parsed.fraction.slice(0, unit.precision).padEnd(unit.precision, '0')
  return `${parsed.sign}${parsed.whole}.${fixed}${suffix}`
}
```

- [ ] **Step 4: Expose stable unit metadata in backend responses**

Add to `ProductSerializer`:

```py
unit_symbol = serializers.CharField(source='base_unit.symbol', read_only=True)
unit_precision = serializers.IntegerField(source='base_unit.precision', read_only=True)
```

Add to balance, movement, and lot serializers:

```py
unit_symbol = serializers.CharField(source='product.base_unit.symbol', read_only=True)
unit_precision = serializers.IntegerField(source='product.base_unit.precision', read_only=True)
branch_name = serializers.CharField(source='location.branch.name', read_only=True)
```

Include `product__base_unit` and `location__branch` in the corresponding `select_related` calls.

- [ ] **Step 5: Replace raw quantity rendering with the shared formatter**

Use the same call on each mapped surface:

```tsx
{formatQuantity(row.quantity, {
  symbol: row.unit_symbol,
  precision: row.unit_precision,
})}
```

Call `formatQuantity` directly in every listed file. Do not concatenate the existing `unit_name` column to KG output; show `0.500kg` once.

- [ ] **Step 6: Add visible web regressions**

```ts
it('renders unit stock without decimal noise and kilograms with three places', async () => {
  server.use(http.get(`${BASE}/inventory/balances/`, () => HttpResponse.json({
    count: 2, next: null, previous: null, results: [
      { ...balance, id: 'un', quantity: '10.000000', unit_symbol: 'UN', unit_precision: 0 },
      { ...balance, id: 'kg', quantity: '0.500000', unit_symbol: 'KG', unit_precision: 3 },
    ],
  })))
  renderWithProviders(<BalancesPage />, '/inventory/balances')
  expect(await screen.findByText('10')).toBeInTheDocument()
  expect(screen.getByText('0.500kg')).toBeInTheDocument()
  expect(screen.queryByText('10.000000')).not.toBeInTheDocument()
})
```

- [ ] **Step 7: Run web quantity and affected page suites**

Run: `cd frontend && npm test -- --run src/utils/quantity.test.ts src/inventory/inventoryPages.test.tsx src/purchasing/receiving.test.tsx src/catalog/catalogPages.test.tsx`

Expected: all selected files PASS with exact integer/KG strings.

- [ ] **Step 8: Commit Task 5**

```bash
git add backend/catalog/serializers.py backend/inventory/serializers.py backend/inventory/views.py frontend/src/utils/quantity.ts frontend/src/utils/quantity.test.ts frontend/src/catalog/catalogApi.ts frontend/src/inventory/inventoryApi.ts frontend/src/inventory/BalancesPage.tsx frontend/src/inventory/MovementsPage.tsx frontend/src/inventory/LotsPage.tsx frontend/src/catalog/ProductInventoryStep.tsx frontend/src/purchasing/PurchaseOrderDetailPage.tsx frontend/src/purchasing/ReceiptDetailPage.tsx frontend/src/purchasing/ReceiptForm.tsx frontend/src/inventory/inventoryPages.test.tsx frontend/src/purchasing/receiving.test.tsx
git commit -m "feat(quantity): format web quantities by unit"
```

---

### Task 6: Make the PDV reject missing prices and format quantities

**Files:**

- Create: `pdv/src/shared/quantity.ts`
- Create: `pdv/src/shared/__tests__/quantity.test.ts`
- Modify: `pdv/src/renderer/pages/Sale.tsx:1-180,260-420`
- Modify: `pdv/src/renderer/utils/receipt.ts:1-45`
- Test: `pdv/src/renderer/__tests__/pages/Sale.test.tsx`
- Test: `pdv/src/renderer/__tests__/utils/receipt.test.ts`

- [ ] **Step 1: Write PDV formatter and no-price RED tests**

```ts
it.each([
  ['10.000000', { symbol: 'UN', precision: 0 }, '10'],
  ['1000.000000', { symbol: 'UN', precision: 0 }, '1000'],
  ['0.500000', { symbol: 'KG', precision: 3 }, '0.500kg'],
  ['1.000000', { symbol: 'KG', precision: 3 }, '1kg'],
])('formats %s as %s', (value, unit, expected) => {
  expect(formatQuantity(value, unit)).toBe(expected)
})

it('shows an unpriced product but prevents adding it to the cart', async () => {
  mockProductSearch([{ ...product, price: null, price_status: 'missing' }])
  render(<Sale />)
  await user.type(screen.getByPlaceholderText(/Buscar produto/), 'Produto')
  await user.click(await screen.findByText(product.name))
  expect(screen.getByRole('alert')).toHaveTextContent('Produto sem preço de venda vigente')
  expect(screen.getByText('Carrinho (0)')).toBeInTheDocument()
})
```

- [ ] **Step 2: Run PDV focused tests and verify RED**

Run: `cd pdv && npm test -- src/shared/__tests__/quantity.test.ts src/renderer/__tests__/pages/Sale.test.tsx src/renderer/__tests__/utils/receipt.test.ts`

Expected: formatter module is missing and the current PDV adds a null price as zero.

- [ ] **Step 3: Implement the PDV shared formatter**

Copy the pure string-safe `QuantityUnit`, `quantityMatchesPrecision`, and `formatQuantity` contract from Task 5 into `pdv/src/shared/quantity.ts`. Keep it dependency-free so main, renderer, and receipts can import it.

- [ ] **Step 4: Add the price guard and unit-aware cart**

```tsx
const handleProductSelect = (product: any) => {
  if (product.price_status === 'missing' || product.price == null) {
    setError('Produto sem preço de venda vigente.')
    return
  }
  setError('')
  // retain the existing add/increment logic with Number(product.price)
}

const unit = {
  symbol: item.product.unit_symbol ?? 'UN',
  precision: item.product.unit_precision ?? 0,
}
```

Set quantity input `step` to `1` for precision 0 and `0.001` for KG precision 3. Before updating or submitting, call `quantityMatchesPrecision`; display `A unidade UN não aceita quantidade fracionada.` on failure.

- [ ] **Step 5: Format cart and receipt quantities**

```ts
export interface ReceiptItem {
  product?: { name?: string; unit_symbol?: string; unit_precision?: number } | string | null
  quantity: string | number
  line_total: string | number
}

export function formatReceiptQuantity(item: ReceiptItem): string {
  const product = typeof item.product === 'object' && item.product !== null ? item.product : {}
  return formatQuantity(item.quantity, {
    symbol: product.unit_symbol ?? 'UN',
    precision: product.unit_precision ?? 0,
  })
}
```

The receipt template must call `formatReceiptQuantity(item)` and produce `x3`, `x0.500kg`, or `x1kg`, never `x3.0`.

- [ ] **Step 6: Run PDV tests and build**

Run: `cd pdv && npm test -- src/shared/__tests__/quantity.test.ts src/renderer/__tests__/pages/Sale.test.tsx src/renderer/__tests__/utils/receipt.test.ts`

Expected: all selected tests PASS.

Run: `cd pdv && npm run build`

Expected: main, preload, and renderer builds PASS.

- [ ] **Step 7: Commit Task 6**

```bash
git add pdv/src/shared/quantity.ts pdv/src/shared/__tests__/quantity.test.ts pdv/src/renderer/pages/Sale.tsx pdv/src/renderer/utils/receipt.ts pdv/src/renderer/__tests__/pages/Sale.test.tsx pdv/src/renderer/__tests__/utils/receipt.test.ts
git commit -m "fix(pdv): guard prices and format sale quantities"
```

---

### Task 7: Prove transactional sale, stock decrement, and idempotency

**Files:**

- Modify: `backend/tests/test_pdv_device_flow.py:1-175`
- Modify: `backend/tests/test_service_sales_inventory.py:1-100`
- Modify: `backend/tests/test_quantity_contract.py`
- Modify only if RED exposes a defect: `backend/sales/services.py:250-355`
- Modify only if error mapping is wrong: `backend/sales/views.py:90-120,241-280`

- [ ] **Step 1: Add the three-unit stock scenario**

Add `from inventory.models import StockBalance` to the test module. Reset the fixture balance instead of posting a second receipt: `pdv_device_context` already seeds five units, and adding ten more would test 15 to 12 rather than the required 10 to 7 transition.

```py
def set_balance(ctx, quantity):
    balance = StockBalance.all_objects.get(
        tenant=ctx['tenant'],
        branch=ctx['branch'],
        product=ctx['product'],
        location=ctx['location'],
        unit=ctx['unit'],
    )
    balance.quantity = quantity
    balance.save(update_fields=['quantity', 'updated_at'])
    return balance


def post_counter_sale(client, ctx, *, quantity, payment, idempotency_key):
    return client.post(
        '/api/v1/sales/counter/',
        {
            'branch': str(ctx['branch'].id),
            'stock_location': str(ctx['location'].id),
            'items': [{
                'product': str(ctx['product'].id),
                'unit': str(ctx['unit'].id),
                'quantity': quantity,
                'factor': '1',
            }],
            'payments': [{'method': 'cash', 'amount': payment}],
        },
        format='json',
        HTTP_HOST='localhost',
        HTTP_IDEMPOTENCY_KEY=idempotency_key,
    )


@pytest.mark.django_db
def test_pdv_sale_of_three_units_changes_stock_from_ten_to_seven(pdv_device_context):
    ctx = pdv_device_context
    set_balance(ctx, quantity=Decimal('10'))
    client = _pdv_client(ctx)

    response = post_counter_sale(
        client,
        ctx,
        quantity='3',
        payment='37.50',
        idempotency_key='sale-three-units',
    )

    assert response.status_code == 201
    balance = StockBalance.all_objects.get(
        tenant=ctx['tenant'], product=ctx['product'], location=ctx['location'], lot=None,
    )
    assert balance.quantity == Decimal('7.000000')
    assert response.json()['items'][0]['quantity'] == '3.000000'
```

- [ ] **Step 2: Add idempotency, insufficient stock, and non-stock scenarios**

```py
same = post_counter_sale(client, ctx, quantity='3', payment='37.50', idempotency_key='sale-three-units')
assert same.status_code in (200, 201)
assert StockBalance.all_objects.get(pk=balance.pk).quantity == Decimal('7.000000')

insufficient = post_counter_sale(
    client, ctx, quantity='8', payment='100.00', idempotency_key='sale-too-many'
)
assert insufficient.status_code == 409
assert StockBalance.all_objects.get(pk=balance.pk).quantity == Decimal('7.000000')
assert Sale.all_objects.filter(tenant=ctx['tenant'], idempotency_key='sale-too-many').count() == 0
assert SalePayment.all_objects.filter(tenant=ctx['tenant'], sale__idempotency_key='sale-too-many').count() == 0
```

Keep the mixed product/service assertion that only the stock-controlled item generates a movement.

- [ ] **Step 3: Run RED or confirm existing domain behavior**

Run: `cd backend && ..\.venv\Scripts\python.exe -m pytest tests/test_pdv_device_flow.py tests/test_service_sales_inventory.py tests/test_quantity_contract.py -q`

Expected: either all new assertions PASS using the existing transaction, or a focused failure identifies an atomicity/error-mapping defect. Do not change production code when all assertions already pass.

- [ ] **Step 4: Apply the minimal production fix only for an observed RED**

The intended transaction boundary is the existing decorator:

```py
@transaction.atomic
def create_counter_sale(...):
    # validate item precision and resolve every price first
    # create Sale, stock operations, SaleItem, and SalePayment only after validation
```

If a failure shows `Sale` or `SalePayment` surviving an inventory exception, keep the exception inside this atomic function and remove any local exception swallowing. If idempotent replay returns a second stock operation, return the existing `Sale` before creating operations.

- [ ] **Step 5: Run the sales regression group**

Run: `cd backend && ..\.venv\Scripts\python.exe -m pytest tests/test_sales_services.py tests/test_sales_api.py tests/test_pdv_device_flow.py tests/test_service_sales_inventory.py tests/test_quantity_contract.py -q`

Expected: all selected sales, PDV, stock, and quantity tests PASS.

- [ ] **Step 6: Commit Task 7**

```bash
git add backend/tests/test_pdv_device_flow.py backend/tests/test_service_sales_inventory.py backend/tests/test_quantity_contract.py backend/sales/services.py backend/sales/views.py
git commit -m "test(sales): prove product stock and idempotency flow"
```

If production files were unchanged, omit them from `git add`.

---

### Task 8: Add vertical browser acceptance and CI gate

**Files:**

- Create: `frontend/e2e/product-pdv-stock-flow.spec.ts`
- Create: `pdv/e2e/product-stock-sale.spec.ts`
- Modify: `frontend/e2e/fixtures.ts`
- Modify: `pdv/e2e/fixtures/index.ts`
- Modify: `.github/workflows/e2e.yml`
- Modify if port collision exists: `pdv/electron.vite.config.ts:24-37`

- [ ] **Step 1: Write the admin browser scenario from the approved Gherkin**

```ts
test('creates a priced unit product with stock 10 and shows quantity 10', async ({ authenticatedPage: page }) => {
  const suffix = crypto.randomUUID().slice(0, 8)
  const sku = `E2E-PDV-${suffix}`
  const name = `Produto E2E ${suffix}`
  const unpricedSku = `E2E-NOPRICE-${suffix}`
  const unpricedName = `Produto sem preco ${suffix}`

  await page.goto('/catalog/products/new')
  await page.getByLabel('Nome', { exact: true }).fill(name)
  await page.getByLabel('SKU', { exact: true }).fill(sku)
  await page.getByLabel('Unidade', { exact: true }).selectOption({ label: 'Unidade' })
  await page.getByLabel('Tipo de Produto', { exact: true }).selectOption('revenda')
  await page.getByLabel('Controlar estoque', { exact: true }).check()
  await page.getByLabel('Filial', { exact: true }).selectOption({ label: 'E2E Branch' })
  await page.getByLabel('Local de estoque', { exact: true }).selectOption({ label: /Local E2E/ })
  await page.getByLabel('Quantidade inicial', { exact: true }).fill('10')
  await page.getByRole('button', { name: 'Continuar' }).click()

  await expect(page).toHaveURL(/\/catalog\/products\/[0-9a-f-]+\/edit/)
  await expect(page.getByTestId('step-tab-prices')).toHaveAttribute('aria-selected', 'true')
  await page.getByLabel('Preço-base').fill('19.90')
  await page.getByRole('button', { name: 'Salvar preço-base' }).click()
  await expect(page.getByText('Preço-base salvo.')).toBeVisible()

  await page.goto(`/inventory/balances?q=${encodeURIComponent(sku)}`)
  await expect(page.getByRole('row', { name: new RegExp(`${sku}.*10`) })).toBeVisible()
  await expect(page.getByText('10.000000')).toHaveCount(0)

  await createProductThroughEditor(page, {
    sku: unpricedSku,
    name: unpricedName,
    unit: 'Unidade',
    tracksInventory: false,
  })
  await expect(page).toHaveURL(/\/catalog\/products\/[0-9a-f-]+\/edit/)

  await writeFlowArtifact({
    sku,
    name,
    expectedPrice: '19.90',
    initialStock: '10',
    unpricedSku,
    unpricedName,
  })
})
```

Extract `createProductThroughEditor(page, input)` in this spec from the same semantic label interactions shown above. It must stop after identity persistence when `price` is omitted, so the second product exists with `price: null` and is not coupled to a backend shortcut.

Define the helper in `frontend/e2e/fixtures.ts`:

```ts
import fs from 'node:fs/promises'

const productFlowPath = path.resolve('../test-results/product-pdv-flow.json')

export async function writeFlowArtifact(value: {
  sku: string
  name: string
  expectedPrice: string
  initialStock: string
  unpricedSku: string
  unpricedName: string
}): Promise<void> {
  await fs.mkdir(path.dirname(productFlowPath), { recursive: true })
  await fs.writeFile(productFlowPath, JSON.stringify(value), 'utf8')
}
```

The helper writes only generated test identifiers into the shared repository-root path `test-results/product-pdv-flow.json`; do not commit that file. Both packages resolve it with `path.resolve('../test-results/product-pdv-flow.json')` when commands run from `frontend/` and `pdv/`.

- [ ] **Step 2: Write the PDV sale scenario**

```ts
import fs from 'node:fs/promises'
import path from 'node:path'
import { expect, test as base } from '@playwright/test'

import { authenticateAdminPage, installElectronApiStub } from './fixtures'

type FlowProduct = {
  sku: string
  name: string
  expectedPrice: string
  initialStock: string
  unpricedSku: string
  unpricedName: string
}

const test = base.extend<{ flowProduct: FlowProduct }>({
  flowProduct: async ({}, use) => {
    const artifact = path.resolve('../test-results/product-pdv-flow.json')
    let parsed: FlowProduct
    try {
      parsed = JSON.parse(await fs.readFile(artifact, 'utf8')) as FlowProduct
    } catch (error) {
      throw new Error(`Run the admin product setup scenario first: ${String(error)}`)
    }
    await use(parsed)
  },
})

test('sells three units and never sells a missing price as zero', async ({ page, browser, flowProduct }) => {
  const apiKey = process.env.E2E_DEVICE_API_KEY
  if (!apiKey) throw new Error('Defina E2E_DEVICE_API_KEY para o fluxo real do PDV.')

  await installElectronApiStub(page)
  await page.goto('/login')
  await page.getByLabel('Chave de API (API Key)').fill(apiKey)
  await page.getByRole('button', { name: 'Entrar' }).click()
  await page.waitForURL(/\/dashboard/)
  await page.goto('/sale')

  await page.getByPlaceholder(/Buscar produto/).fill(flowProduct.name)
  await page.getByText(flowProduct.name, { exact: true }).click()
  await page.getByLabel('Quantidade').fill('3')
  await expect(page.getByText('3')).toBeVisible()
  await page.getByLabel('Valor recebido').fill('59.70')
  await page.getByRole('button', { name: 'Adicionar Pagamento' }).click()
  await page.getByRole('button', { name: 'Confirmar Venda' }).click()
  await expect(page.getByText(/Venda confirmada/)).toBeVisible()
  await expect(page.getByText(/x3/)).toBeVisible()

  await page.getByRole('button', { name: /Fechar|Nova venda/ }).click()
  await page.getByPlaceholder(/Buscar produto/).fill(flowProduct.unpricedName)
  const unpricedResult = page.getByText(flowProduct.unpricedName, { exact: true })
  await expect(unpricedResult).toBeVisible()
  await expect(unpricedResult.locator('..')).toContainText('Sem preço')
  await unpricedResult.click()
  await expect(page.getByText('Cadastre um preço de venda antes de adicionar este produto.')).toBeVisible()
  await expect(page.getByText('Carrinho vazio')).toBeVisible()
})
```

Move the existing `window.electronAPI` initialization from `pdv/e2e/sale.spec.ts` into an exported `installElectronApiStub(page)` helper in `pdv/e2e/fixtures/index.ts`. Keep this spec on the real backend; do not import the mock-auth `loginPage` fixture. The artifact already carries the second product with `price: null`; assert it remains visible as `Sem preço`, shows the domain message when selected, and leaves the cart empty.

- [ ] **Step 3: Verify final stock through the admin UI**

Before the final `})` of the same PDV scenario, create a separate browser context for the admin origin. Export `authenticateAdminPage(page, adminUrl)` from `pdv/e2e/fixtures/index.ts`; it must use `E2E_USER_EMAIL`, `E2E_USER_PASSWORD`, and `E2E_RECOVERY_CODE` with the same MFA recovery flow as `frontend/e2e/fixtures.ts`. Then assert the persisted balance through the UI:

```ts
const adminUrl = process.env.E2E_ADMIN_URL ?? 'http://127.0.0.1:5174'
const adminContext = await browser.newContext()
const adminPage = await adminContext.newPage()
await authenticateAdminPage(adminPage, adminUrl)
await adminPage.goto(`${adminUrl}/inventory/balances?q=${encodeURIComponent(flowProduct.sku)}`)
await expect(adminPage.getByRole('row', { name: new RegExp(`${flowProduct.sku}.*7`) })).toBeVisible()
await expect(adminPage.getByText('7.000000')).toHaveCount(0)
await adminContext.close()
```

Add the KG browser case with initial `1.500`, sale `1`, and final visible `0.500kg`.

- [ ] **Step 4: Give frontend and PDV deterministic ports**

Use frontend at `127.0.0.1:5174` and the PDV renderer at `localhost:5173`. In `pdv/electron.vite.config.ts`:

```ts
server: {
  port: 5173,
  strictPort: true,
  proxy: {
    '/api': { target: 'http://localhost:8000', changeOrigin: true },
  },
},
```

No test may rely on Vite automatically choosing a different port.

- [ ] **Step 5: Run the vertical E2E locally**

Run backend seed: `cd backend && ..\.venv\Scripts\python.exe manage.py seed_e2e`

Run admin scenario: `cd frontend && npx playwright test e2e/product-pdv-stock-flow.spec.ts --project=chromium --retries=0`

Run PDV scenario: `cd pdv && npx playwright test e2e/product-stock-sale.spec.ts --project=chromium --retries=0`

Expected:

```text
Admin product/price/stock: 1 passed
PDV sale/no-price/KG: 3 passed
Final unit stock: 7
Final KG stock: 0.500kg
```

- [ ] **Step 6: Add the CI gate**

```yaml
- name: Product → PDV → stock acceptance
  run: |
    cd frontend
    npx playwright test e2e/product-pdv-stock-flow.spec.ts --project=chromium --retries=0
    cd ../pdv
    npx playwright test e2e/product-stock-sale.spec.ts --project=chromium --retries=0
```

The workflow must preserve Playwright HTML/JUnit artifacts on failure and exit non-zero when either scenario fails.

- [ ] **Step 7: Run full verification**

Run backend:

```powershell
cd backend
..\.venv\Scripts\python.exe manage.py check
..\.venv\Scripts\python.exe -m pytest tests/test_catalog_refactoring_api.py tests/test_catalog_pricing.py tests/test_quantity_contract.py tests/test_pdv_device_flow.py tests/test_service_sales_inventory.py tests/test_sales_services.py tests/test_sales_api.py -q
```

Run frontend:

```powershell
cd frontend
npm test -- --run
npm run build
```

Run PDV excluding no tests:

```powershell
cd pdv
npm test
npm run build
```

Expected: all selected backend tests, all frontend Vitest tests, all PDV Vitest tests, and both builds PASS. If `better-sqlite3` still reports the known ABI mismatch, complete the separate SQLite runtime task before claiming the full PDV suite green; do not hide or retry it.

- [ ] **Step 8: Update Graphify and commit Task 8**

Run: `graphify update .`

Expected: `Code graph updated.` or `No code-graph topology changes detected` with no fatal error.

```bash
git add frontend/e2e/product-pdv-stock-flow.spec.ts frontend/e2e/fixtures.ts pdv/e2e/product-stock-sale.spec.ts pdv/e2e/fixtures/index.ts pdv/electron.vite.config.ts .github/workflows/e2e.yml graphify-out
git commit -m "test(e2e): cover product sale and stock lifecycle"
```

Before committing Graphify outputs, stage only files actually changed by `graphify update .`; omit `graphify-out` when the command reports no topology changes.

---

## Completion checklist

- [ ] `ProductMediaPanel` handles paginated, legacy-array, empty, and invalid responses without a blank editor.
- [ ] New products have a stable edit URL and survive reload.
- [ ] The UI creates an effective `ProductPrice`; tiers reference it explicitly.
- [ ] Missing price is never converted to zero in the PDV.
- [ ] Backend rejects fractional quantities beyond `Unit.precision` before writes.
- [ ] UN displays `10`, `100`, `101`, `1000`; KG displays `1kg`, `0.500kg`, `1.250kg`.
- [ ] Web inventory, purchasing, product editor, PDV cart, confirmation, and receipt use the contract formatter.
- [ ] Sale of 3 from stock 10 ends at stock 7 exactly once.
- [ ] Non-stock products do not create stock movements.
- [ ] Insufficient stock returns `409` with no partial sale or payment.
- [ ] Targeted backend, frontend, PDV, build, E2E, and Graphify commands have recorded raw output.
