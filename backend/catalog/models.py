from decimal import Decimal

from django.core.exceptions import ValidationError
from django.db import models

from tenancy.managers import TenantManager
from tenancy.models import TenantScopedModel, TimeStampedModel


class Unit(TimeStampedModel, TenantScopedModel):
    symbol = models.CharField(max_length=12)
    name = models.CharField(max_length=80)
    precision = models.PositiveSmallIntegerField(default=0)
    is_active = models.BooleanField(default=True)
    version = models.PositiveIntegerField(default=1)

    objects = TenantManager()
    all_objects = models.Manager()

    class Meta:
        ordering = ['symbol']
        constraints = [
            models.UniqueConstraint(
                fields=['tenant', 'symbol'],
                name='uniq_unit_tenant_symbol',
            ),
            models.CheckConstraint(
                condition=models.Q(precision__lte=6),
                name='unit_precision_max_6',
            ),
        ]

    def __str__(self):
        return f'{self.symbol} [{self.tenant.name}]'

    def save(self, *args, **kwargs):
        self.symbol = self.symbol.strip().upper()
        super().save(*args, **kwargs)

    def clean(self):
        super().clean()
        if self.precision > 6:
            raise ValidationError({'precision': 'Precision must not exceed 6.'})


class Category(TimeStampedModel, TenantScopedModel):
    name = models.CharField(max_length=120)
    code = models.CharField(max_length=40, blank=True, default='')
    parent = models.ForeignKey(
        'self',
        null=True,
        blank=True,
        on_delete=models.PROTECT,
    )
    is_active = models.BooleanField(default=True)
    version = models.PositiveIntegerField(default=1)

    objects = TenantManager()
    all_objects = models.Manager()

    class Meta:
        ordering = ['name']
        constraints = [
            models.UniqueConstraint(
                fields=['tenant', 'code'],
                condition=models.Q(~models.Q(code='')),
                name='uniq_category_tenant_code',
            ),
        ]

    def __str__(self):
        return f'{self.name} [{self.tenant.name}]'

    def clean(self):
        super().clean()
        if self.parent_id:
            if self.parent_id == self.pk:
                raise ValidationError({'parent': 'Category cannot be its own parent.'})
            current = self.parent
            visited = {self.pk} if self.pk else set()
            while current is not None:
                if current.pk in visited:
                    raise ValidationError({'parent': 'Category hierarchy contains a cycle.'})
                visited.add(current.pk)
                if current.tenant_id != self.tenant_id:
                    raise ValidationError(
                        {'parent': 'Parent category must belong to the same tenant.'}
                    )
                current = current.parent


PRODUCT_KIND_CHOICES = [
    ('insumo', 'Insumo'),
    ('revenda', 'Revenda'),
    ('servico', 'Servico'),
    ('brinde', 'Brinde'),
    ('kit', 'Kit'),
    ('outro', 'Outro'),
]


class Product(TimeStampedModel, TenantScopedModel):
    sku = models.CharField(max_length=64)
    name = models.CharField(max_length=200)
    description = models.TextField(blank=True, default='')
    category = models.ForeignKey(
        Category,
        null=True,
        blank=True,
        on_delete=models.PROTECT,
    )
    base_unit = models.ForeignKey(Unit, on_delete=models.PROTECT)
    requires_lot = models.BooleanField(default=False)
    requires_expiry = models.BooleanField(default=False)
    ncm = models.CharField(max_length=8, blank=True, default='')
    is_active = models.BooleanField(default=True)
    version = models.PositiveIntegerField(default=1)
    # Sprint 22 — D1: rótulo de classificação (sem composição real).
    product_kind = models.CharField(
        max_length=20,
        choices=PRODUCT_KIND_CHOICES,
        blank=True,
        default='',
    )
    # Sprint 22 — D4: flag consumido por Inventory.
    tracks_inventory = models.BooleanField(default=True)
    # Sprint 22 — D5: campos descritivos simples.
    brand = models.CharField(max_length=120, blank=True, default='')
    brand_ref = models.ForeignKey(
        'Brand',
        null=True,
        blank=True,
        on_delete=models.PROTECT,
        related_name='products',
    )
    subcategory = models.CharField(max_length=120, blank=True, default='')
    model = models.CharField(max_length=120, blank=True, default='')
    tags = models.JSONField(default=list, blank=True)
    scale_code = models.CharField(max_length=20, blank=True, default='')
    # Sprint 26 — service metadata
    billing_unit = models.CharField(max_length=30, blank=True, default='')
    duration_minutes = models.PositiveIntegerField(null=True, blank=True)

    objects = TenantManager()
    all_objects = models.Manager()

    class Meta:
        ordering = ['sku']
        constraints = [
            models.UniqueConstraint(
                fields=['tenant', 'sku'],
                name='uniq_product_tenant_sku',
            ),
        ]

    def __str__(self):
        return f'{self.sku} [{self.tenant.name}]'

    def save(self, *args, **kwargs):
        self.sku = self.sku.strip().upper()
        super().save(*args, **kwargs)

    def clean(self):
        super().clean()
        if self.base_unit_id and self.tenant_id:
            if self.base_unit.tenant_id != self.tenant_id:
                raise ValidationError({'base_unit': 'Base unit must belong to the same tenant.'})
        if self.category_id and self.tenant_id:
            if self.category.tenant_id != self.tenant_id:
                raise ValidationError({'category': 'Category must belong to the same tenant.'})
        if self.brand_ref_id and self.tenant_id:
            if self.brand_ref.tenant_id != self.tenant_id:
                raise ValidationError({'brand_ref': 'Brand must belong to the same tenant.'})
        # Sprint 26: service invariants
        if self.product_kind == 'servico':
            self.tracks_inventory = False
            self.requires_lot = False
            self.requires_expiry = False


class ProductUnit(TimeStampedModel, TenantScopedModel):
    product = models.ForeignKey(
        Product,
        on_delete=models.CASCADE,
        related_name='commercial_units',
    )
    unit = models.ForeignKey(Unit, on_delete=models.PROTECT)
    factor = models.DecimalField(max_digits=18, decimal_places=6)
    is_active = models.BooleanField(default=True)
    version = models.PositiveIntegerField(default=1)

    objects = TenantManager()
    all_objects = models.Manager()

    class Meta:
        ordering = ['product', 'unit']
        constraints = [
            models.UniqueConstraint(
                fields=['tenant', 'product', 'unit'],
                name='uniq_productunit_tenant_product_unit',
            ),
            models.CheckConstraint(
                condition=models.Q(factor__gt=0),
                name='productunit_factor_positive',
            ),
        ]

    def __str__(self):
        return f'{self.product.sku} → {self.unit.symbol} ×{self.factor}'

    def clean(self):
        super().clean()
        if self.factor <= 0:
            raise ValidationError({'factor': 'Conversion factor must be positive.'})
        if self.product_id and self.tenant_id:
            if self.product.tenant_id != self.tenant_id:
                raise ValidationError({'product': 'Product must belong to the same tenant.'})
        if self.unit_id and self.tenant_id:
            if self.unit.tenant_id != self.tenant_id:
                raise ValidationError({'unit': 'Unit must belong to the same tenant.'})


CODE_TYPE_CHOICES = [
    ('internal', 'Internal'),
    ('ean', 'EAN'),
    ('gtin', 'GTIN'),
    ('supplier', 'Supplier'),
]


class ProductCode(TimeStampedModel, TenantScopedModel):
    product = models.ForeignKey(
        Product,
        on_delete=models.CASCADE,
        related_name='codes',
    )
    code_type = models.CharField(max_length=20, choices=CODE_TYPE_CHOICES)
    value = models.CharField(max_length=64)
    is_principal = models.BooleanField(default=False)
    is_active = models.BooleanField(default=True)
    version = models.PositiveIntegerField(default=1)

    objects = TenantManager()
    all_objects = models.Manager()

    class Meta:
        ordering = ['product', 'code_type', 'value']
        constraints = [
            models.UniqueConstraint(
                fields=['tenant', 'code_type', 'value'],
                condition=models.Q(is_active=True),
                name='uniq_productcode_tenant_type_value_active',
            ),
            models.UniqueConstraint(
                fields=['tenant', 'product', 'code_type'],
                condition=models.Q(is_principal=True),
                name='uniq_productcode_principal_per_type',
            ),
        ]

    def __str__(self):
        return f'{self.value} ({self.code_type}) [{self.tenant.name}]'

    def save(self, *args, **kwargs):
        self.value = self.value.strip().upper()
        super().save(*args, **kwargs)

    def clean(self):
        super().clean()
        if self.product_id and self.tenant_id:
            if self.product.tenant_id != self.tenant_id:
                raise ValidationError({'product': 'Product must belong to the same tenant.'})
        if self.code_type in ('ean', 'gtin'):
            from catalog.services.codes import validate_gtin

            if not validate_gtin(self.value):
                raise ValidationError({'value': f'Invalid {self.code_type.upper()} check digit.'})


class ProductPrice(TimeStampedModel, TenantScopedModel):
    product = models.ForeignKey(
        Product,
        on_delete=models.CASCADE,
        related_name='prices',
    )
    amount = models.DecimalField(max_digits=18, decimal_places=4)
    valid_from = models.DateTimeField()
    valid_to = models.DateTimeField(null=True, blank=True)
    is_active = models.BooleanField(default=True)
    version = models.PositiveIntegerField(default=1)

    objects = TenantManager()
    all_objects = models.Manager()

    class Meta:
        ordering = ['-valid_from']
        constraints = [
            models.CheckConstraint(
                condition=models.Q(amount__gte=0),
                name='productprice_amount_nonneg',
            ),
            models.CheckConstraint(
                condition=(
                    models.Q(valid_to__isnull=True) | models.Q(valid_to__gt=models.F('valid_from'))
                ),
                name='productprice_valid_to_after_valid_from',
            ),
        ]

    def __str__(self):
        return f'{self.product.sku} {self.amount} [{self.valid_from.date()}]'

    def clean(self):
        super().clean()
        if self.amount < 0:
            raise ValidationError({'amount': 'Price must not be negative.'})
        if self.valid_to is not None and self.valid_to <= self.valid_from:
            raise ValidationError({'valid_to': 'valid_to must be after valid_from.'})
        if self.product_id and self.tenant_id:
            if self.product.tenant_id != self.tenant_id:
                raise ValidationError({'product': 'Product must belong to the same tenant.'})
        if self.is_active and self.product_id and self.tenant_id:
            overlapping = ProductPrice.all_objects.filter(
                tenant_id=self.tenant_id,
                product_id=self.product_id,
                is_active=True,
            ).exclude(pk=self.pk)
            if self.valid_to is not None:
                overlapping = overlapping.filter(
                    valid_from__lt=self.valid_to,
                ).filter(
                    models.Q(valid_to__isnull=True) | models.Q(valid_to__gt=self.valid_from),
                )
            else:
                overlapping = overlapping.filter(
                    models.Q(valid_to__isnull=True) | models.Q(valid_to__gt=self.valid_from),
                )
            if overlapping.exists():
                raise ValidationError({'valid_from': 'Overlapping price period for this product.'})


class BranchPrice(TimeStampedModel, TenantScopedModel):
    product = models.ForeignKey(
        Product,
        on_delete=models.CASCADE,
        related_name='branch_prices',
    )
    branch = models.ForeignKey(
        'tenancy.Branch',
        on_delete=models.CASCADE,
        related_name='prices',
    )
    amount = models.DecimalField(max_digits=18, decimal_places=4)
    valid_from = models.DateTimeField()
    valid_to = models.DateTimeField(null=True, blank=True)
    is_active = models.BooleanField(default=True)
    version = models.PositiveIntegerField(default=1)

    objects = TenantManager()
    all_objects = models.Manager()

    class Meta:
        ordering = ['-valid_from']
        constraints = [
            models.CheckConstraint(
                condition=models.Q(amount__gte=0),
                name='branchprice_amount_nonneg',
            ),
            models.CheckConstraint(
                condition=(
                    models.Q(valid_to__isnull=True) | models.Q(valid_to__gt=models.F('valid_from'))
                ),
                name='branchprice_valid_to_after_valid_from',
            ),
        ]

    def __str__(self):
        return f'{self.product.sku} @ {self.branch.name} {self.amount}'

    def clean(self):
        super().clean()
        if self.amount < 0:
            raise ValidationError({'amount': 'Price must not be negative.'})
        if self.valid_to is not None and self.valid_to <= self.valid_from:
            raise ValidationError({'valid_to': 'valid_to must be after valid_from.'})
        if self.branch_id and self.tenant_id:
            if self.branch.tenant_id != self.tenant_id:
                raise ValidationError({'branch': 'Branch must belong to the same tenant.'})
        if self.product_id and self.tenant_id:
            if self.product.tenant_id != self.tenant_id:
                raise ValidationError({'product': 'Product must belong to the same tenant.'})
        if self.is_active and self.product_id and self.tenant_id and self.branch_id:
            overlapping = BranchPrice.all_objects.filter(
                tenant_id=self.tenant_id,
                product_id=self.product_id,
                branch_id=self.branch_id,
                is_active=True,
            ).exclude(pk=self.pk)
            if self.valid_to is not None:
                overlapping = overlapping.filter(
                    valid_from__lt=self.valid_to,
                ).filter(
                    models.Q(valid_to__isnull=True) | models.Q(valid_to__gt=self.valid_from),
                )
            else:
                overlapping = overlapping.filter(
                    models.Q(valid_to__isnull=True) | models.Q(valid_to__gt=self.valid_from),
                )
            if overlapping.exists():
                raise ValidationError(
                    {'valid_from': 'Overlapping price period for this product and branch.'}
                )


# =============================================================================
# Sprint 22 — D3: ProductFiscalData (cadastro fiscal do produto, 1:1)
# =============================================================================

FISCAL_TYPE_CHOICES = [
    ('', 'Nao classificado'),
    ('revenda', 'Revenda'),
    ('industrializacao', 'Industrializacao'),
    ('servico', 'Servico'),
    ('uso_consumo', 'Uso e Consumo'),
    ('outro', 'Outro'),
]


class ProductFiscalData(TimeStampedModel, TenantScopedModel):
    product = models.OneToOneField(
        Product,
        on_delete=models.CASCADE,
        related_name='fiscal_data',
    )
    fiscal_type = models.CharField(
        max_length=30,
        choices=FISCAL_TYPE_CHOICES,
        blank=True,
        default='',
    )
    ncm = models.CharField(max_length=8, blank=True, default='')
    cest = models.CharField(max_length=10, blank=True, default='')
    origin_code = models.CharField(max_length=1, blank=True, default='')
    fiscal_class = models.CharField(max_length=10, blank=True, default='')
    is_active = models.BooleanField(default=True)
    version = models.PositiveIntegerField(default=1)

    objects = TenantManager()
    all_objects = models.Manager()

    class Meta:
        ordering = ['product']

    def __str__(self):
        return f'FiscalData({self.product.sku}) NCM={self.ncm}'

    def clean(self):
        super().clean()
        if self.product_id and self.tenant_id:
            if self.product.tenant_id != self.tenant_id:
                raise ValidationError({'product': 'Product must belong to the same tenant.'})
        if self.origin_code and self.origin_code not in '012345678':
            raise ValidationError({'origin_code': 'Origin code must be a digit 0-8.'})


# =============================================================================
# Sprint 22 — D2: ProductPriceTier (preco por quantidade minima)
# =============================================================================


class ProductPriceTier(TimeStampedModel, TenantScopedModel):
    product = models.ForeignKey(
        Product,
        on_delete=models.CASCADE,
        related_name='price_tiers',
    )
    price = models.ForeignKey(
        'ProductPrice',
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name='tiers',
    )
    min_quantity = models.DecimalField(max_digits=18, decimal_places=6)
    amount = models.DecimalField(max_digits=18, decimal_places=4)
    is_active = models.BooleanField(default=True)
    version = models.PositiveIntegerField(default=1)

    objects = TenantManager()
    all_objects = models.Manager()

    class Meta:
        ordering = ['product', 'min_quantity']
        constraints = [
            models.CheckConstraint(
                condition=models.Q(min_quantity__gt=0),
                name='productpricetier_min_quantity_positive',
            ),
            models.CheckConstraint(
                condition=models.Q(amount__gte=0),
                name='productpricetier_amount_nonneg',
            ),
            models.UniqueConstraint(
                fields=['tenant', 'product', 'min_quantity'],
                condition=models.Q(is_active=True),
                name='uniq_productpricetier_tenant_product_qty_active',
            ),
        ]

    def __str__(self):
        return f'{self.product.sku} >= {self.min_quantity} = {self.amount}'

    def clean(self):
        super().clean()
        if self.min_quantity <= 0:
            raise ValidationError({'min_quantity': 'Minimum quantity must be positive.'})
        if self.amount < 0:
            raise ValidationError({'amount': 'Tier amount must not be negative.'})
        if self.product_id and not self.product.is_active:
            raise ValidationError({'product': 'Cannot add price tiers to an inactive product.'})
        if self.product_id and self.tenant_id:
            dup = (
                self.__class__.all_objects.filter(
                    tenant_id=self.tenant_id,
                    product_id=self.product_id,
                    min_quantity=self.min_quantity,
                    is_active=True,
                )
                .exclude(pk=self.pk)
                .exists()
            )
            if dup:
                raise ValidationError({'min_quantity': 'A tier with this quantity already exists.'})


class Brand(TimeStampedModel, TenantScopedModel):
    name = models.CharField(max_length=120)
    is_active = models.BooleanField(default=True)
    version = models.PositiveIntegerField(default=1)

    objects = TenantManager()
    all_objects = models.Manager()

    class Meta:
        ordering = ['name']
        constraints = [
            models.UniqueConstraint(
                fields=['tenant', 'name'],
                condition=models.Q(is_active=True),
                name='uniq_brand_tenant_name_active',
            ),
        ]

    def __str__(self):
        return self.name

    def clean(self):
        super().clean()
        self.name = ' '.join(self.name.split())
        duplicate = Brand.all_objects.filter(
            tenant_id=self.tenant_id,
            name__iexact=self.name,
            is_active=True,
        ).exclude(pk=self.pk)
        if duplicate.exists():
            raise ValidationError({'name': 'An active brand with this name already exists.'})

    def save(self, *args, **kwargs):
        self.name = ' '.join(self.name.split())
        super().save(*args, **kwargs)


class TenantProductCodeSequence(TimeStampedModel, TenantScopedModel):
    """Tenant-local state used to allocate internal EAN-13 bodies."""

    next_value = models.PositiveBigIntegerField(default=0)

    objects = TenantManager()
    all_objects = models.Manager()

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=['tenant'],
                name='uniq_tenant_product_code_sequence',
            ),
            models.CheckConstraint(
                condition=models.Q(next_value__gte=0, next_value__lt=10000000000),
                name='product_code_sequence_range',
            ),
        ]


class ProductImage(TimeStampedModel, TenantScopedModel):
    product = models.ForeignKey(Product, on_delete=models.CASCADE, related_name='images')
    object_key = models.CharField(max_length=500, blank=True, default='')
    file = models.FileField(upload_to='catalog/products/%Y/%m/', null=True, blank=True)
    alt_text = models.CharField(max_length=200, blank=True, default='')
    is_primary = models.BooleanField(default=False)
    position = models.PositiveSmallIntegerField(default=0)

    objects = TenantManager()
    all_objects = models.Manager()

    class Meta:
        ordering = ['product', 'position']

    def clean(self):
        super().clean()
        if self.product_id and self.tenant_id:
            if self.product.tenant_id != self.tenant_id:
                raise ValidationError({'product': 'Product must belong to the same tenant.'})


# =============================================================================
# Sprint 27 — CommercialCombo (commercial bundles)
# =============================================================================


class CommercialCombo(TimeStampedModel, TenantScopedModel):
    sku = models.CharField(max_length=64)
    name = models.CharField(max_length=200)
    description = models.TextField(blank=True, default='')
    price = models.DecimalField(max_digits=18, decimal_places=4)
    valid_from = models.DateTimeField()
    valid_to = models.DateTimeField(null=True, blank=True)
    is_active = models.BooleanField(default=True)
    version = models.PositiveIntegerField(default=1)

    objects = TenantManager()
    all_objects = models.Manager()

    class Meta:
        ordering = ['sku']
        constraints = [
            models.UniqueConstraint(
                fields=['tenant', 'sku'],
                condition=models.Q(is_active=True),
                name='uniq_combo_tenant_sku_active',
            ),
            models.CheckConstraint(
                condition=models.Q(price__gte=0),
                name='combo_price_nonneg',
            ),
        ]

    def __str__(self):
        return f'{self.sku} [{self.tenant.name}]'

    def save(self, *args, **kwargs):
        self.sku = self.sku.strip().upper()
        super().save(*args, **kwargs)


class ComboItem(TimeStampedModel, TenantScopedModel):
    combo = models.ForeignKey(
        CommercialCombo,
        on_delete=models.CASCADE,
        related_name='items',
    )
    item = models.ForeignKey(
        'Product',
        on_delete=models.PROTECT,
    )
    quantity = models.DecimalField(max_digits=18, decimal_places=6)
    is_active = models.BooleanField(default=True)
    version = models.PositiveIntegerField(default=1)

    objects = TenantManager()
    all_objects = models.Manager()

    class Meta:
        ordering = ['combo', 'item']
        constraints = [
            models.CheckConstraint(
                condition=models.Q(quantity__gt=0),
                name='comboitem_qty_positive',
            ),
            models.UniqueConstraint(
                fields=['tenant', 'combo', 'item'],
                condition=models.Q(is_active=True),
                name='uniq_comboitem_active',
            ),
        ]

    def __str__(self):
        return f'{self.combo.sku} → {self.item.sku} ×{self.quantity}'

    def clean(self):
        super().clean()
        if self.quantity <= 0:
            raise ValidationError({'quantity': 'Positive quantity required.'})
        if self.combo_id and self.tenant_id:
            if self.combo.tenant_id != self.tenant_id:
                raise ValidationError({'combo': 'Same tenant required.'})
        if self.item_id and self.tenant_id:
            if self.item.tenant_id != self.tenant_id:
                raise ValidationError({'item': 'Same tenant required.'})


# =============================================================================
# Sprint 23 — ProductComposition (kit components)
# =============================================================================


class ProductComposition(TimeStampedModel, TenantScopedModel):
    kit = models.ForeignKey(
        Product,
        on_delete=models.CASCADE,
        related_name='compositions',
        help_text='The kit product (product_kind=kit)',
    )
    component = models.ForeignKey(
        Product,
        on_delete=models.PROTECT,
        related_name='used_in_kits',
    )
    quantity = models.DecimalField(max_digits=18, decimal_places=6)
    version = models.PositiveIntegerField(default=1)
    is_active = models.BooleanField(default=True)

    objects = TenantManager()
    all_objects = models.Manager()

    class Meta:
        ordering = ['kit', 'component']
        constraints = [
            models.CheckConstraint(
                condition=models.Q(quantity__gt=0),
                name='productcomposition_quantity_positive',
            ),
            models.UniqueConstraint(
                fields=['tenant', 'kit', 'component'],
                condition=models.Q(is_active=True),
                name='uniq_composition_kit_component_active',
            ),
        ]

    def __str__(self):
        return f'{self.kit.sku} = {self.quantity} x {self.component.sku}'

    def clean(self):
        super().clean()
        if self.quantity <= 0:
            raise ValidationError({'quantity': 'Quantity must be positive.'})
        if self.kit_id and self.component_id:
            if self.kit_id == self.component_id:
                raise ValidationError({'component': 'A kit cannot be composed of itself.'})
            if self.kit.tenant_id != self.tenant_id:
                raise ValidationError({'kit': 'Kit must belong to the same tenant.'})
            if self.component.tenant_id != self.tenant_id:
                raise ValidationError({'component': 'Component must belong to the same tenant.'})
            # D-KIT-2: component cannot itself be a kit
            if self.component.product_kind == 'kit':
                raise ValidationError({'component': 'A kit component cannot be another kit.'})
            # Cycle detection
            if self._has_cycle():
                raise ValidationError(
                    {'component': 'Adding this component would create a composition cycle.'}
                )

    def _has_cycle(self):
        visited = {self.kit_id}
        stack = [self.component_id]
        while stack:
            current = stack.pop()
            if current in visited:
                return True
            visited.add(current)
            children = ProductComposition.all_objects.filter(
                kit_id=current,
                is_active=True,
            ).values_list('component_id', flat=True)
            stack.extend(children)
        return False


# =============================================================================
# Sprint 28 — LabelTemplate (modelos de etiquetas)
# =============================================================================


class LabelTemplate(TimeStampedModel, TenantScopedModel):
    name = models.CharField(max_length=120)
    width_mm = models.DecimalField(max_digits=8, decimal_places=2)
    height_mm = models.DecimalField(max_digits=8, decimal_places=2)
    margin_mm = models.DecimalField(max_digits=8, decimal_places=2, default=Decimal('2.00'))
    columns = models.PositiveSmallIntegerField(default=2)
    rows = models.PositiveSmallIntegerField(default=5)
    show_sku = models.BooleanField(default=True)
    show_barcode = models.BooleanField(default=True)
    show_price = models.BooleanField(default=True)
    show_name = models.BooleanField(default=True)
    is_active = models.BooleanField(default=True)
    version = models.PositiveIntegerField(default=1)

    objects = TenantManager()
    all_objects = models.Manager()

    class Meta:
        ordering = ['name']
        constraints = [
            models.CheckConstraint(condition=models.Q(width_mm__gt=0), name='label_width_positive'),
            models.CheckConstraint(
                condition=models.Q(height_mm__gt=0), name='label_height_positive'
            ),
        ]

    def __str__(self):
        return f'{self.name} [{self.tenant.name}]'


# =============================================================================
# Sprint 29 — ProductChannelProfile (per-channel product content)
# =============================================================================


class ProductChannelProfile(TimeStampedModel, TenantScopedModel):
    STATUS_CHOICES = [
        ('draft', 'Draft'),
        ('ready', 'Ready'),
        ('published', 'Published'),
        ('failed', 'Failed'),
    ]
    product = models.ForeignKey(
        Product,
        on_delete=models.CASCADE,
        related_name='channel_profiles',
    )
    channel_slug = models.CharField(max_length=60)
    title = models.CharField(max_length=200, blank=True, default='')
    description = models.TextField(blank=True, default='')
    list_price = models.DecimalField(max_digits=18, decimal_places=4, null=True, blank=True)
    sale_price = models.DecimalField(max_digits=18, decimal_places=4, null=True, blank=True)
    dimensions_json = models.JSONField(default=dict, blank=True)
    weight_grams = models.PositiveIntegerField(null=True, blank=True)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='draft')
    version = models.PositiveIntegerField(default=1)
    published_at = models.DateTimeField(null=True, blank=True)

    objects = TenantManager()
    all_objects = models.Manager()

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=['tenant', 'product', 'channel_slug'],
                name='uniq_channel_profile_prod_slug',
            ),
        ]

    def __str__(self):
        return f'{self.product.sku} → {self.channel_slug} [{self.status}]'


class ProductApplyCommand(TimeStampedModel, TenantScopedModel):
    """Idempotency receipt for the complete product-apply transaction."""

    command_id = models.CharField(max_length=80)
    payload_hash = models.CharField(max_length=64)
    response_json = models.JSONField(default=dict, blank=True)
    correlation_id = models.UUIDField()

    objects = TenantManager()
    all_objects = models.Manager()

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=['tenant', 'command_id'],
                name='uniq_product_apply_command_tenant_id',
            ),
        ]
