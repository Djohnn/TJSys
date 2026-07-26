from datetime import timedelta
from importlib import import_module

from django.conf import settings
from django.db import transaction
from django.utils import timezone

from fiscal.adapters.plugnotas import PlugNotasAdapter
from fiscal.models import FiscalDocument, FiscalEmitter, FiscalProductConfig

MAX_AUTO_REATTEMPTS = 2
POLLING_INTERVAL = timedelta(seconds=15)
POLLING_TIMEOUT = timedelta(minutes=30)


def _import_string(path):
    module_path, class_name = path.rsplit('.', 1)
    return getattr(import_module(module_path), class_name)


def _resolve_provider(provider_name: str):
    providers = getattr(settings, 'FISCAL_PROVIDERS', {})
    config = providers.get(provider_name, {})
    klass = config.get('class', PlugNotasAdapter)
    if isinstance(klass, str):
        klass = _import_string(klass)
    return klass(api_key=config.get('api_key', ''))


def resolve_emitter(branch):
    from django.db import connection

    with connection.cursor() as c:
        c.execute(
            'SELECT id, tenant_id, branch_id, provider, cpf_cnpj, ie, registered_at_provider, '
            'registration_source, created_at, updated_at '
            'FROM fiscal_fiscalemitter WHERE branch_id=%s AND registered_at_provider=true LIMIT 1',
            [str(branch.id)],
        )
        row = c.fetchone()
    if not row:
        return None
    return FiscalEmitter(
        id=row[0],
        tenant_id=row[1],
        branch_id=row[2],
        provider=row[3],
        cpf_cnpj=row[4],
        ie=row[5],
        registered_at_provider=row[6],
        registration_source=row[7],
        created_at=row[8],
        updated_at=row[9],
    )


def resolve_product_config(product):
    from django.db import connection

    with connection.cursor() as c:
        c.execute(
            'SELECT id, tenant_id, product_id, cst_icms, cst_pis, cst_cofins, '
            'aliquota_icms, origem, created_at, updated_at '
            'FROM fiscal_fiscalproductconfig WHERE product_id=%s LIMIT 1',
            [str(product.id)],
        )
        row = c.fetchone()
    if not row:
        return None
    return FiscalProductConfig(
        id=row[0],
        tenant_id=row[1],
        product_id=row[2],
        cst_icms=row[3],
        cst_pis=row[4],
        cst_cofins=row[5],
        aliquota_icms=row[6],
        origem=row[7],
        created_at=row[8],
        updated_at=row[9],
    )


def build_item_dict(item):
    product = item.product
    config = resolve_product_config(product)
    return {
        'product': product,
        'quantity': item.quantity,
        'unit_price': item.unit_price,
        'line_total': item.line_total,
        'ncm': product.ncm,
        'unidade': item.unit.symbol if item.unit_id else 'UN',
        'origem': config.origem if config else '0',
        'cst_icms': config.cst_icms if config and config.cst_icms else '00',
        'cst_pis': config.cst_pis if config and config.cst_pis else '99',
        'cst_cofins': config.cst_cofins if config and config.cst_cofins else '07',
        'aliquota_icms': config.aliquota_icms if config and config.aliquota_icms else 0,
    }


def build_payment_dict(payment):
    return {
        'method': payment.method,
        'amount': payment.amount,
    }


def build_recipient_dict(person):
    if person is None:
        return None
    from people.models import PersonAddress, PersonDocument

    document = PersonDocument.all_objects.filter(
        person=person,
        is_active=True,
        document_type__in=['CPF', 'CNPJ'],
    ).first()
    address = (
        PersonAddress.all_objects.filter(
            person=person,
            is_active=True,
            address_type='fiscal',
        )
        .order_by('-is_primary', 'created_at')
        .first()
    )
    return {
        'name': person.name,
        'cpf_cnpj': document.value if document else '',
        'address': (
            {
                'street': address.street,
                'number': address.number,
                'city': address.city,
                'state': address.state,
                'postal_code': address.postal_code,
                'country': address.country,
            }
            if address
            else None
        ),
    }


# ── Sprint 12 — Purchasing fiscal reconciliation ──────────────


ENTRY_CFOPS = {'1102', '2102', '1202', '2202', '1403', '2403'}


def _get_cfop_for_operation(tipo_movimento: str = 'interna') -> str:
    return '1102' if tipo_movimento == 'interna' else '2102'


class FiscalValidationIssue:
    def __init__(self, field: str, message: str, severity: str = 'error'):
        self.field = field
        self.message = message
        self.severity = severity

    def as_dict(self):
        return {'field': self.field, 'message': self.message, 'severity': self.severity}


def validate_fiscal_config_for_receipt(receipt):
    issues: list[FiscalValidationIssue] = []

    po = receipt.purchase_order
    supplier = po.supplier
    branch = po.branch

    emitter = resolve_emitter(branch)
    if emitter is None:
        issues.append(
            FiscalValidationIssue(
                'emitter',
                'Nenhum emitente fiscal configurado para esta filial.',
            )
        )
    elif not emitter.registered_at_provider:
        issues.append(
            FiscalValidationIssue(
                'emitter',
                'Emitente fiscal não registrado no provedor.',
                severity='warning',
            )
        )

    if not supplier.cnpj:
        issues.append(
            FiscalValidationIssue(
                'supplier',
                'Fornecedor sem CNPJ cadastrado.',
            )
        )

    items = receipt.items.select_related(
        'purchase_order_item__product',
    ).all()

    for item in items:
        product = item.purchase_order_item.product
        config = resolve_product_config(product)
        if config is None:
            issues.append(
                FiscalValidationIssue(
                    f'item.{product.sku}',
                    f'Produto {product.sku} sem configuração fiscal (CST/ICMS).',
                    severity='warning',
                )
            )
        elif not config.cst_icms:
            issues.append(
                FiscalValidationIssue(
                    f'item.{product.sku}',
                    f'Produto {product.sku} sem CST ICMS.',
                )
            )
        if not product.ncm:
            issues.append(
                FiscalValidationIssue(
                    f'item.{product.sku}',
                    f'Produto {product.sku} sem NCM cadastrado.',
                )
            )

    return issues


@transaction.atomic
def reconcile_receipt_fiscal(receipt, tenant, cfop=None):
    issues = validate_fiscal_config_for_receipt(receipt)
    errors = [i for i in issues if i.severity == 'error']
    if errors:
        return {
            'document': None,
            'issues': [e.as_dict() for e in errors],
            'warnings': [i.as_dict() for i in issues if i.severity == 'warning'],
        }

    existing = FiscalDocument.all_objects.filter(
        receipt=receipt,
        is_active=True,
    ).first()
    if existing:
        return {
            'document': existing,
            'issues': [],
            'warnings': [],
        }

    effective_cfop = cfop or _get_cfop_for_operation()
    doc = FiscalDocument.all_objects.create(
        tenant=tenant,
        direction=FiscalDocument.DIRECTION_INPUT,
        purchase_order=receipt.purchase_order,
        receipt=receipt,
        cfop=effective_cfop,
        status=FiscalDocument.STATUS_CONCLUDED,
    )

    return {
        'document': doc,
        'issues': [],
        'warnings': [i.as_dict() for i in issues if i.severity == 'warning'],
    }


@transaction.atomic
def emit_nfce(sale, tenant):
    existing = FiscalDocument.all_objects.filter(sale=sale, is_active=True).first()
    if existing:
        return existing

    doc = FiscalDocument.all_objects.create(
        tenant=tenant,
        sale=sale,
        status=FiscalDocument.STATUS_PENDING,
    )
    return emit_document(doc)


@transaction.atomic
def emit_document(doc):
    emitter = resolve_emitter(doc.sale.branch)
    if emitter is None:
        doc.status = FiscalDocument.STATUS_FAILED
        doc.error_detail = 'Emitente fiscal não configurado para esta filial'
        doc.save(update_fields=['status', 'error_detail', 'updated_at'])
        return doc

    items = [build_item_dict(item) for item in doc.sale.items.select_related('product', 'unit')]
    missing_ncm = [item['product'].sku for item in items if not item['ncm']]
    if missing_ncm:
        doc.status = FiscalDocument.STATUS_FAILED
        doc.error_detail = f'Produtos sem NCM: {", ".join(missing_ncm)}'
        doc.save(update_fields=['status', 'error_detail', 'updated_at'])
        return doc

    payments = [build_payment_dict(payment) for payment in doc.sale.payments.all()]
    provider = _resolve_provider(emitter.provider)
    doc.recipient = build_recipient_dict(doc.sale.customer)

    try:
        result = provider.emit(doc.tenant, emitter, doc, items, payments)
    except Exception as exc:
        doc.status = FiscalDocument.STATUS_FAILED
        doc.error_detail = str(exc)[:2000]
        doc.retry_count += 1
        doc.save(update_fields=['status', 'error_detail', 'retry_count', 'updated_at'])
        return doc

    doc.status = FiscalDocument.STATUS_PROCESSING
    doc.provider_document_id = result.provider_document_id
    doc.save(update_fields=['status', 'provider_document_id', 'updated_at'])
    return doc


@transaction.atomic
def _resolve_branch(doc):
    if doc.sale_id:
        return doc.sale.branch
    if doc.purchase_order_id:
        return doc.purchase_order.branch
    if doc.receipt_id:
        return doc.receipt.purchase_order.branch
    return None


def poll_fiscal_document(doc):
    doc = FiscalDocument.all_objects.select_for_update().get(pk=doc.pk)
    now = timezone.now()
    if doc.created_at and now - doc.created_at > POLLING_TIMEOUT:
        doc.status = FiscalDocument.STATUS_FAILED
        doc.error_detail = 'Timeout aguardando confirmação do provedor'
        doc.save(update_fields=['status', 'error_detail', 'updated_at'])
        return doc

    if not doc.provider_document_id:
        doc.status = FiscalDocument.STATUS_FAILED
        doc.error_detail = 'Documento fiscal sem ID do provedor'
        doc.save(update_fields=['status', 'error_detail', 'updated_at'])
        return doc

    emitter = resolve_emitter(_resolve_branch(doc))
    if emitter is None:
        doc.status = FiscalDocument.STATUS_FAILED
        doc.error_detail = 'Emitente fiscal não configurado para consulta'
        doc.save(update_fields=['status', 'error_detail', 'updated_at'])
        return doc

    try:
        result = _resolve_provider(emitter.provider).query(doc.tenant, doc.provider_document_id)
    except Exception as exc:
        doc.retry_count += 1
        doc.error_detail = str(exc)[:2000]
        doc.save(update_fields=['retry_count', 'error_detail', 'updated_at'])
        return doc

    return apply_provider_query_result(doc, result)


def apply_provider_query_result(doc, result):
    if result.status == 'CONCLUIDO':
        doc.status = FiscalDocument.STATUS_CONCLUDED
        doc.protocol = result.protocol or ''
        doc.xml_key = result.xml_url or ''
        doc.pdf_key = result.pdf_url or ''
        doc.last_polled_at = timezone.now()
        doc.save(
            update_fields=[
                'status',
                'protocol',
                'xml_key',
                'pdf_key',
                'last_polled_at',
                'updated_at',
            ]
        )
        return doc

    if result.status == 'REJEITADO':
        doc.status = FiscalDocument.STATUS_REJECTED
        doc.is_active = False
        doc.error_detail = result.error_reason or ''
        doc.last_polled_at = timezone.now()
        doc.save(
            update_fields=[
                'status',
                'is_active',
                'error_detail',
                'last_polled_at',
                'updated_at',
            ]
        )
        if doc.attempt_number < MAX_AUTO_REATTEMPTS:
            FiscalDocument.all_objects.create(
                tenant=doc.tenant,
                sale=doc.sale,
                status=FiscalDocument.STATUS_PENDING,
                attempt_number=doc.attempt_number + 1,
            )
        return doc

    if result.status == 'CANCELADO':
        doc.status = FiscalDocument.STATUS_CANCELLED
        doc.is_active = False
        doc.error_detail = result.error_reason or ''
        doc.last_polled_at = timezone.now()
        doc.save(
            update_fields=[
                'status',
                'is_active',
                'error_detail',
                'last_polled_at',
                'updated_at',
            ]
        )
        return doc

    doc.last_polled_at = timezone.now()
    doc.save(update_fields=['last_polled_at', 'updated_at'])
    return doc
