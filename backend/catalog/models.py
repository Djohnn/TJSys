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
    model = models.CharField(max_length=120, blank=True, default='')
    tags = models.JSONField(default=list, blank=True)
    scale_code = models.CharField(max_length=20, blank=True, default='')

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
