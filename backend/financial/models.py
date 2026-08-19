from django.core.exceptions import ValidationError
from django.db import models

from tenancy.managers import TenantManager
from tenancy.models import TenantScopedModel, TimeStampedModel


class VersionedFinancialModel(TimeStampedModel, TenantScopedModel):
    version = models.PositiveIntegerField(default=1)

    class Meta:
        abstract = True


class FinancialAccount(VersionedFinancialModel):
    TYPE_CHOICES = [
        ('cash', 'Caixa'),
        ('bank', 'Banco'),
        ('clearing', 'Compensação'),
    ]

    branch = models.ForeignKey(
        'tenancy.Branch',
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name='financial_accounts',
    )
    name = models.CharField(max_length=120)
    account_type = models.CharField(max_length=20, choices=TYPE_CHOICES)
    is_active = models.BooleanField(default=True)

    objects = TenantManager()
    all_objects = models.Manager()

    class Meta:
        ordering = ['name']
        constraints = [
            models.UniqueConstraint(
                fields=['tenant', 'name'],
                name='uniq_financial_account_name_tenant',
            ),
        ]


class FinancialObligation(VersionedFinancialModel):
    STATUS_CHOICES = [
        ('pending', 'Pendente'),
        ('partially_settled', 'Parcialmente liquidado'),
        ('settled', 'Liquidado'),
        ('cancelled', 'Cancelado'),
    ]

    branch = models.ForeignKey(
        'tenancy.Branch',
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name='+',
    )
    description = models.TextField(blank=True, default='')
    amount = models.DecimalField(max_digits=18, decimal_places=2)
    status = models.CharField(max_length=24, choices=STATUS_CHOICES, default='pending')
    due_date = models.DateField(null=True, blank=True)
    idempotency_key = models.CharField(max_length=100, blank=True, default='')
    payload_hash = models.CharField(max_length=64, blank=True, default='')

    class Meta:
        abstract = True

    def save(self, *args, **kwargs):
        if not self._state.adding:
            current = type(self).all_objects.get(pk=self.pk)
            if current.status in {'settled', 'cancelled'}:
                raise ValidationError('Confirmed financial obligations are immutable.')
        return super().save(*args, **kwargs)


class Receivable(FinancialObligation):
    customer_name = models.CharField(max_length=200, blank=True, default='')
    source_type = models.CharField(max_length=40, blank=True, default='')
    source_id = models.UUIDField(null=True, blank=True)

    objects = TenantManager()
    all_objects = models.Manager()

    class Meta:
        ordering = ['due_date', '-created_at']
        constraints = [
            models.CheckConstraint(
                condition=models.Q(amount__gt=0),
                name='financial_receivable_amount_positive',
            ),
            models.UniqueConstraint(
                fields=['tenant', 'idempotency_key'],
                condition=~models.Q(idempotency_key=''),
                name='uniq_receivable_idempotency_tenant',
            ),
        ]


class Payable(VersionedFinancialModel):
    STATUS_CHOICES = [
        ('pending', 'Pendente'),
        ('partially_settled', 'Parcialmente liquidado'),
        ('settled', 'Liquidado'),
        ('paid', 'Pago'),
        ('cancelled', 'Cancelado'),
        ('written_off', 'Baixado'),
    ]

    supplier_name = models.CharField(max_length=200)
    supplier = models.ForeignKey(
        'purchasing.Supplier',
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name='payables',
    )
    purchase_order = models.ForeignKey(
        'purchasing.PurchaseOrder',
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name='payables',
    )
    purchase_receipt = models.OneToOneField(
        'purchasing.PurchaseReceipt',
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name='payable',
    )
    branch = models.ForeignKey(
        'tenancy.Branch',
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name='payables',
    )
    description = models.TextField(blank=True, default='')
    amount = models.DecimalField(max_digits=18, decimal_places=2)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='pending')
    due_date = models.DateField(null=True, blank=True)
    paid_at = models.DateTimeField(null=True, blank=True)
    idempotency_key = models.CharField(max_length=100, blank=True, default='')
    payload_hash = models.CharField(max_length=64, blank=True, default='')

    objects = TenantManager()
    all_objects = models.Manager()

    class Meta:
        ordering = ['-created_at']
        constraints = [
            models.CheckConstraint(
                condition=models.Q(amount__gt=0),
                name='financial_payable_amount_positive',
            ),
            models.UniqueConstraint(
                fields=['tenant', 'idempotency_key'],
                condition=~models.Q(idempotency_key=''),
                name='uniq_payable_idempotency_tenant',
            ),
        ]

    def __str__(self):
        return f'{self.supplier_name} - {self.amount}'

    def save(self, *args, **kwargs):
        if not self._state.adding:
            current = Payable.all_objects.get(pk=self.pk)
            if current.status in {'settled', 'paid', 'cancelled', 'written_off'}:
                raise ValidationError('Confirmed payables are immutable.')
        return super().save(*args, **kwargs)


class Settlement(VersionedFinancialModel):
    account = models.ForeignKey(
        FinancialAccount,
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name='settlements',
    )
    payable = models.ForeignKey(
        Payable,
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name='settlements',
    )
    receivable = models.ForeignKey(
        Receivable,
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name='settlements',
    )
    amount = models.DecimalField(max_digits=18, decimal_places=2)
    settled_on = models.DateField()
    status = models.CharField(max_length=20, default='confirmed')
    idempotency_key = models.CharField(max_length=100, blank=True, default='')
    is_adjustment = models.BooleanField(default=False)

    objects = TenantManager()
    all_objects = models.Manager()

    class Meta:
        ordering = ['-settled_on', '-created_at']
        constraints = [
            models.CheckConstraint(
                condition=models.Q(amount__gt=0),
                name='financial_settlement_amount_positive',
            ),
            models.CheckConstraint(
                condition=(
                    models.Q(payable__isnull=False, receivable__isnull=True)
                    | models.Q(payable__isnull=True, receivable__isnull=False)
                ),
                name='financial_settlement_exactly_one_target',
            ),
            models.UniqueConstraint(
                fields=['tenant', 'idempotency_key'],
                condition=~models.Q(idempotency_key=''),
                name='uniq_settlement_idempotency_tenant',
            ),
        ]

    def save(self, *args, **kwargs):
        if not self._state.adding:
            raise ValidationError('Settlements are immutable; create an adjustment instead.')
        return super().save(*args, **kwargs)

    def delete(self, *args, **kwargs):
        raise ValidationError('Settlements are immutable; create an adjustment instead.')


class CashflowEntry(VersionedFinancialModel):
    DIRECTION_CHOICES = [('inflow', 'Entrada'), ('outflow', 'Saída')]
    STATUS_CHOICES = [('forecast', 'Previsto'), ('realized', 'Realizado')]

    branch = models.ForeignKey(
        'tenancy.Branch',
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name='cashflow_entries',
    )
    account = models.ForeignKey(
        FinancialAccount,
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name='cashflow_entries',
    )
    direction = models.CharField(max_length=10, choices=DIRECTION_CHOICES)
    status = models.CharField(max_length=10, choices=STATUS_CHOICES)
    amount = models.DecimalField(max_digits=18, decimal_places=2)
    effective_date = models.DateField()
    description = models.TextField(blank=True, default='')
    source_type = models.CharField(max_length=40)
    source_id = models.UUIDField(null=True, blank=True)
    idempotency_key = models.CharField(max_length=100, blank=True, default='')

    objects = TenantManager()
    all_objects = models.Manager()

    class Meta:
        ordering = ['effective_date', 'created_at']
        constraints = [
            models.CheckConstraint(
                condition=models.Q(amount__gt=0),
                name='financial_cashflow_amount_positive',
            ),
            models.UniqueConstraint(
                fields=['tenant', 'idempotency_key'],
                condition=~models.Q(idempotency_key=''),
                name='uniq_cashflow_idempotency_tenant',
            ),
        ]

    def save(self, *args, **kwargs):
        if not self._state.adding:
            raise ValidationError('Cashflow entries are immutable; create an adjustment instead.')
        return super().save(*args, **kwargs)

    def delete(self, *args, **kwargs):
        raise ValidationError('Cashflow entries are immutable; create an adjustment instead.')


# =============================================================================
# Sprint F10 — Fiscal Compensation
# =============================================================================


class FiscalCompensation(VersionedFinancialModel):
    COMPENSATION_TYPE_CHOICES = [
        ('credit', 'Crédito'),
        ('debit', 'Débito'),
        ('both', 'Ambos'),
    ]

    STATUS_CHOICES = [
        ('pending', 'Pendente'),
        ('approved', 'Aprovado'),
        ('rejected', 'Rejeitado'),
        ('processed', 'Processado'),
        ('cancelled', 'Cancelado'),
    ]

    fiscal_document = models.ForeignKey(
        'fiscal.FiscalDocument',
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name='compensations',
    )
    branch = models.ForeignKey(
        'tenancy.Branch',
        on_delete=models.PROTECT,
        related_name='fiscal_compensations',
    )
    customer_name = models.CharField(max_length=200, blank=True, default='')
    supplier_name = models.CharField(max_length=200, blank=True, default='')
    code = models.CharField(max_length=40)
    compensation_type = models.CharField(max_length=20, choices=COMPENSATION_TYPE_CHOICES, default='both')
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='pending')
    amount = models.DecimalField(max_digits=18, decimal_places=2)
    compensated_amount = models.DecimalField(max_digits=18, decimal_places=2, default=0)
    remaining_amount = models.DecimalField(max_digits=18, decimal_places=2)
    due_date = models.DateField(null=True, blank=True)
    compensated_at = models.DateTimeField(null=True, blank=True)
    notes = models.TextField(blank=True, default='')
    idempotency_key = models.CharField(max_length=100, blank=True, default='')
    payload_hash = models.CharField(max_length=64, blank=True, default='')

    objects = TenantManager()
    all_objects = models.Manager()

    class Meta:
        ordering = ['-created_at']
        constraints = [
            models.UniqueConstraint(
                fields=['tenant', 'code'],
                name='uniq_fiscal_compensation_tenant_code',
            ),
            models.UniqueConstraint(
                fields=['tenant', 'idempotency_key'],
                condition=~models.Q(idempotency_key=''),
                name='uniq_fiscal_compensation_idempotency_tenant',
            ),
        ]

    def __str__(self):
        return f'COMP-{self.code} ({self.customer_name or self.supplier_name})'

    def clean(self):
        super().clean()
        errors = {}
        if self.fiscal_document_id and self.fiscal_document.tenant_id != self.tenant_id:
            errors['fiscal_document'] = 'Fiscal document must belong to the same tenant.'
        if self.branch_id and self.branch.tenant_id != self.tenant_id:
            errors['branch'] = 'Branch must belong to the same tenant.'
        if self.amount < 0:
            errors['amount'] = 'Amount cannot be negative.'
        if self.compensated_amount < 0:
            errors['compensated_amount'] = 'Compensated amount cannot be negative.'
        if self.remaining_amount < 0:
            errors['remaining_amount'] = 'Remaining amount cannot be negative.'
        if errors:
            raise ValidationError(errors)

    def save(self, *args, **kwargs):
        if not self._state.adding:
            current = FiscalCompensation.all_objects.get(pk=self.pk)
            if current.status in ('cancelled', 'processed'):
                raise ValidationError('Cancelled or processed compensations are immutable.')
        self.remaining_amount = self.amount - self.compensated_amount
        super().save(*args, **kwargs)
