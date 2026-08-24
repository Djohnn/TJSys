import fs from "node:fs/promises";
import path from "node:path";
import { expect, productPdvArtifactPath, test } from "./fixtures";

type ProductArtifact = {
  id: string;
  name: string;
  sku: string;
  price: string;
  tiers: Array<{ minQuantity: string; amount: string }>;
  unitSymbol: string;
  initialQuantity: string;
  stockLocationId: string | null;
  branchId: string | null;
};

type FlowArtifact = {
  schemaVersion: 1;
  createdAt: string;
  adminBaseUrl: string;
  products: {
    unit: ProductArtifact;
    kilogram: ProductArtifact;
    withoutPrice: ProductArtifact;
  };
};

async function firstOptionValue(
  page: import("@playwright/test").Page,
  selector: string,
) {
  const option = page.locator(`${selector} option`).nth(1);
  await expect(option).toBeAttached();
  return (await option.getAttribute("value")) as string;
}

async function createProduct(
  page: import("@playwright/test").Page,
  input: {
    name: string;
    sku: string;
    unitId: string;
    initialQuantity?: string;
    tracksInventory: boolean;
  },
) {
  await page.goto("/app/catalog/products/new");
  await expect(page.getByTestId("product-identity-step")).toBeVisible();
  await page.getByLabel("Nome").fill(input.name);
  await page.getByLabel("SKU").fill(input.sku);
  await page
    .locator("#pi-category")
    .selectOption(await firstOptionValue(page, "#pi-category"));
  await page.locator("#pi-unit").selectOption(input.unitId);
  await page.locator("#pi-product-kind").selectOption("revenda");
  const inventory = page.getByTestId("product-tracks-inventory-checkbox");
  if (input.tracksInventory) {
    await inventory.check();
    await expect(page.getByTestId("product-stock-fields")).toBeVisible();
    await page
      .locator("#product-stock-branch")
      .selectOption(await firstOptionValue(page, "#product-stock-branch"));
    await expect(page.locator("#product-stock-location option")).toHaveCount(2);
    await page
      .locator("#product-stock-location")
      .selectOption(await firstOptionValue(page, "#product-stock-location"));
    await page
      .locator("#product-stock-initial-quantity")
      .fill(input.initialQuantity ?? "0");
  }
  const apply = page.waitForResponse(
    (response) =>
      response.url().includes("/catalog/products/apply/") &&
      response.request().method() === "POST",
  );
  await page.getByRole("button", { name: "Continuar" }).click();
  const response = await apply;
  expect(response.status()).toBe(201);
  const body = (await response.json()) as { product: { id: string } };
  await expect(page).toHaveURL(
    new RegExp(`/app/catalog/products/${body.product.id}/edit`),
  );
  return body.product.id;
}

async function saveR4Price(
  page: import("@playwright/test").Page,
  productId: string,
  amount: string,
  tier: { minQuantity: string; amount: string },
) {
  await page.getByRole("tab", { name: "Preços" }).click();
  await expect(page.getByTestId("base-price-empty")).toBeVisible();
  const basePost = page.waitForResponse(
    (response) =>
      response.url().includes(`/catalog/products/${productId}/prices/`) &&
      response.request().method() === "POST",
  );
  await page.getByTestId("base-price-amount").fill(amount);
  await page.getByTestId("save-base-price").click();
  expect((await basePost).status()).toBe(201);
  await expect(page.getByTestId("r4-pricing-summary")).toContainText(
    `BRL ${amount}`,
  );
  const tierPost = page.waitForResponse(
    (response) =>
      response.url().includes(`/catalog/products/${productId}/prices/`) &&
      response.request().method() === "POST",
  );
  await page.getByTestId("tier-min-quantity-input").fill(tier.minQuantity);
  await page.getByTestId("tier-amount-input").fill(tier.amount);
  await page.getByTestId("add-tier-button").click();
  expect((await tierPost).status()).toBe(201);
  await expect(page.getByTestId("price-tier-row")).toContainText(
    tier.minQuantity,
  );
  await expect(page.getByTestId("price-tier-row")).toContainText(tier.amount);
  await page.reload();
  await page.getByRole("tab", { name: "Preços" }).click();
  await expect(page.getByTestId("r4-pricing-summary")).toContainText(
    `BRL ${amount}`,
  );
  await expect(page.getByTestId("price-tier-row")).toContainText(
    tier.minQuantity,
  );
  await expect(page.getByTestId("price-tier-row")).toContainText(tier.amount);
  const storedTenantId = await page.evaluate(() =>
    localStorage.getItem("zyrp:selected-tenant"),
  );
  const tenantId =
    storedTenantId ??
    (
      (await (await page.request.get("/api/v1/auth/me/")).json()) as {
        memberships?: Array<{ tenant_id: string }>;
      }
    ).memberships?.[0]?.tenant_id ??
    null;
  expect(tenantId).toBeTruthy();
  const pricesResponse = await page.request.get(
    `/api/v1/catalog/products/${productId}/prices/`,
    { headers: { "X-Tenant-ID": tenantId! } },
  );
  expect(pricesResponse.ok()).toBe(true);
  const snapshot = (await pricesResponse.json()) as {
    amount: string;
    tiers: Array<{ min_quantity: string; amount: string }>;
  };
  expect(snapshot.amount).toBe(amount);
  expect(snapshot.tiers).toHaveLength(1);
  expect(snapshot.tiers[0]).toMatchObject({
    min_quantity: "1.000000",
    amount: tier.amount,
  });
}

test("produz fluxo determinístico de produtos para o PDV e persiste R4", async ({
  authenticatedPage,
}) => {
  // Given administrador autenticado e unidades UN/KG providas pelo seed E2E
  const page = authenticatedPage;
  const storedTenantId = await page.evaluate(() =>
    localStorage.getItem("zyrp:selected-tenant"),
  );
  const tenantId =
    storedTenantId ??
    (
      (await (await page.request.get("/api/v1/auth/me/")).json()) as {
        memberships?: Array<{ tenant_id: string }>;
      }
    ).memberships?.[0]?.tenant_id ??
    null;
  expect(tenantId).toBeTruthy();
  const unitsResponse = await page.request.get(
    "/api/v1/catalog/units/?page=1",
    { headers: { "X-Tenant-ID": tenantId! } },
  );
  expect(unitsResponse.ok()).toBe(true);
  const units =
    (
      (await unitsResponse.json()) as {
        results?: Array<{ id: string; symbol: string }>;
      }
    ).results ?? [];
  const unit = units.find((item) => item.symbol.toUpperCase() === "UN");
  const kilogram = units.find((item) => item.symbol.toUpperCase() === "KG");
  expect(unit).toBeTruthy();
  expect(kilogram).toBeTruthy();
  const runId = process.env.E2E_PRODUCT_RUN_ID ?? `run-${Date.now()}`;
  const names = {
    unit: `E2E PDV Unit ${runId}`,
    kilogram: `E2E PDV Kg ${runId}`,
    withoutPrice: `E2E PDV Sem Preço ${runId}`,
  };
  const skus = {
    unit: `E2E-PDV-UNIT-${runId}`,
    kilogram: `E2E-PDV-KG-${runId}`,
    withoutPrice: `E2E-PDV-NOPRICE-${runId}`,
  };

  // When cria unitário/KG/sem preço, publica preços via POST R4 e recarrega
  const unitId = await createProduct(page, {
    name: names.unit,
    sku: skus.unit,
    unitId: unit!.id,
    initialQuantity: "10",
    tracksInventory: true,
  });
  await saveR4Price(page, unitId, "19.90", {
    minQuantity: "1",
    amount: "10.00",
  });
  const kilogramId = await createProduct(page, {
    name: names.kilogram,
    sku: skus.kilogram,
    unitId: kilogram!.id,
    initialQuantity: "1.500",
    tracksInventory: true,
  });
  await saveR4Price(page, kilogramId, "12.00", {
    minQuantity: "1",
    amount: "8.00",
  });
  const withoutPriceId = await createProduct(page, {
    name: names.withoutPrice,
    sku: skus.withoutPrice,
    unitId: unit!.id,
    tracksInventory: false,
  });

  const stock = async (productId: string) => {
    const response = await page.request.get(
      `/api/v1/inventory/product-summary/${productId}/`,
      { headers: { "X-Tenant-ID": tenantId! } },
    );
    expect(response.ok()).toBe(true);
    const rows = (await response.json()) as Array<{
      location: string | null;
      branch: string | null;
    }>;
    return rows[0] ?? { location: null, branch: null };
  };
  const unitStock = await stock(unitId);
  const kilogramStock = await stock(kilogramId);
  // Then o JSON contém referências persistidas e consumíveis pelo fluxo PDV
  const artifact: FlowArtifact = {
    schemaVersion: 1,
    createdAt: new Date().toISOString(),
    adminBaseUrl: process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:5173",
    products: {
      unit: {
        id: unitId,
        name: names.unit,
        sku: skus.unit,
        price: "19.90",
        tiers: [{ minQuantity: "1", amount: "10.00" }],
        unitSymbol: "UN",
        initialQuantity: "10",
        stockLocationId: unitStock.location,
        branchId: unitStock.branch,
      },
      kilogram: {
        id: kilogramId,
        name: names.kilogram,
        sku: skus.kilogram,
        price: "12.00",
        tiers: [{ minQuantity: "1", amount: "8.00" }],
        unitSymbol: "KG",
        initialQuantity: "1.500",
        stockLocationId: kilogramStock.location,
        branchId: kilogramStock.branch,
      },
      withoutPrice: {
        id: withoutPriceId,
        name: names.withoutPrice,
        sku: skus.withoutPrice,
        price: "",
        tiers: [],
        unitSymbol: "UN",
        initialQuantity: "0",
        stockLocationId: null,
        branchId: null,
      },
    },
  };
  await fs.mkdir(path.dirname(productPdvArtifactPath), { recursive: true });
  await fs.writeFile(
    productPdvArtifactPath,
    `${JSON.stringify(artifact, null, 2)}\n`,
    "utf8",
  );
  expect(JSON.parse(await fs.readFile(productPdvArtifactPath, "utf8"))).toEqual(
    artifact,
  );
  expect(artifact.createdAt).toMatch(
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/,
  );
});
