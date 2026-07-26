from django.core.exceptions import ValidationError
from django.db import models

from tenancy.managers import TenantManager
from tenancy.models import TenantScopedModel, TimeStampedModel


class VersionedPurchasingModel(TimeStampedModel, TenantScopedModel):
    version = models.PositiveIntegerField(default=1)

    class Meta:
        abstract = True


class Supplier(VersionedPurchasingModel):
    person = models.ForeignKey(
        'people.Person',
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name='supplier_profiles',
    )
    name = models.CharField(max_length=200)
    cnpj = models.CharField(max_length=18, blank=True, default='')
    phone = models.CharField(max_length=20, blank=True, default='')
    email = models.EmailField(blank=True, default='')

    objects = TenantManager()
    all_objects = models.Manager()

    class Meta:
        ordering = ['name']

    def __str__(self):
        return self.name

    def clean(self):
        if self.person_id and self.person.tenant_id != self.tenant_id:
            raise ValidationError('Person must belong to the same tenant.')


class PurchaseOrder(VersionedPurchasingModel):
    STATUS_CHOICES = [
        ('draft', 'Rascunho'),
        ('approved', 'Aprovado'),
        ('partially_received', 'Parcialmente Recebido'),
        ('received', 'Recebido'),
        ('cancelled', 'Cancelado'),
    ]

    supplier = models.ForeignKey(
        Supplier,
        on_delete=models.PROTECT,
        related_name='purchase_orders',
    )
    branch = models.ForeignKey(
        'tenancy.Branch',
        on_delete=models.PROTECT,
        related_name='purchase_orders',
    )
    status = models.CharField(
        max_length=20,
        choices=STATUS_CHOICES,
        default='draft',
    )
    notes = models.TextField(blank=True, default='')
    items_total = models.DecimalField(
        max_digits=18,
        decimal_places=2,
        default=0,
    )
    idempotency_key = models.CharField(max_length=100, blank=True, default='')
    payload_hash = models.CharField(max_length=64, blank=True, default='')

    objects = TenantManager()
    all_objects = models.Manager()

    class Meta:
        ordering = ['-created_at']

    def clean(self):
        if self.supplier_id and self.supplier.tenant_id != self.tenant_id:
            raise ValidationError('Supplier must belong to the same tenant.')
        if self.branch_id and self.branch.tenant_id != self.tenant_id:
            raise ValidationError('Branch must belong to the same tenant.')

    def __str__(self):
        return f'PO-{str(self.id)[:8]} ({self.supplier.name})'


class PurchaseOrderItem(VersionedPurchasingModel):
    purchase_order = models.ForeignKey(
        PurchaseOrder,
        on_delete=models.CASCADE,
        related_name='items',
    )
    product = models.ForeignKey(
        'catalog.Product',
        on_delete=models.PROTECT,
        related_name='purchase_order_items',
    )
    unit = models.ForeignKey(
        'catalog.Unit',
        on_delete=models.PROTECT,
        related_name='purchase_order_items',
    )
    quantity = models.DecimalField(max_digits=18, decimal_places=6)
    unit_cost = models.DecimalField(max_digits=18, decimal_places=2)
    factor = models.DecimalField(max_digits=18, decimal_places=6)

    objects = TenantManager()
    all_objects = models.Manager()

    class Meta:
        ordering = ['created_at']

    def clean(self):
        if self.quantity <= 0:
            raise ValidationError('Quantity must be positive.')
        if self.unit_cost <= 0:
            raise ValidationError('Unit cost must be positive.')
        if self.factor <= 0:
            raise ValidationError('Factor must be positive.')
        if self.product.tenant_id != self.tenant_id:
            raise ValidationError('Product must belong to the same tenant.')
        if self.unit.tenant_id != self.tenant_id:
            raise ValidationError('Unit must belong to the same tenant.')
        if self.purchase_order_id and self.purchase_order.status != 'draft':
            raise ValidationError(
                'Cannot modify items of a purchase order '
                f'with status "{self.purchase_order.status}".'
            )

    def line_total(self):
        return self.quantity * self.unit_cost * self.factor


class PurchaseReceipt(VersionedPurchasingModel):
    STATUS_CHOICES = [
        ('draft', 'Rascunho'),
        ('confirmed', 'Confirmado'),
        ('cancelled', 'Cancelado'),
    ]

    purchase_order = models.ForeignKey(
        PurchaseOrder,
        on_delete=models.PROTECT,
        related_name='receipts',
    )
    status = models.CharField(
        max_length=20,
        choices=STATUS_CHOICES,
        default='draft',
    )
    notes = models.TextField(blank=True, default='')
    idempotency_key = models.CharField(max_length=100, blank=True, default='')
    payload_hash = models.CharField(max_length=64, blank=True, default='')

    objects = TenantManager()
    all_objects = models.Manager()

    class Meta:
        ordering = ['-created_at']

    def clean(self):
        if self.purchase_order_id and self.purchase_order.tenant_id != self.tenant_id:
            raise ValidationError('Purchase order must belong to the same tenant.')

    def __str__(self):
        return f'RCT-{str(self.id)[:8]} (PO-{str(self.purchase_order_id)[:8]})'


class PurchaseReceiptItem(VersionedPurchasingModel):
    receipt = models.ForeignKey(
        PurchaseReceipt,
        on_delete=models.CASCADE,
        related_name='items',
    )
    purchase_order_item = models.ForeignKey(
        PurchaseOrderItem,
        on_delete=models.PROTECT,
        related_name='receipt_items',
    )
    quantity_received = models.DecimalField(max_digits=18, decimal_places=6)
    unit_cost = models.DecimalField(max_digits=18, decimal_places=2)

    objects = TenantManager()
    all_objects = models.Manager()

    class Meta:
        ordering = ['created_at']

    def clean(self):
        if self.quantity_received <= 0:
            raise ValidationError('Quantity received must be positive.')
        if self.unit_cost <= 0:
            raise ValidationError('Unit cost must be positive.')
        if self.purchase_order_item.tenant_id != self.tenant_id:
            raise ValidationError('Purchase order item must belong to the same tenant.')

    def line_total(self):
        return self.quantity_received * self.unit_cost


class PurchaseOrderCancellation(VersionedPurchasingModel):
    purchase_order = models.ForeignKey(
        PurchaseOrder,
        on_delete=models.PROTECT,
        related_name='cancellations',
    )
    reason = models.TextField()
    status = models.CharField(
        max_length=20,
        choices=[('completed', 'Concluída'), ('failed', 'Falha')],
        default='completed',
    )
    idempotency_key = models.CharField(max_length=100, unique=True)
    payload_hash = models.CharField(max_length=64, blank=True, default='')

    objects = TenantManager()
    all_objects = models.Manager()

    class Meta:
        ordering = ['-created_at']

    def clean(self):
        if self.purchase_order_id and self.purchase_order.tenant_id != self.tenant_id:
            raise ValidationError('Purchase order must belong to the same tenant.')

    def __str__(self):
        return f'POC-{str(self.id)[:8]} (PO-{str(self.purchase_order_id)[:8]})'


class PurchaseReceiptCancellation(VersionedPurchasingModel):
    receipt = models.ForeignKey(
        PurchaseReceipt,
        on_delete=models.PROTECT,
        related_name='cancellations',
    )
    reason = models.TextField()
    status = models.CharField(
        max_length=20,
        choices=[('completed', 'Concluída'), ('failed', 'Falha')],
        default='completed',
    )
    idempotency_key = models.CharField(max_length=100, unique=True)
    payload_hash = models.CharField(max_length=64, blank=True, default='')

    objects = TenantManager()
    all_objects = models.Manager()

    class Meta:
        ordering = ['-created_at']

    def clean(self):
        if self.receipt_id and self.receipt.tenant_id != self.tenant_id:
            raise ValidationError('Receipt must belong to the same tenant.')

    def __str__(self):
        return f'PRC-{str(self.id)[:8]} (RCT-{str(self.receipt_id)[:8]})'


class SupplierReturn(VersionedPurchasingModel):
    receipt = models.ForeignKey(
        PurchaseReceipt,
        on_delete=models.PROTECT,
        related_name='returns',
    )
    reason = models.TextField()
    status = models.CharField(
        max_length=20,
        choices=[('draft', 'Rascunho'), ('completed', 'Concluída'), ('cancelled', 'Cancelada')],
        default='completed',
    )
    idempotency_key = models.CharField(max_length=100, unique=True)
    payload_hash = models.CharField(max_length=64, blank=True, default='')

    objects = TenantManager()
    all_objects = models.Manager()

    class Meta:
        ordering = ['-created_at']

    def clean(self):
        if self.receipt_id and self.receipt.tenant_id != self.tenant_id:
            raise ValidationError('Receipt must belong to the same tenant.')

    def __str__(self):
        return f'RET-{str(self.id)[:8]} (RCT-{str(self.receipt_id)[:8]})'


class SupplierReturnItem(VersionedPurchasingModel):
    supplier_return = models.ForeignKey(
        SupplierReturn,
        on_delete=models.CASCADE,
        related_name='items',
    )
    purchase_order_item = models.ForeignKey(
        PurchaseOrderItem,
        on_delete=models.PROTECT,
        related_name='return_items',
    )
    quantity = models.DecimalField(max_digits=18, decimal_places=6)
    unit_cost = models.DecimalField(max_digits=18, decimal_places=2)

    objects = TenantManager()
    all_objects = models.Manager()

    class Meta:
        ordering = ['created_at']

    def clean(self):
        if self.quantity <= 0:
            raise ValidationError('Quantity must be positive.')
        if self.unit_cost <= 0:
            raise ValidationError('Unit cost must be positive.')
        if self.purchase_order_item.tenant_id != self.tenant_id:
            raise ValidationError('Purchase order item must belong to the same tenant.')

    def line_total(self):
        return self.quantity * self.unit_cost


class RecurringPurchaseOrderTemplate(VersionedPurchasingModel):
    FREQ_DAILY = 'daily'
    FREQ_WEEKLY = 'weekly'
    FREQ_BIWEEKLY = 'biweekly'
    FREQ_MONTHLY = 'monthly'
    FREQ_QUARTERLY = 'quarterly'

    FREQ_CHOICES = [
        (FREQ_DAILY, 'Diário'),
        (FREQ_WEEKLY, 'Semanal'),
        (FREQ_BIWEEKLY, 'Quinzenal'),
        (FREQ_MONTHLY, 'Mensal'),
        (FREQ_QUARTERLY, 'Trimestral'),
    ]

    supplier = models.ForeignKey(
        Supplier,
        on_delete=models.PROTECT,
        related_name='recurring_templates',
    )
    branch = models.ForeignKey(
        'tenancy.Branch',
        on_delete=models.PROTECT,
        related_name='recurring_templates',
    )
    frequency = models.CharField(max_length=20, choices=FREQ_CHOICES, default=FREQ_MONTHLY)
    next_run = models.DateField(null=True, blank=True)
    is_active = models.BooleanField(default=True)
    notes = models.TextField(blank=True, default='')

    objects = TenantManager()
    all_objects = models.Manager()

    class Meta:
        ordering = ['next_run', '-created_at']

    def clean(self):
        if self.supplier_id and self.supplier.tenant_id != self.tenant_id:
            raise ValidationError('Supplier must belong to the same tenant.')
        if self.branch_id and self.branch.tenant_id != self.tenant_id:
            raise ValidationError('Branch must belong to the same tenant.')

    def __str__(self):
        return f'Recurring PO-{str(self.id)[:8]} ({self.supplier.name})'


class RecurringTemplateItem(VersionedPurchasingModel):
    template = models.ForeignKey(
        RecurringPurchaseOrderTemplate,
        on_delete=models.CASCADE,
        related_name='items',
    )
    product = models.ForeignKey(
        'catalog.Product',
        on_delete=models.PROTECT,
        related_name='recurring_template_items',
    )
    unit = models.ForeignKey(
        'catalog.Unit',
        on_delete=models.PROTECT,
        related_name='recurring_template_items',
    )
    quantity = models.DecimalField(max_digits=18, decimal_places=6)
    unit_cost = models.DecimalField(max_digits=18, decimal_places=2)
    factor = models.DecimalField(max_digits=18, decimal_places=6, default=1)

    objects = TenantManager()
    all_objects = models.Manager()

    class Meta:
        ordering = ['created_at']

    def clean(self):
        if self.quantity <= 0:
            raise ValidationError('Quantity must be positive.')
        if self.unit_cost <= 0:
            raise ValidationError('Unit cost must be positive.')
        if self.product.tenant_id != self.tenant_id:
            raise ValidationError('Product must belong to the same tenant.')

    def line_total(self):
        return self.quantity * self.unit_cost * self.factor
