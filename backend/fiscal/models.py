import uuid

from django.db import models

from tenancy.managers import TenantManager
from tenancy.models import TenantScopedModel, TimeStampedModel


class FiscalEmitter(TenantScopedModel, TimeStampedModel):
    PROVIDER_PLUGNOTAS = 'plugnotas'

    REGISTRATION_MANUAL = 'manual'
    REGISTRATION_AUTOMATED = 'automated'

    branch = models.ForeignKey(
        'tenancy.Branch',
        on_delete=models.PROTECT,
        related_name='fiscal_emitters',
    )
    provider = models.CharField(max_length=30, default=PROVIDER_PLUGNOTAS)
    cpf_cnpj = models.CharField(max_length=18)
    ie = models.CharField(max_length=20, blank=True, default='')
    registration_source = models.CharField(
        max_length=20,
        choices=[
            (REGISTRATION_MANUAL, 'Manual'),
            (REGISTRATION_AUTOMATED, 'Automatizado'),
        ],
        default=REGISTRATION_MANUAL,
    )
    registered_at_provider = models.BooleanField(default=False)
    is_active = models.BooleanField(default=True)

    objects = TenantManager()
    all_objects = models.Manager()

    class Meta:
        ordering = ['-created_at']
        constraints = [
            models.UniqueConstraint(
                fields=['tenant', 'branch', 'provider'],
                condition=models.Q(is_active=True),
                name='uniq_active_fiscal_emitter_provider_branch',
            ),
        ]

    def __str__(self):
        return f'{self.cpf_cnpj} [{self.branch.name}]'


class FiscalProductConfig(TenantScopedModel, TimeStampedModel):
    product = models.ForeignKey(
        'catalog.Product',
        on_delete=models.PROTECT,
        related_name='fiscal_configs',
    )
    cst_icms = models.CharField(max_length=4, blank=True, default='')
    cst_pis = models.CharField(max_length=4, blank=True, default='')
    cst_cofins = models.CharField(max_length=4, blank=True, default='')
    aliquota_icms = models.DecimalField(
        max_digits=5,
        decimal_places=2,
        null=True,
        blank=True,
    )
    origem = models.CharField(max_length=1, blank=True, default='0')
    is_active = models.BooleanField(default=True)

    objects = TenantManager()
    all_objects = models.Manager()

    class Meta:
        ordering = ['-created_at']
        verbose_name_plural = 'fiscal product configs'
        constraints = [
            models.UniqueConstraint(
                fields=['tenant', 'product'],
                condition=models.Q(is_active=True),
                name='uniq_active_fiscal_product_config',
            ),
        ]

    def __str__(self):
        return f'{self.product.sku}'


class FiscalDocument(TenantScopedModel, TimeStampedModel):
    STATUS_PENDING = 'PENDING'
    STATUS_QUEUED = 'QUEUED'
    STATUS_PROCESSING = 'PROCESSING'
    STATUS_CONCLUDED = 'CONCLUDED'
    STATUS_REJECTED = 'REJECTED'
    STATUS_CANCELLED = 'CANCELLED'
    STATUS_FAILED = 'FAILED'

    STATUS_CHOICES = [
        (STATUS_PENDING, 'Pendente'),
        (STATUS_QUEUED, 'Na fila'),
        (STATUS_PROCESSING, 'Processando'),
        (STATUS_CONCLUDED, 'Concluído'),
        (STATUS_REJECTED, 'Rejeitado'),
        (STATUS_CANCELLED, 'Cancelado'),
        (STATUS_FAILED, 'Falha técnica'),
    ]

    DIRECTION_OUTPUT = 'OUTPUT'
    DIRECTION_INPUT = 'INPUT'

    DIRECTION_CHOICES = [
        (DIRECTION_OUTPUT, 'Saída'),
        (DIRECTION_INPUT, 'Entrada'),
    ]

    direction = models.CharField(
        max_length=10,
        choices=DIRECTION_CHOICES,
        default=DIRECTION_OUTPUT,
    )
    sale = models.ForeignKey(
        'sales.Sale',
        on_delete=models.PROTECT,
        related_name='fiscal_documents',
        null=True,
        blank=True,
    )
    purchase_order = models.ForeignKey(
        'purchasing.PurchaseOrder',
        on_delete=models.PROTECT,
        related_name='fiscal_documents',
        null=True,
        blank=True,
    )
    receipt = models.ForeignKey(
        'purchasing.PurchaseReceipt',
        on_delete=models.PROTECT,
        related_name='fiscal_documents',
        null=True,
        blank=True,
    )
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default=STATUS_PENDING)
    attempt_number = models.PositiveIntegerField(default=1)
    is_active = models.BooleanField(default=True)
    provider_document_id = models.CharField(max_length=100, blank=True, default='')
    cfop = models.CharField(max_length=4, default='5102')
    idempotency_key = models.UUIDField(default=uuid.uuid4)
    xml_key = models.CharField(max_length=255, blank=True, default='')
    protocol = models.CharField(max_length=60, blank=True, default='')
    pdf_key = models.CharField(max_length=255, blank=True, default='')
    error_detail = models.TextField(blank=True, default='')
    retry_count = models.PositiveIntegerField(default=0)
    last_polled_at = models.DateTimeField(null=True, blank=True)
    webhook_received_at = models.DateTimeField(null=True, blank=True)

    objects = TenantManager()
    all_objects = models.Manager()

    class Meta:
        ordering = ['-created_at']
        constraints = [
            models.UniqueConstraint(
                fields=['sale'],
                condition=models.Q(is_active=True),
                name='unique_active_fiscal_document_per_sale',
            ),
            models.UniqueConstraint(
                fields=['tenant', 'sale', 'attempt_number'],
                name='unique_attempt_per_sale',
            ),
        ]

    def __str__(self):
        ref = self.sale_id or self.purchase_order_id or self.receipt_id
        return f'{ref} attempt {self.attempt_number} [{self.status}]'
