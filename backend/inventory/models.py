from django.conf import settings
from django.core.exceptions import ValidationError
from django.db import models
from django.utils import timezone

from tenancy.managers import TenantManager
from tenancy.models import TenantScopedModel, TimeStampedModel


class VersionedInventoryModel(TimeStampedModel, TenantScopedModel):
    version = models.PositiveIntegerField(default=1)

    class Meta:
        abstract = True


class StockLocation(VersionedInventoryModel):
    LOCATION_TYPES = [
        ('warehouse', 'Armazem'),
        ('store', 'Loja'),
        ('counter', 'Balcao'),
        ('general', 'Geral'),
    ]

    branch = models.ForeignKey(
        'tenancy.Branch',
        on_delete=models.CASCADE,
        related_name='stock_locations',
    )
    code = models.CharField(max_length=40)
    name = models.CharField(max_length=120)
    location_type = models.CharField(
        max_length=20,
        choices=LOCATION_TYPES,
        default='general',
    )
    is_primary = models.BooleanField(default=False)
    is_active = models.BooleanField(default=True)

    objects = TenantManager()
    all_objects = models.Manager()

    class Meta:
        ordering = ['branch', 'code']
        constraints = [
            models.UniqueConstraint(
                fields=['tenant', 'branch', 'code'],
                name='uniq_stocklocation_branch_code',
            ),
            models.UniqueConstraint(
                fields=['tenant', 'branch'],
                condition=models.Q(is_primary=True) & models.Q(is_active=True),
                name='uniq_primary_location_per_branch',
            ),
        ]

    def __str__(self):
        return f'{self.name} [{self.branch.name}]'

    def save(self, *args, **kwargs):
        if self.is_primary and self.is_active:
            StockLocation.all_objects.filter(
                tenant_id=self.tenant_id,
                branch_id=self.branch_id,
                is_primary=True,
                is_active=True,
            ).exclude(pk=self.pk).update(is_primary=False)
        super().save(*args, **kwargs)

    def clean(self):
        super().clean()
        if self.branch_id and self.tenant_id and self.branch.tenant_id != self.tenant_id:
            raise ValidationError({'branch': 'Branch must belong to the same tenant.'})

    def delete(self, *args, **kwargs):
        if (
            StockMovement.all_objects.filter(location=self).exists()
            or StockBalance.all_objects.filter(location=self)
            .exclude(quantity=0, reserved=0)
            .exists()
        ):
            raise ValidationError('Stock location with history cannot be deleted.')
        return super().delete(*args, **kwargs)


class StockLot(VersionedInventoryModel):
    product = models.ForeignKey(
        'catalog.Product',
        on_delete=models.PROTECT,
        related_name='stock_lots',
    )
    lot_number = models.CharField(max_length=64)
    manufacture_date = models.DateField(null=True, blank=True)
    expiry_date = models.DateField(null=True, blank=True)
    is_active = models.BooleanField(default=True)

    objects = TenantManager()
    all_objects = models.Manager()

    class Meta:
        ordering = ['product', 'lot_number']
        constraints = [
            models.UniqueConstraint(
                fields=['tenant', 'product', 'lot_number'],
                name='uniq_stocklot_tenant_product_number',
            ),
        ]

    def __str__(self):
        return f'{self.lot_number} ({self.product.sku})'

    @property
    def is_expired(self):
        return bool(self.expiry_date and self.expiry_date < timezone.now().date())

    def clean(self):
        super().clean()
        if self.manufacture_date and self.expiry_date and self.manufacture_date >= self.expiry_date:
            raise ValidationError({'expiry_date': 'Expiry date must be after manufacture date.'})
        if self.product_id and self.tenant_id and self.product.tenant_id != self.tenant_id:
            raise ValidationError({'product': 'Product must belong to the same tenant.'})


class StockOperation(VersionedInventoryModel):
    TYPE_CHOICES = [
        ('receipt', 'Entrada'),
        ('issue', 'Saida'),
        ('adjustment', 'Ajuste'),
        ('transfer', 'Transferencia'),
        ('reversal', 'Reversao'),
    ]

    STATUS_CHOICES = [
        ('draft', 'Rascunho'),
        ('confirmed', 'Confirmada'),
        ('cancelled', 'Cancelada'),
        ('reversed', 'Revertida'),
    ]

    operation_type = models.CharField(max_length=20, choices=TYPE_CHOICES)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='draft')
    branch = models.ForeignKey(
        'tenancy.Branch',
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name='stock_operations',
    )
    actor = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='stock_operations',
    )
    idempotency_key = models.CharField(max_length=100, blank=True, default='')
    payload_hash = models.CharField(max_length=64, blank=True, default='')
    reference = models.CharField(max_length=100, blank=True, default='')
    reason = models.TextField(blank=True, default='')

    objects = TenantManager()
    all_objects = models.Manager()

    class Meta:
        ordering = ['-created_at']
        constraints = [
            models.UniqueConstraint(
                fields=['tenant', 'idempotency_key'],
                name='uniq_stockoperation_tenant_idempotency',
                condition=models.Q(idempotency_key__gt=''),
            ),
        ]

    def clean(self):
        super().clean()
        if self.branch_id and self.tenant_id and self.branch.tenant_id != self.tenant_id:
            raise ValidationError({'branch': 'Branch must belong to the same tenant.'})
        if self.idempotency_key:
            exists = (
                StockOperation.all_objects.filter(
                    tenant_id=self.tenant_id,
                    idempotency_key=self.idempotency_key,
                )
                .exclude(pk=self.pk)
                .exists()
            )
            if exists:
                raise ValidationError({'idempotency_key': 'Idempotency key already used.'})


class StockMovement(VersionedInventoryModel):
    DIRECTION_CHOICES = [
        ('in', 'Entrada'),
        ('out', 'Saida'),
    ]

    operation = models.ForeignKey(
        'inventory.StockOperation',
        on_delete=models.PROTECT,
        related_name='movements',
    )
    product = models.ForeignKey(
        'catalog.Product',
        on_delete=models.PROTECT,
        related_name='stock_movements',
    )
    location = models.ForeignKey(
        'inventory.StockLocation',
        on_delete=models.PROTECT,
        related_name='movements',
    )
    lot = models.ForeignKey(
        'inventory.StockLot',
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name='stock_movements',
    )
    direction = models.CharField(max_length=3, choices=DIRECTION_CHOICES)
    quantity = models.DecimalField(max_digits=18, decimal_places=6)
    unit = models.ForeignKey(
        'catalog.Unit',
        on_delete=models.PROTECT,
        related_name='stock_movements',
    )
    factor = models.DecimalField(max_digits=18, decimal_places=6, default=1)
    unit_cost = models.DecimalField(max_digits=18, decimal_places=6, null=True, blank=True)
    notes = models.TextField(blank=True, default='')

    objects = TenantManager()
    all_objects = models.Manager()

    class Meta:
        ordering = ['created_at']

    def clean(self):
        super().clean()
        if self.quantity <= 0:
            raise ValidationError({'quantity': 'Quantity must be positive.'})
        if self.factor <= 0:
            raise ValidationError({'factor': 'Factor must be positive.'})
        if self.product_id and self.tenant_id and self.product.tenant_id != self.tenant_id:
            raise ValidationError({'product': 'Product must belong to the same tenant.'})
        if self.location_id and self.tenant_id and self.location.tenant_id != self.tenant_id:
            raise ValidationError({'location': 'Location must belong to the same tenant.'})
        if self.unit_id and self.tenant_id and self.unit.tenant_id != self.tenant_id:
            raise ValidationError({'unit': 'Unit must belong to the same tenant.'})
        if self.lot_id and self.tenant_id:
            if self.lot.tenant_id != self.tenant_id:
                raise ValidationError({'lot': 'Lot must belong to the same tenant.'})
            if self.lot.product_id != self.product_id:
                raise ValidationError({'lot': 'Lot must belong to the same product.'})

    def save(self, *args, **kwargs):
        if not self._state.adding:
            current = StockMovement.all_objects.select_related('operation').get(pk=self.pk)
            if current.operation.status == 'confirmed':
                raise ValidationError('Confirmed stock movements are immutable.')
        return super().save(*args, **kwargs)

    def delete(self, *args, **kwargs):
        if self.operation.status == 'confirmed':
            raise ValidationError('Confirmed stock movements cannot be deleted.')
        return super().delete(*args, **kwargs)


class StockBalance(VersionedInventoryModel):
    product = models.ForeignKey(
        'catalog.Product',
        on_delete=models.PROTECT,
        related_name='stock_balances',
    )
    location = models.ForeignKey(
        'inventory.StockLocation',
        on_delete=models.PROTECT,
        related_name='stock_balances',
    )
    lot = models.ForeignKey(
        'inventory.StockLot',
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name='stock_balances',
    )
    quantity = models.DecimalField(max_digits=18, decimal_places=6, default=0)
    reserved = models.DecimalField(max_digits=18, decimal_places=6, default=0)

    objects = TenantManager()
    all_objects = models.Manager()

    class Meta:
        ordering = ['product', 'location', 'lot']
        constraints = [
            models.UniqueConstraint(
                fields=['tenant', 'product', 'location', 'lot'],
                name='uniq_stockbalance_tenant_product_location_lot',
            ),
        ]

    @property
    def available(self):
        return self.quantity - self.reserved

    def __str__(self):
        lot_str = f' lot:{self.lot.lot_number}' if self.lot else ''
        return f'{self.product.sku} @ {self.location.code}{lot_str} = {self.quantity}'

    def clean(self):
        super().clean()
        if self.quantity < 0:
            policy_allows_negative = ProductStockPolicy.all_objects.filter(
                tenant_id=self.tenant_id,
                product_id=self.product_id,
                location_id=self.location_id,
                is_active=True,
                allow_negative=True,
            ).exists()
            if not policy_allows_negative:
                raise ValidationError({'quantity': 'Negative inventory is not allowed.'})
        if self.reserved < 0:
            raise ValidationError({'reserved': 'Reserved cannot be negative.'})
        if self.quantity < 0 and self.reserved != 0:
            raise ValidationError({'reserved': 'Negative inventory cannot have reservations.'})
        if self.quantity >= 0 and self.reserved > self.quantity:
            raise ValidationError({'reserved': 'Reserved cannot exceed quantity.'})
        if self.product_id and self.tenant_id and self.product.tenant_id != self.tenant_id:
            raise ValidationError({'product': 'Product must belong to the same tenant.'})
        if self.location_id and self.tenant_id and self.location.tenant_id != self.tenant_id:
            raise ValidationError({'location': 'Location must belong to the same tenant.'})
        if self.lot_id and self.tenant_id:
            if self.lot.tenant_id != self.tenant_id:
                raise ValidationError({'lot': 'Lot must belong to the same tenant.'})
            if self.lot.product_id != self.product_id:
                raise ValidationError({'lot': 'Lot must belong to the same product.'})


class StockOperationReversal(VersionedInventoryModel):
    original_operation = models.ForeignKey(
        'inventory.StockOperation',
        on_delete=models.PROTECT,
        related_name='reversals',
    )
    reversal_operation = models.OneToOneField(
        'inventory.StockOperation',
        on_delete=models.PROTECT,
        related_name='reversal_of',
    )
    reason = models.TextField()

    objects = TenantManager()
    all_objects = models.Manager()

    class Meta:
        ordering = ['-created_at']
        constraints = [
            models.UniqueConstraint(
                fields=['tenant', 'original_operation'],
                name='uniq_stockoperationreversal_original',
            ),
        ]

    def clean(self):
        super().clean()
        if (
            self.original_operation_id
            and self.tenant_id
            and self.original_operation.tenant_id != self.tenant_id
        ):
            raise ValidationError(
                {'original_operation': 'Original operation must belong to the same tenant.'}
            )
        if (
            self.reversal_operation_id
            and self.tenant_id
            and self.reversal_operation.tenant_id != self.tenant_id
        ):
            raise ValidationError(
                {'reversal_operation': 'Reversal operation must belong to the same tenant.'}
            )


class ProductStockPolicy(TimeStampedModel, TenantScopedModel):
    product = models.ForeignKey(
        'catalog.Product',
        on_delete=models.PROTECT,
        related_name='stock_policies',
    )
    branch = models.ForeignKey(
        'tenancy.Branch',
        on_delete=models.PROTECT,
    )
    location = models.ForeignKey(
        StockLocation,
        on_delete=models.PROTECT,
    )
    minimum_quantity = models.DecimalField(max_digits=18, decimal_places=6, default=0)
    maximum_quantity = models.DecimalField(
        max_digits=18,
        decimal_places=6,
        null=True,
        blank=True,
    )
    reorder_point = models.DecimalField(max_digits=18, decimal_places=6, default=0)
    allow_negative = models.BooleanField(default=False)
    is_active = models.BooleanField(default=True)
    version = models.PositiveIntegerField(default=1)

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
        if self.product_id and self.tenant_id and self.product.tenant_id != self.tenant_id:
            errors['product'] = 'Product must belong to the same tenant.'
        if self.branch_id and self.tenant_id and self.branch.tenant_id != self.tenant_id:
            errors['branch'] = 'Branch must belong to the same tenant.'
        if self.location_id and self.tenant_id and self.location.tenant_id != self.tenant_id:
            errors['location'] = 'Location must belong to the same tenant.'
        if self.location_id and self.branch_id and self.location.branch_id != self.branch_id:
            errors['location'] = 'Location must belong to the selected branch.'
        if self.maximum_quantity is not None and self.maximum_quantity < self.minimum_quantity:
            errors['maximum_quantity'] = 'Maximum must be >= minimum.'
        if self.minimum_quantity < 0:
            errors['minimum_quantity'] = 'Minimum quantity cannot be negative.'
        if self.reorder_point < 0:
            errors['reorder_point'] = 'Reorder point cannot be negative.'
        if errors:
            raise ValidationError(errors)


class ProductStockControlCommand(TimeStampedModel, TenantScopedModel):
    """Idempotency receipt for stock control transitions (deactivate/reactivate)."""

    ACTION_CHOICES = [
        ('deactivate', 'Deactivate'),
        ('reactivate', 'Reactivate'),
    ]

    command_id = models.CharField(max_length=80)
    action = models.CharField(max_length=20, choices=ACTION_CHOICES)
    payload_hash = models.CharField(max_length=64)
    response_json = models.JSONField(default=dict, blank=True)
    correlation_id = models.UUIDField()

    objects = TenantManager()
    all_objects = models.Manager()

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=['tenant', 'command_id'],
                name='uniq_product_stock_control_command_tenant_id',
            ),
        ]


# =============================================================================
# Sprint F7 — ProductionOrder (ordens de produção)
# =============================================================================


class ProductionOrder(VersionedInventoryModel):
    STATUS_CHOICES = [
        ('draft', 'Rascunho'),
        ('confirmed', 'Confirmada'),
        ('in_progress', 'Em andamento'),
        ('completed', 'Concluída'),
        ('cancelled', 'Cancelada'),
    ]

    PRIORITY_CHOICES = [
        ('low', 'Baixa'),
        ('medium', 'Média'),
        ('high', 'Alta'),
        ('urgent', 'Urgente'),
    ]

    code = models.CharField(max_length=40)
    product = models.ForeignKey(
        'catalog.Product',
        on_delete=models.PROTECT,
        related_name='production_orders',
    )
    quantity = models.DecimalField(max_digits=18, decimal_places=6)
    unit = models.ForeignKey(
        'catalog.Unit',
        on_delete=models.PROTECT,
        related_name='production_orders',
    )
    location = models.ForeignKey(
        StockLocation,
        on_delete=models.PROTECT,
        related_name='production_orders',
    )
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='draft')
    priority = models.CharField(max_length=20, choices=PRIORITY_CHOICES, default='medium')
    planned_start_date = models.DateField(null=True, blank=True)
    planned_end_date = models.DateField(null=True, blank=True)
    actual_start_date = models.DateField(null=True, blank=True)
    actual_end_date = models.DateField(null=True, blank=True)
    notes = models.TextField(blank=True, default='')
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='production_orders_created',
    )
    confirmed_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='production_orders_confirmed',
    )

    objects = TenantManager()
    all_objects = models.Manager()

    class Meta:
        ordering = ['-created_at']
        constraints = [
            models.UniqueConstraint(
                fields=['tenant', 'code'],
                name='uniq_production_order_tenant_code',
            ),
        ]

    def __str__(self):
        return f'{self.code} — {self.product.sku}'

    def clean(self):
        super().clean()
        errors = {}
        if self.product_id and self.tenant_id and self.product.tenant_id != self.tenant_id:
            errors['product'] = 'Product must belong to the same tenant.'
        if self.location_id and self.tenant_id and self.location.tenant_id != self.tenant_id:
            errors['location'] = 'Location must belong to the same tenant.'
        if self.unit_id and self.tenant_id and self.unit.tenant_id != self.tenant_id:
            errors['unit'] = 'Unit must belong to the same tenant.'
        if self.quantity <= 0:
            errors['quantity'] = 'Quantity must be positive.'
        if self.planned_start_date and self.planned_end_date:
            if self.planned_start_date > self.planned_end_date:
                errors['planned_end_date'] = 'End date must be after start date.'
        if errors:
            raise ValidationError(errors)

    def save(self, *args, **kwargs):
        if not self._state.adding:
            current = ProductionOrder.all_objects.get(pk=self.pk)
            if current.status in ('completed', 'cancelled'):
                raise ValidationError('Completed or cancelled orders are immutable.')
        super().save(*args, **kwargs)


# =============================================================================
# Sprint F7 — ProductionOrderItem (itens da ordem de produção)
# =============================================================================


class ProductionOrderItem(VersionedInventoryModel):
    order = models.ForeignKey(
        ProductionOrder,
        on_delete=models.CASCADE,
        related_name='items',
    )
    product = models.ForeignKey(
        'catalog.Product',
        on_delete=models.PROTECT,
        related_name='production_order_items',
    )
    quantity = models.DecimalField(max_digits=18, decimal_places=6)
    unit = models.ForeignKey(
        'catalog.Unit',
        on_delete=models.PROTECT,
        related_name='production_order_items',
    )
    location = models.ForeignKey(
        StockLocation,
        on_delete=models.PROTECT,
        related_name='production_order_items',
    )
    notes = models.TextField(blank=True, default='')

    objects = TenantManager()
    all_objects = models.Manager()

    class Meta:
        ordering = ['order', 'product']
        constraints = [
            models.CheckConstraint(
                condition=models.Q(quantity__gt=0),
                name='productionorderitem_quantity_positive',
            ),
        ]

    def __str__(self):
        return f'{self.order.code} — {self.product.sku} x {self.quantity}'

    def clean(self):
        super().clean()
        errors = {}
        if self.quantity <= 0:
            errors['quantity'] = 'Quantity must be positive.'
        if self.product_id and self.tenant_id and self.product.tenant_id != self.tenant_id:
            errors['product'] = 'Product must belong to the same tenant.'
        if self.location_id and self.tenant_id and self.location.tenant_id != self.tenant_id:
            errors['location'] = 'Location must belong to the same tenant.'
        if self.unit_id and self.tenant_id and self.unit.tenant_id != self.tenant_id:
            errors['unit'] = 'Unit must belong to the same tenant.'
        if self.order_id and self.tenant_id and self.order.tenant_id != self.tenant_id:
            errors['order'] = 'Order must belong to the same tenant.'
        if errors:
            raise ValidationError(errors)

    def save(self, *args, **kwargs):
        if not self._state.adding:
            current = ProductionOrderItem.all_objects.get(pk=self.pk)
            if current.order_id:
                order = ProductionOrder.all_objects.get(pk=current.order_id)
                if order.status in ('completed', 'cancelled'):
                    raise ValidationError('Items of completed or cancelled orders are immutable.')
        super().save(*args, **kwargs)


# =============================================================================
# Sprint F7 — ProductionOrderConsumption (consumo de composição)
# =============================================================================


class ProductionOrderConsumption(VersionedInventoryModel):
    order_item = models.ForeignKey(
        ProductionOrderItem,
        on_delete=models.CASCADE,
        related_name='consumptions',
    )
    component = models.ForeignKey(
        'catalog.Product',
        on_delete=models.PROTECT,
        related_name='production_order_consumptions',
    )
    quantity = models.DecimalField(max_digits=18, decimal_places=6)
    unit = models.ForeignKey(
        'catalog.Unit',
        on_delete=models.PROTECT,
        related_name='production_order_consumptions',
    )
    location = models.ForeignKey(
        StockLocation,
        on_delete=models.PROTECT,
        related_name='production_order_consumptions',
    )
    lot = models.ForeignKey(
        StockLot,
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name='production_order_consumptions',
    )
    notes = models.TextField(blank=True, default='')

    objects = TenantManager()
    all_objects = models.Manager()

    class Meta:
        ordering = ['order_item', 'component']
        constraints = [
            models.CheckConstraint(
                condition=models.Q(quantity__gt=0),
                name='productionorderconsumption_quantity_positive',
            ),
        ]

    def __str__(self):
        return f'{self.order_item.order.code} — {self.component.sku} x {self.quantity}'

    def clean(self):
        super().clean()
        errors = {}
        if self.quantity <= 0:
            errors['quantity'] = 'Quantity must be positive.'
        if self.component_id and self.tenant_id and self.component.tenant_id != self.tenant_id:
            errors['component'] = 'Component must belong to the same tenant.'
        if self.location_id and self.tenant_id and self.location.tenant_id != self.tenant_id:
            errors['location'] = 'Location must belong to the same tenant.'
        if self.unit_id and self.tenant_id and self.unit.tenant_id != self.tenant_id:
            errors['unit'] = 'Unit must belong to the same tenant.'
        if self.order_item_id and self.tenant_id and self.order_item.tenant_id != self.tenant_id:
            errors['order_item'] = 'Order item must belong to the same tenant.'
        if self.lot_id and self.tenant_id and self.lot.tenant_id != self.tenant_id:
            errors['lot'] = 'Lot must belong to the same tenant.'
        if errors:
            raise ValidationError(errors)

    def save(self, *args, **kwargs):
        if not self._state.adding:
            current = ProductionOrderConsumption.all_objects.get(pk=self.pk)
            if current.order_item_id:
                order_item = ProductionOrderItem.all_objects.get(pk=current.order_item_id)
                if order_item.order_id:
                    order = ProductionOrder.all_objects.get(pk=order_item.order_id)
                    if order.status in ('completed', 'cancelled'):
                        raise ValidationError('Consumptions of completed or cancelled orders are immutable.')
        super().save(*args, **kwargs)
