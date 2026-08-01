# Product Stock Control and Editor Persistence Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Integrar produtos que controlam estoque ao módulo de Inventário, com política por filial/local, saldo inicial auditável e persistência confiável das etapas de preço, fiscal e canais.

**Architecture:** `Product` continua responsável pela classificação comercial e `inventory.ProductStockPolicy` concentra limites operacionais por produto/filial/local. Um serviço transacional aplica produto, política e entrada inicial por meio dos serviços existentes de movimentação; o frontend nunca escreve saldo diretamente. Consultas resumidas alimentam a etapa Estoque, enquanto todas as mutações do editor adotam URLs corretas, feedback explícito e invalidação determinística do React Query.

**Tech Stack:** Django 5, Django REST Framework, PostgreSQL/RLS, React 18, TypeScript, React Hook Form, Zod, TanStack Query, Vitest, Testing Library e Playwright.

---

## File map

- Create `backend/inventory/migrations/0006_product_stock_policy.py`: tabela, índices, constraint única e política RLS.
- Modify `backend/inventory/models.py`: modelo `ProductStockPolicy` e regra de saldo negativo baseada na política.
- Modify `backend/inventory/serializers.py`: política, comando inicial e resumo de estoque.
- Create `backend/inventory/services/product_stock.py`: aplicação atômica, resumo e desativação segura.
- Modify `backend/inventory/views.py`: endpoints de política e resumo.
- Modify `backend/inventory/urls.py`: registrar rotas novas.
- Modify `backend/catalog/views.py`: endpoint transacional `products/apply/`.
- Modify `backend/catalog/urls.py`: publicar o comando de aplicação.
- Modify `backend/catalog/serializers.py`: serializer do comando produto + estoque.
- Modify `backend/catalog/services/product_extensions.py`: manter extensões independentes e reutilizáveis.
- Modify `backend/inventory/services.py`: respeitar `allow_negative` sem escrita direta em saldo.
- Create `backend/tests/test_product_stock_policy.py`: modelo, serviço, rollback, idempotência e RLS.
- Create `backend/tests/test_product_stock_api.py`: contratos do comando, política e resumo.
- Modify `backend/tests/test_catalog_product_experience_api.py`: regressão de preço/fiscal/canal.
- Modify `frontend/src/catalog/catalogApi.ts`: corrigir URLs e adicionar contratos de estoque/aplicação.
- Modify `frontend/src/catalog/catalogSchemas.ts`: schema condicional de controle de estoque.
- Create `frontend/src/catalog/ProductStockFields.tsx`: campos dependentes de filial/local.
- Modify `frontend/src/catalog/ProductIdentityStep.tsx`: controle e envio do bloco de estoque.
- Modify `frontend/src/catalog/ProductEditorPage.tsx`: usar comando atômico e manter erros.
- Modify `frontend/src/catalog/ProductInventoryStep.tsx`: resumo e edição da política.
- Modify `frontend/src/catalog/ProductPricesStep.tsx`: sucesso/erro e refetch.
- Modify `frontend/src/catalog/ProductFiscalStep.tsx`: sucesso/erro e refetch.
- Modify `frontend/src/catalog/ProductChannelsStep.tsx`: feedback e confirmação persistida.
- Modify `frontend/src/catalog/catalogPages.test.tsx`: cenários BDD do editor.
- Modify `frontend/src/inventory/inventoryApi.ts`: política e resumo.
- Modify `frontend/src/inventory/inventorySchemas.ts`: validação dos limites.
- Modify `frontend/e2e/catalog-sprints-23-30.spec.ts`: persistência das etapas.
- Create `frontend/e2e/product-stock-control.spec.ts`: fluxo completo com saldo inicial.
- Modify `docs/PRD.md`: registrar a entrega.
- Modify `docs/10_Releases/SPRINT-030_Catalog_Hardening_Acceptance_Final_Report.md`: substituir riscos por evidências.

### Task 1: Corrigir contratos de preço/fiscal e feedback do editor

**Files:**
- Modify: `frontend/src/catalog/catalogApi.ts`
- Modify: `frontend/src/catalog/ProductPricesStep.tsx`
- Modify: `frontend/src/catalog/ProductFiscalStep.tsx`
- Modify: `frontend/src/catalog/ProductChannelsStep.tsx`
- Test: `frontend/src/catalog/catalogPages.test.tsx`
- Test: `backend/tests/test_catalog_product_experience_api.py`

- [ ] **Step 1: Escrever o cenário BDD frontend que reproduz as falhas**

Adicionar testes estruturados como Given/When/Then:

```tsx
it('persists price, fiscal data and channel and shows success feedback', async () => {
  // Given a previously created product
  renderProductEditor('/catalog/products/p1/edit')
  const user = userEvent.setup()

  // When a price tier is submitted
  await user.click(await screen.findByRole('tab', { name: 'Preços' }))
  await user.type(screen.getByLabelText('Qtd. Mínima'), '1')
  await user.type(screen.getByLabelText('Valor'), '19.90')
  await user.click(screen.getByRole('button', { name: 'Adicionar' }))

  // Then the persisted row and confirmation are visible
  expect(await screen.findByText('Faixa de preço adicionada.')).toBeInTheDocument()
  expect(await screen.findByTestId('price-tier-row')).toHaveTextContent('19.90')
})
```

Cobrir fiscal com `Dados fiscais salvos.` e canal com `Canal adicionado como rascunho.`. Nos handlers MSW, aceitar somente `/api/v1/catalog/products/:id/...`; qualquer URL sem `/catalog` deve continuar retornando 404.

- [ ] **Step 2: Executar o teste e confirmar RED**

Run:

```powershell
cd frontend
npm.cmd test -- --run src/catalog/catalogPages.test.tsx -t "persists price"
```

Expected: FAIL porque preço e fiscal chamam `/products/...` e não mostram confirmação.

- [ ] **Step 3: Corrigir os caminhos do catálogo**

Substituir as cinco URLs de preço/fiscal:

```ts
const productExtensionPath = (productId: string, suffix: string) =>
  `/catalog/products/${productId}/${suffix}/`

export function fetchProductFiscalData(tenantId: string, productId: string) {
  return apiRequest<ProductFiscalData>(productExtensionPath(productId, 'fiscal-data'), { tenantId })
}

export function createProductPriceTier(tenantId: string, productId: string, body: PriceTierInput) {
  return apiRequest<ProductPriceTier>(productExtensionPath(productId, 'price-tiers'), {
    method: 'POST', tenantId, body,
  })
}
```

Aplicar o mesmo helper a GET/POST fiscal, GET/POST preços e DELETE da faixa.

- [ ] **Step 4: Adicionar feedback determinístico**

Em cada etapa, manter estado `successMessage` e extrair falhas com `isApiProblemError`:

```tsx
const [feedback, setFeedback] = useState<{ kind: 'success' | 'error'; text: string } | null>(null)

onSuccess: async () => {
  await queryClient.invalidateQueries({ queryKey })
  await queryClient.refetchQueries({ queryKey })
  setFeedback({ kind: 'success', text: 'Faixa de preço adicionada.' })
},
onError: (error) => setFeedback({
  kind: 'error',
  text: isApiProblemError(error) ? error.problem.detail : 'Erro ao adicionar faixa de preço.',
})
```

Renderizar erro com `role="alert"` e sucesso com `role="status"`. Não inserir objetos otimistas nas listas.

- [ ] **Step 5: Verificar backend e frontend GREEN**

Run:

```powershell
C:\ERP\.venv\Scripts\python.exe manage.py test tests.test_catalog_product_experience_api
cd ..\frontend
npm.cmd test -- --run src/catalog/catalogPages.test.tsx
```

Expected: backend PASS; frontend catalog PASS com as três confirmações.

- [ ] **Step 6: Commit**

```powershell
git add frontend/src/catalog/catalogApi.ts frontend/src/catalog/ProductPricesStep.tsx frontend/src/catalog/ProductFiscalStep.tsx frontend/src/catalog/ProductChannelsStep.tsx frontend/src/catalog/catalogPages.test.tsx backend/tests/test_catalog_product_experience_api.py
git commit -m "fix(catalog): persist product extension steps"
```

### Task 2: Criar `ProductStockPolicy` com isolamento por tenant

**Files:**
- Modify: `backend/inventory/models.py`
- Create: `backend/inventory/migrations/0006_product_stock_policy.py`
- Modify: `backend/inventory/serializers.py`
- Create: `backend/tests/test_product_stock_policy.py`

- [ ] **Step 1: Escrever testes de modelo RED**

```python
def test_product_stock_policy_validates_branch_location_and_limits(inventory_context):
    tenant, product, branch, location = inventory_context
    policy = ProductStockPolicy(
        tenant=tenant,
        product=product,
        branch=branch,
        location=location,
        minimum_quantity=Decimal('5'),
        maximum_quantity=Decimal('4'),
        reorder_point=Decimal('3'),
    )
    with pytest.raises(ValidationError) as exc:
        policy.full_clean()
    assert 'maximum_quantity' in exc.value.message_dict


def test_service_cannot_have_stock_policy(service_product, branch, location):
    policy = ProductStockPolicy(
        tenant=service_product.tenant,
        product=service_product,
        branch=branch,
        location=location,
    )
    with pytest.raises(ValidationError) as exc:
        policy.full_clean()
    assert 'product' in exc.value.message_dict
```

Adicionar testes para local de outra filial, tenant divergente, constraint única e valores negativos.

- [ ] **Step 2: Executar e confirmar RED**

Run:

```powershell
C:\ERP\.venv\Scripts\python.exe -m pytest backend/tests/test_product_stock_policy.py -q
```

Expected: collection error porque `ProductStockPolicy` ainda não existe.

- [ ] **Step 3: Implementar o modelo**

```python
class ProductStockPolicy(VersionedInventoryModel):
    product = models.ForeignKey('catalog.Product', on_delete=models.PROTECT, related_name='stock_policies')
    branch = models.ForeignKey('tenancy.Branch', on_delete=models.PROTECT, related_name='product_stock_policies')
    location = models.ForeignKey(StockLocation, on_delete=models.PROTECT, related_name='product_stock_policies')
    minimum_quantity = models.DecimalField(max_digits=18, decimal_places=6, default=0)
    maximum_quantity = models.DecimalField(max_digits=18, decimal_places=6, null=True, blank=True)
    reorder_point = models.DecimalField(max_digits=18, decimal_places=6, default=0)
    allow_negative = models.BooleanField(default=False)
    is_active = models.BooleanField(default=True)

    objects = TenantManager()
    all_objects = models.Manager()

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=['tenant', 'product', 'branch', 'location'],
                name='uniq_product_stock_policy_location',
            ),
        ]

    def clean(self):
        super().clean()
        errors = {}
        if self.product_id and self.product.product_kind == 'servico':
            errors['product'] = 'Services cannot track inventory.'
        if self.location_id and self.branch_id and self.location.branch_id != self.branch_id:
            errors['location'] = 'Stock location must belong to the selected branch.'
        if self.maximum_quantity is not None and self.maximum_quantity < self.minimum_quantity:
            errors['maximum_quantity'] = 'Maximum quantity must be greater than or equal to minimum quantity.'
        if self.minimum_quantity < 0 or self.reorder_point < 0:
            errors['minimum_quantity'] = 'Stock thresholds cannot be negative.'
        if errors:
            raise ValidationError(errors)
```

- [ ] **Step 4: Criar migração e política RLS**

Run:

```powershell
C:\ERP\.venv\Scripts\python.exe manage.py makemigrations inventory
```

Na migração gerada, adicionar `RunSQL` equivalente aos modelos protegidos:

```sql
ALTER TABLE inventory_productstockpolicy ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory_productstockpolicy FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_productstockpolicy ON inventory_productstockpolicy
USING (tenant_id::text = current_setting('app.current_tenant_id', true))
WITH CHECK (tenant_id::text = current_setting('app.current_tenant_id', true));
```

O reverso remove a policy antes da tabela ser removida pelo rollback da migração.

- [ ] **Step 5: Criar serializer**

```python
class ProductStockPolicySerializer(FullCleanModelSerializer):
    class Meta:
        model = ProductStockPolicy
        fields = [
            'id', 'product', 'branch', 'location', 'minimum_quantity',
            'maximum_quantity', 'reorder_point', 'allow_negative',
            'is_active', 'version', 'created_at', 'updated_at',
        ]
        read_only_fields = ['id', 'product', 'version', 'created_at', 'updated_at']
```

- [ ] **Step 6: Executar migração/testes e commit**

```powershell
C:\ERP\.venv\Scripts\python.exe manage.py migrate
C:\ERP\.venv\Scripts\python.exe -m pytest backend/tests/test_product_stock_policy.py -q
git add backend/inventory/models.py backend/inventory/serializers.py backend/inventory/migrations/0006_product_stock_policy.py backend/tests/test_product_stock_policy.py
git commit -m "feat(inventory): add product stock policy"
```

Expected: todos os testes da política PASS.

### Task 3: Implementar aplicação atômica e saldo inicial idempotente

**Files:**
- Create: `backend/inventory/services/product_stock.py`
- Modify: `backend/inventory/services.py`
- Test: `backend/tests/test_product_stock_policy.py`

- [ ] **Step 1: Escrever testes de serviço RED**

```python
def test_apply_initial_stock_creates_policy_receipt_and_balance(inventory_context):
    result = apply_initial_product_stock(
        tenant=tenant,
        product=product,
        actor=user,
        command_id='create-product-001',
        data={
            'branch': branch.id,
            'location': location.id,
            'initial_quantity': '25',
            'minimum_quantity': '5',
            'maximum_quantity': '100',
            'reorder_point': '10',
            'allow_negative': False,
        },
    )
    assert result.policy.minimum_quantity == Decimal('5')
    assert result.balance.quantity == Decimal('25')
    assert StockOperation.objects.filter(idempotency_key='product-stock:create-product-001').count() == 1
```

Repetir o comando e afirmar uma única operação/movimento. Forçar erro após criação da política e afirmar rollback completo.

- [ ] **Step 2: Confirmar RED**

```powershell
C:\ERP\.venv\Scripts\python.exe -m pytest backend/tests/test_product_stock_policy.py -q -k "initial_stock or idempotent or rollback"
```

Expected: FAIL por serviço ausente.

- [ ] **Step 3: Implementar serviço transacional**

```python
@dataclass(frozen=True)
class ProductStockResult:
    policy: ProductStockPolicy
    balance: StockBalance
    operation: StockOperation | None


@transaction.atomic
def apply_initial_product_stock(*, tenant, product, actor, command_id, data):
    branch = get_object_or_404(Branch, id=data['branch'], tenant=tenant)
    location = get_object_or_404(StockLocation, id=data['location'], tenant=tenant, branch=branch)
    policy, _ = ProductStockPolicy.all_objects.update_or_create(
        tenant=tenant,
        product=product,
        branch=branch,
        location=location,
        defaults={
            'minimum_quantity': data['minimum_quantity'],
            'maximum_quantity': data.get('maximum_quantity'),
            'reorder_point': data['reorder_point'],
            'allow_negative': data.get('allow_negative', False),
            'is_active': True,
        },
    )
    policy.full_clean()
    policy.save()
    quantity = Decimal(str(data.get('initial_quantity', '0')))
    operation = None
    if quantity > 0:
        operation = create_receipt(
            tenant=tenant, branch=branch, product=product, location=location,
            quantity=quantity, unit=product.base_unit, factor=Decimal('1'),
            idempotency_key=f'product-stock:{command_id}', actor=actor,
            reason='Estoque inicial do produto',
        )
    balance, _ = StockBalance.all_objects.get_or_create(
        tenant=tenant, product=product, location=location, lot=None,
    )
    return ProductStockResult(policy=policy, balance=balance, operation=operation)
```

- [ ] **Step 4: Respeitar política de saldo negativo**

Antes de aplicar delta negativo em `_apply_balance_delta`, carregar a política ativa do produto/local. Rejeitar saldo final negativo quando a política não existir ou `allow_negative=false`. Ajustar `StockBalance.clean()` para aceitar negativo somente com política ativa permissiva.

```python
policy = ProductStockPolicy.all_objects.filter(
    tenant=tenant, product=product, location=location, is_active=True,
).first()
if next_quantity < 0 and not (policy and policy.allow_negative):
    raise ValidationError({'quantity': 'Negative inventory is not allowed for this product location.'})
```

- [ ] **Step 5: GREEN e commit**

```powershell
C:\ERP\.venv\Scripts\python.exe -m pytest backend/tests/test_product_stock_policy.py -q
git add backend/inventory/services.py backend/inventory/services/product_stock.py backend/inventory/models.py backend/tests/test_product_stock_policy.py
git commit -m "feat(inventory): apply idempotent initial stock"
```

### Task 4: Publicar comando do produto, política e resumo

**Files:**
- Modify: `backend/catalog/serializers.py`
- Modify: `backend/catalog/views.py`
- Modify: `backend/catalog/urls.py`
- Modify: `backend/inventory/views.py`
- Modify: `backend/inventory/urls.py`
- Test: `backend/tests/test_product_stock_api.py`

- [ ] **Step 1: Escrever cenários API RED**

```python
def test_apply_product_with_stock_returns_policy_and_summary(api_client, tenant_headers, stock_payload):
    response = api_client.post('/api/v1/catalog/products/apply/', stock_payload, **tenant_headers)
    assert response.status_code == 201
    assert response.data['product']['tracks_inventory'] is True
    assert response.data['stock_summary']['quantity'] == '25.000000'
    assert response.data['stock_summary']['status'] == 'normal'


def test_apply_product_rolls_back_when_location_is_from_other_branch(...):
    response = api_client.post('/api/v1/catalog/products/apply/', invalid_payload, **tenant_headers)
    assert response.status_code == 400
    assert response.data['code'] == 'STOCK_LOCATION_BRANCH_MISMATCH'
    assert not Product.all_objects.filter(sku='ATOMIC-FAIL').exists()
```

Adicionar: sem estoque; quantidade zero; serviço; idempotência; GET summary; PATCH com `If-Match`; permissão de filial e MFA.

- [ ] **Step 2: Confirmar RED**

```powershell
C:\ERP\.venv\Scripts\python.exe -m pytest backend/tests/test_product_stock_api.py -q
```

Expected: 404 nas novas rotas.

- [ ] **Step 3: Criar serializers de comando/resposta**

```python
class InitialStockCommandSerializer(serializers.Serializer):
    branch = serializers.UUIDField()
    location = serializers.UUIDField()
    initial_quantity = serializers.DecimalField(max_digits=18, decimal_places=6, min_value=0)
    minimum_quantity = serializers.DecimalField(max_digits=18, decimal_places=6, min_value=0)
    maximum_quantity = serializers.DecimalField(max_digits=18, decimal_places=6, min_value=0, allow_null=True, required=False)
    reorder_point = serializers.DecimalField(max_digits=18, decimal_places=6, min_value=0)
    allow_negative = serializers.BooleanField(default=False)


class ApplyProductSerializer(serializers.Serializer):
    command_id = serializers.CharField(max_length=80)
    product = ProductSerializer()
    stock = InitialStockCommandSerializer(required=False, allow_null=True)
```

Validar que `stock` é obrigatório quando `product.tracks_inventory=true` e proibido para serviço.

- [ ] **Step 4: Implementar endpoint atômico**

```python
class ProductApplyView(APIView):
    permission_classes = [IsAuthenticated, HasActiveTenant, HasVerifiedMFA, CatalogCapabilityPermission]

    @transaction.atomic
    def post(self, request):
        command = ApplyProductSerializer(data=request.data)
        command.is_valid(raise_exception=True)
        product_serializer = ProductSerializer(data=command.validated_data['product'])
        product_serializer.is_valid(raise_exception=True)
        product = product_serializer.save(tenant=request.tenant)
        stock_result = None
        if product.tracks_inventory:
            stock_result = apply_initial_product_stock(
                tenant=request.tenant, product=product, actor=request.user,
                command_id=command.validated_data['command_id'], data=command.validated_data['stock'],
            )
        return Response(build_apply_product_response(product, stock_result), status=status.HTTP_201_CREATED)
```

Publicar `path('products/apply/', ProductApplyView.as_view())` antes da rota de detalhe.

- [ ] **Step 5: Implementar política e resumo no Inventário**

Registrar `ProductStockPolicyViewSet` e `ProductStockSummaryView`. O resumo agrega `StockBalance` por produto/filial/local e calcula:

```python
available = quantity - reserved
status_value = (
    'negative' if available < 0 else
    'zero' if available == 0 else
    'low' if available <= policy.reorder_point else
    'normal'
)
```

PATCH exige `If-Match`; divergência retorna `409 CONFLICT_VERSION_MISMATCH`.

- [ ] **Step 6: GREEN e commit**

```powershell
C:\ERP\.venv\Scripts\python.exe -m pytest backend/tests/test_product_stock_api.py backend/tests/test_product_stock_policy.py -q
git add backend/catalog/serializers.py backend/catalog/views.py backend/catalog/urls.py backend/inventory/views.py backend/inventory/urls.py backend/tests/test_product_stock_api.py
git commit -m "feat(catalog): apply product with stock policy"
```

### Task 5: Exibir campos condicionais na Identificação

**Files:**
- Modify: `frontend/src/catalog/catalogApi.ts`
- Modify: `frontend/src/catalog/catalogSchemas.ts`
- Create: `frontend/src/catalog/ProductStockFields.tsx`
- Modify: `frontend/src/catalog/ProductIdentityStep.tsx`
- Modify: `frontend/src/catalog/ProductEditorPage.tsx`
- Modify: `frontend/src/inventory/inventoryApi.ts`
- Test: `frontend/src/catalog/catalogPages.test.tsx`

- [ ] **Step 1: Escrever testes frontend RED**

```tsx
it('reveals and requires stock fields when inventory control is selected', async () => {
  const user = userEvent.setup()
  renderProductEditor()
  await user.click(await screen.findByRole('checkbox', { name: 'Controlar estoque' }))
  expect(screen.getByLabelText('Filial')).toBeInTheDocument()
  expect(screen.getByLabelText('Local de estoque')).toBeInTheDocument()
  expect(screen.getByLabelText('Quantidade atual')).toBeDisabled()
  expect(screen.getByLabelText('Quantidade inicial')).toHaveValue(0)
  expect(screen.getByLabelText('Quantidade mínima')).toHaveValue(0)
  expect(screen.getByLabelText('Ponto de reposição')).toHaveValue(0)
})
```

Adicionar testes: troca de filial limpa local; máximo menor que mínimo; serviço oculta controle; desmarcado não envia `stock`.

- [ ] **Step 2: Confirmar RED**

```powershell
cd frontend
npm.cmd test -- --run src/catalog/catalogPages.test.tsx -t "stock fields"
```

- [ ] **Step 3: Estender schema e tipos**

```ts
const decimal = z.string().regex(/^\d+(\.\d{1,6})?$/, 'Informe um decimal válido')

export const productStockSchema = z.object({
  branch: z.string().uuid(),
  location: z.string().uuid(),
  current_quantity: decimal.default('0'),
  initial_quantity: decimal.default('0'),
  minimum_quantity: decimal.default('0'),
  maximum_quantity: decimal.or(z.literal('')).default(''),
  reorder_point: decimal.default('0'),
  allow_negative: z.boolean().default(false),
}).superRefine((value, ctx) => {
  if (value.maximum_quantity && Number(value.maximum_quantity) < Number(value.minimum_quantity)) {
    ctx.addIssue({ code: 'custom', path: ['maximum_quantity'], message: 'Máxima deve ser maior ou igual à mínima' })
  }
})
```

O payload do comando inclui `stock` somente quando `tracks_inventory=true`.

- [ ] **Step 4: Criar `ProductStockFields`**

O componente recebe `control`, `branches`, `locations`, `selectedBranch` e `isExistingProduct`. Usar `fetchBranches()` e uma nova `fetchStockLocations(tenantId, { branch })`; limpar `location` via `setValue` quando `branch` mudar. Todos os inputs recebem `data-testid` estável.

```tsx
{tracksInventory && (
  <ProductStockFields
    control={control}
    register={register}
    errors={errors.stock}
    currentQuantity={stockSummary?.quantity ?? '0.000000'}
  />
)}
```

- [ ] **Step 5: Trocar criação simples pelo comando atômico**

Adicionar em `catalogApi.ts`:

```ts
export function applyProduct(tenantId: string, payload: ApplyProductPayload) {
  return apiRequest<ApplyProductResponse>('/catalog/products/apply/', {
    method: 'POST', tenantId, body: payload,
  })
}
```

`ProductEditorPage` gera `command_id` uma vez por montagem com `crypto.randomUUID()` e o reutiliza em retry. Em sucesso, define `createdProductId`; em erro, mostra `role="alert"` sem limpar o formulário.

- [ ] **Step 6: GREEN e commit**

```powershell
npm.cmd test -- --run src/catalog/catalogPages.test.tsx
npm.cmd run typecheck
git add src/catalog/catalogApi.ts src/catalog/catalogSchemas.ts src/catalog/ProductStockFields.tsx src/catalog/ProductIdentityStep.tsx src/catalog/ProductEditorPage.tsx src/inventory/inventoryApi.ts src/catalog/catalogPages.test.tsx
git commit -m "feat(catalog): configure stock during product creation"
```

### Task 6: Transformar a etapa Estoque em painel operacional

**Files:**
- Modify: `frontend/src/catalog/ProductInventoryStep.tsx`
- Modify: `frontend/src/inventory/inventoryApi.ts`
- Modify: `frontend/src/inventory/inventorySchemas.ts`
- Test: `frontend/src/catalog/catalogPages.test.tsx`

- [ ] **Step 1: Escrever cenário do resumo RED**

```tsx
it('shows current, reserved, available and replenishment thresholds', async () => {
  renderProductEditor('/catalog/products/p1/edit')
  await userEvent.click(await screen.findByRole('tab', { name: 'Estoque' }))
  expect(await screen.findByText('25,000000')).toBeInTheDocument()
  expect(screen.getByText('5,000000')).toBeInTheDocument()
  expect(screen.getByText('10,000000')).toBeInTheDocument()
  expect(screen.getByText('Normal')).toBeInTheDocument()
  expect(screen.getByRole('link', { name: 'Ajustar estoque' }))
    .toHaveAttribute('href', '/inventory/adjustments/new?product=p1&branch=b1&location=l1')
})
```

Adicionar estado `low`, `zero`, `negative` e edição da política sem alterar quantidade atual.

- [ ] **Step 2: Confirmar RED**

```powershell
npm.cmd test -- --run src/catalog/catalogPages.test.tsx -t "replenishment thresholds"
```

- [ ] **Step 3: Implementar queries e cartões**

Criar `fetchProductStockSummary()` e `updateProductStockPolicy()` em `inventoryApi.ts`. Renderizar cinco cartões: Atual, Reservada, Disponível, Mínima e Ponto de reposição. Aplicar status acessível:

```tsx
<div role="status" data-status={summary.status} className={STATUS_CLASS[summary.status]}>
  {STATUS_LABEL[summary.status]}
</div>
```

O formulário de política envia `If-Match: String(policy.version)` e, após sucesso, invalida resumo e política.

- [ ] **Step 4: Implementar links filtrados**

```tsx
<Link to={`/inventory/adjustments/new?product=${productId}&branch=${branchId}&location=${locationId}`}>
  Ajustar estoque
</Link>
<Link to={`/inventory/movements?product=${productId}&branch=${branchId}&location=${locationId}`}>
  Ver movimentações
</Link>
```

- [ ] **Step 5: GREEN e commit**

```powershell
npm.cmd test -- --run src/catalog/catalogPages.test.tsx
npm.cmd run typecheck
git add src/catalog/ProductInventoryStep.tsx src/inventory/inventoryApi.ts src/inventory/inventorySchemas.ts src/catalog/catalogPages.test.tsx
git commit -m "feat(catalog): show product stock controls"
```

### Task 7: Backfill seguro e auditoria

**Files:**
- Create: `backend/inventory/migrations/0007_backfill_product_stock_policy.py`
- Create: `backend/inventory/management/commands/audit_product_stock_policies.py`
- Test: `backend/tests/test_product_stock_policy.py`

- [ ] **Step 1: Escrever teste de backfill RED**

Criar produto `tracks_inventory=true` com saldo em dois locais e afirmar que o backfill cria duas políticas com limites zero, sem criar movimentos adicionais nem mudar saldos.

- [ ] **Step 2: Implementar migração de dados**

Iterar saldos distintos por `(tenant, product, location)` com contexto RLS do tenant. Criar política usando `location.branch`, mínimo `0`, ponto `0`, máximo `NULL`, negativo `false`. O reverse remove apenas políticas que ainda possuem todos os limites padrão e não remove movimentos/saldos.

- [ ] **Step 3: Criar auditoria**

O comando retorna saída não zero quando encontrar:

- produto com controle e saldo sem política;
- política cujo local não pertence à filial;
- serviço com política ativa;
- máximo abaixo do mínimo;
- saldo negativo sem permissão.

Saída final esperada:

```text
product_stock_policy_audit tenants=2 policies=8 findings=0
```

- [ ] **Step 4: Verificar e commit**

```powershell
C:\ERP\.venv\Scripts\python.exe manage.py migrate
C:\ERP\.venv\Scripts\python.exe -m pytest backend/tests/test_product_stock_policy.py -q
C:\ERP\.venv\Scripts\python.exe manage.py audit_product_stock_policies
git add backend/inventory/migrations/0007_backfill_product_stock_policy.py backend/inventory/management/commands/audit_product_stock_policies.py backend/tests/test_product_stock_policy.py
git commit -m "feat(inventory): backfill and audit stock policies"
```

### Task 8: Aceite E2E completo e documentação

**Files:**
- Create: `frontend/e2e/product-stock-control.spec.ts`
- Modify: `frontend/e2e/catalog-sprints-23-30.spec.ts`
- Modify: `docs/PRD.md`
- Modify: `docs/10_Releases/SPRINT-030_Catalog_Hardening_Acceptance_Final_Report.md`

- [ ] **Step 1: Escrever cenário E2E do produto com estoque**

```ts
test('cadastra produto com classificadores, saldo inicial e extensões persistidas', async ({ authenticatedPage }) => {
  const page = authenticatedPage
  await page.goto('/catalog/products/new')
  await page.getByLabel('Nome').fill('Produto Estoque E2E')
  await page.getByLabel('SKU').fill(`STOCK-${test.info().workerIndex}`)
  await page.getByTestId('quick-create-category-btn').click()
  await page.getByPlaceholder('Nome da categoria').fill('Categoria Estoque E2E')
  await page.getByTestId('quick-cat-submit').click()
  await page.getByTestId('quick-create-brand-btn').click()
  await page.getByPlaceholder('Nome da marca').fill('Marca Estoque E2E')
  await page.getByTestId('quick-brand-submit').click()
  await page.getByLabel('Controlar estoque').check()
  await page.getByLabel('Filial').selectOption({ label: 'E2E Branch' })
  await page.getByLabel('Local de estoque').selectOption({ label: 'E2E Local' })
  await page.getByLabel('Quantidade inicial').fill('25')
  await page.getByLabel('Quantidade mínima').fill('5')
  await page.getByLabel('Ponto de reposição').fill('10')
  await page.getByRole('button', { name: 'Continuar' }).click()
  await expect(page.getByRole('tab', { name: 'Estoque' })).toBeEnabled()
  await page.getByRole('tab', { name: 'Estoque' }).click()
  await expect(page.getByTestId('stock-current-quantity')).toHaveText('25,000000')
  await expect(page.getByText('Normal', { exact: true })).toBeVisible()
})
```

No mesmo produto, criar preço, salvar fiscal, adicionar canal; recarregar a página antes de afirmar cada persistência.

- [ ] **Step 2: Executar Chromium e corrigir somente defeitos reais**

```powershell
$env:PLAYWRIGHT_BASE_URL='http://127.0.0.1:5173'
npx.cmd playwright test e2e/product-stock-control.spec.ts --project=chromium --workers=1
```

Expected: PASS sem esperas fixas, retries locais ou seletores frágeis.

- [ ] **Step 3: Executar regressões completas**

```powershell
cd backend
C:\ERP\.venv\Scripts\python.exe manage.py check
C:\ERP\.venv\Scripts\python.exe manage.py test
cd ..\frontend
npm.cmd test -- --run
npm.cmd run typecheck
npm.cmd run build
npx.cmd playwright test e2e/product-stock-control.spec.ts e2e/catalog-sprints-23-30.spec.ts --workers=1
```

Expected: backend, 22+ arquivos Vitest, typecheck, build e Chromium/Firefox/WebKit PASS. Registrar contagens e durações reais; não copiar números antigos.

- [ ] **Step 4: Atualizar documentos**

No PRD, adicionar requisito concluído para política por filial/local e saldo inicial auditável. No relatório, substituir as falhas de preço/fiscal/canais por evidências reais e registrar o novo comando de auditoria.

- [ ] **Step 5: Commit e estado final**

```powershell
git add frontend/e2e/product-stock-control.spec.ts frontend/e2e/catalog-sprints-23-30.spec.ts docs/PRD.md docs/10_Releases/SPRINT-030_Catalog_Hardening_Acceptance_Final_Report.md
git commit -m "test(inventory): accept product stock workflow"
git status --short
git log -8 --oneline
```

Expected: worktree limpa e oito commits de implementação rastreáveis.

