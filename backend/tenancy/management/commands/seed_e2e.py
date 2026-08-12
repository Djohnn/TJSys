import hashlib
import uuid
from decimal import Decimal

from decouple import config
from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand
from django.db import connection, transaction
from django.utils import timezone

from catalog.models import Category, Product, ProductPrice, Unit
from inventory.models import StockLocation
from inventory.services import create_receipt
from tenancy.context import reset_current_tenant_id, set_current_tenant_id
from tenancy.models import Branch, Company, Device, Tenant

User = get_user_model()

E2E_API_KEY = 'e2e-test-key-2026'
E2E_PASSWORD = 'e2e-test-pwd-2026'  # noqa: S105


class Command(BaseCommand):
    help = 'Cria dados de teste E2E para o PDV (dispositivo, produto, local de estoque).'

    def handle(self, *args, **options):
        password = config('SEED_ADMIN_PASSWORD', default=E2E_PASSWORD)

        admin_user, created = User.objects.get_or_create(email='e2e@tjsys.local')
        if created:
            admin_user.is_staff = True
            admin_user.is_superuser = True
        admin_user.set_password(password)
        admin_user.email_verified_at = timezone.now()
        admin_user.save()

        tenant, _ = Tenant.objects.get_or_create(slug='e2e', defaults={'name': 'E2E Test'})
        token = set_current_tenant_id(tenant.id)
        try:
            with transaction.atomic():
                with connection.cursor() as cursor:
                    cursor.execute(
                        "SELECT set_config('app.current_tenant_id', %s, false)",
                        [str(tenant.id)],
                    )

                from tenancy.models import TenantMembership

                TenantMembership.objects.get_or_create(
                    user=admin_user,
                    tenant=tenant,
                    defaults={'role': 'operator', 'is_active': True},
                )
                TenantMembership.objects.filter(
                    user=admin_user,
                    tenant=tenant,
                ).update(role='admin', is_active=True)

                company, _ = Company.objects.get_or_create(
                    tenant=tenant,
                    name='E2E Company',
                    defaults={'is_active': True},
                )
                branch, _ = Branch.objects.get_or_create(
                    company=company,
                    tenant=tenant,
                    name='E2E Branch',
                )

                key_hash = hashlib.sha256(E2E_API_KEY.encode()).hexdigest()
                device, _ = Device.objects.get_or_create(
                    tenant=tenant,
                    device_id='e2e-device-001',
                    defaults={
                        'name': 'E2E Test Device',
                        'key_hash': key_hash,
                        'branch': branch,
                        'platform': 'e2e',
                        'app_version': '0.1.0',
                        'status': 'active',
                        'registered_by': admin_user,
                    },
                )
                device.name = 'E2E Test Device'
                device.key_hash = key_hash
                device.branch = branch
                device.platform = 'e2e'
                device.app_version = '0.1.0'
                device.status = 'active'
                device.registered_by = admin_user
                device.save(
                    update_fields=[
                        'name',
                        'key_hash',
                        'branch',
                        'platform',
                        'app_version',
                        'status',
                        'registered_by',
                        'updated_at',
                    ]
                )

                unit, _ = Unit.objects.get_or_create(
                    tenant=tenant,
                    symbol='UN',
                    defaults={'name': 'Unidade', 'precision': 0},
                )

                cat, _ = Category.objects.get_or_create(
                    tenant=tenant,
                    name='E2E Category',
                )

                product, _ = Product.objects.get_or_create(
                    tenant=tenant,
                    sku='E2E-PROD-001',
                    defaults={
                        'name': 'Produto E2E',
                        'base_unit': unit,
                        'category': cat,
                        'ncm': '84713000',
                        'is_active': True,
                    },
                )
                product.name = 'Produto E2E'
                product.base_unit = unit
                product.category = cat
                product.ncm = '84713000'
                product.is_active = True
                product.save(
                    update_fields=[
                        'name',
                        'base_unit',
                        'category',
                        'ncm',
                        'is_active',
                        'updated_at',
                    ]
                )

                ProductPrice.objects.update_or_create(
                    tenant=tenant,
                    product=product,
                    valid_from='2026-01-01T00:00:00Z',
                    defaults={
                        'amount': 49.90,
                        'is_active': True,
                    },
                )

                location, _ = StockLocation.objects.get_or_create(
                    tenant=tenant,
                    branch=branch,
                    code='E2E-LOCAL',
                    defaults={
                        'name': 'Local E2E',
                        'location_type': 'general',
                        'is_primary': True,
                    },
                )

                create_receipt(
                    tenant,
                    branch,
                    product,
                    location,
                    Decimal('5'),
                    unit,
                    Decimal('1'),
                    idempotency_key='e2e-stock-seed',
                    actor=admin_user,
                    reason='seed e2e stock',
                )

                with connection.cursor() as c:
                    c.execute(
                        'INSERT INTO fiscal_fiscalemitter '
                        '(id, tenant_id, branch_id, provider, cpf_cnpj, ie, '
                        'registered_at_provider, registration_source, is_active, created_at, updated_at) '
                        "SELECT %s, %s, %s, 'plugnotas', '00000000000000', "
                        "'111111111111', true, 'manual', true, NOW(), NOW() "
                        'WHERE NOT EXISTS ('
                        'SELECT 1 FROM fiscal_fiscalemitter '
                        "WHERE tenant_id=%s AND branch_id=%s AND provider='plugnotas'"
                        ')',
                        [
                            str(uuid.uuid4()),
                            str(tenant.id),
                            str(branch.id),
                            str(tenant.id),
                            str(branch.id),
                        ],
                    )

            # ── Sale + fiscal + payment E2E seed data ────────────────────────
            token_sale = set_current_tenant_id(tenant.id)
            try:
                with connection.cursor() as cursor:
                    cursor.execute(
                        "SELECT set_config('app.current_tenant_id', %s, false)",
                        [str(tenant.id)],
                    )

                from sales.services import create_counter_sale, open_cash_session

                open_cash_session(
                    tenant=tenant,
                    branch=branch,
                    operator=admin_user,
                    opening_amount=Decimal('100.00'),
                    idempotency_key='e2e-cash-seed',
                )
                e2e_sale = create_counter_sale(
                    tenant=tenant,
                    branch=branch,
                    operator=admin_user,
                    stock_location=location,
                    items=[
                        {
                            'product': product,
                            'unit': unit,
                            'quantity': Decimal('1'),
                            'factor': Decimal('1'),
                        }
                    ],
                    payments=[{'method': 'cash', 'amount': Decimal('49.90')}],
                    idempotency_key='e2e-sale-seed',
                )

                from fiscal.models import FiscalDocument, FiscalProductConfig

                FiscalDocument.all_objects.update_or_create(
                    tenant=tenant,
                    sale=e2e_sale,
                    attempt_number=1,
                    defaults={
                        'direction': FiscalDocument.DIRECTION_OUTPUT,
                        'status': FiscalDocument.STATUS_CONCLUDED,
                        'protocol': 'e2e-proto',
                        'xml_key': 's3://e2e/key.xml',
                        'pdf_key': 's3://e2e/key.pdf',
                        'is_active': True,
                    },
                )
                FiscalProductConfig.all_objects.update_or_create(
                    tenant=tenant,
                    product=product,
                    defaults={
                        'cst_icms': '000',
                        'aliquota_icms': Decimal('18.00'),
                        'is_active': True,
                    },
                )

                from payments.models import (
                    PaymentIntent,
                    PaymentProviderConfig,
                    PaymentReconciliationBatch,
                    PaymentReconciliationItem,
                    PaymentTransaction,
                )

                ppc, _ = PaymentProviderConfig.all_objects.update_or_create(
                    tenant=tenant,
                    provider='stripe',
                    is_active=True,
                    defaults={
                        'secret': 'sk_e2e_secret',  # noqa: S106 - credencial falsa do seed
                    },
                )
                pi, _ = PaymentIntent.all_objects.update_or_create(
                    tenant=tenant,
                    idempotency_key='e2e-intent',
                    defaults={
                        'provider_config': ppc,
                        'sale': e2e_sale,
                        'amount': Decimal('49.90'),
                        'currency': 'BRL',
                        'status': 'captured',
                        'provider_reference': 'pi_e2e',
                    },
                )
                txn, _ = PaymentTransaction.all_objects.update_or_create(
                    tenant=tenant,
                    provider_reference='ch_e2e',
                    defaults={
                        'intent': pi,
                        'transaction_type': 'capture',
                        'status': 'succeeded',
                        'gross_amount': Decimal('49.90'),
                        'fee_amount': Decimal('1.00'),
                        'net_amount': Decimal('48.90'),
                    },
                )
                existing_item = PaymentReconciliationItem.all_objects.filter(
                    tenant=tenant,
                    provider_reference='ch_e2e',
                ).first()
                batch = (
                    existing_item.batch
                    if existing_item
                    else PaymentReconciliationBatch.all_objects.create(
                        tenant=tenant,
                        provider='stripe',
                        status='draft',
                    )
                )
                PaymentReconciliationItem.all_objects.update_or_create(
                    tenant=tenant,
                    batch=batch,
                    provider_reference='ch_e2e',
                    defaults={
                        'transaction': txn,
                        'gross_amount': Decimal('49.90'),
                        'fee_amount': Decimal('1.00'),
                        'settled_amount': Decimal('48.90'),
                        'status': 'matched',
                    },
                )

                from people.models import Person, PersonDocument, PersonRole

                person, _ = Person.all_objects.update_or_create(
                    tenant=tenant,
                    name='João Cliente E2E',
                    defaults={'person_type': 'PF', 'is_active': True},
                )
                PersonRole.all_objects.update_or_create(
                    tenant=tenant,
                    person=person,
                    role='customer',
                )
                PersonDocument.all_objects.update_or_create(
                    tenant=tenant,
                    person=person,
                    document_type='CPF',
                    value='12345678909',
                    defaults={'is_active': True},
                )

                from purchasing.models import PurchaseOrder, Supplier

                supplier, _ = Supplier.all_objects.update_or_create(
                    tenant=tenant,
                    name='Fornecedor E2E',
                    defaults={'email': 'fornecedor-e2e@example.test'},
                )
                PurchaseOrder.all_objects.update_or_create(
                    tenant=tenant,
                    idempotency_key='e2e-purchase-order-seed',
                    defaults={
                        'supplier': supplier,
                        'branch': branch,
                        'status': 'draft',
                        'notes': 'Ordem criada pelo seed E2E',
                        'items_total': Decimal('49.90'),
                    },
                )
            finally:
                reset_current_tenant_id(token_sale)

            # ── Web admin (multi-tenant, sem PDV) ──────────────────────────────
            web_admin, created = User.objects.get_or_create(email='web-admin@tjsys.local')
            if created:
                web_admin.is_staff = True
            web_admin.set_password(password)
            web_admin.email_verified_at = timezone.now()
            web_admin.save()

            # Set up TOTP MFA device + recovery codes for web-admin
            from accounts.models import MFADevice, RecoveryCode
            from accounts.security import digest_value
            from accounts.services.mfa import regenerate_recovery_codes

            totp_device, _ = MFADevice.objects.get_or_create(
                user=web_admin,
                tenant=tenant,
                method='totp',
            )
            totp_device.verified_at = timezone.now()
            totp_device.save(update_fields=['verified_at'])
            regenerate_recovery_codes(device=totp_device)
            RecoveryCode.objects.update_or_create(
                device=totp_device,
                digest=digest_value('e2e0000001'),
                defaults={'consumed_at': None},
            )

            # Also set up for e2e admin
            from accounts.services.mfa import regenerate_recovery_codes as _rrc

            admin_totp, _ = MFADevice.objects.get_or_create(
                user=admin_user,
                tenant=tenant,
                method='totp',
            )
            admin_totp.verified_at = timezone.now()
            admin_totp.save(update_fields=['verified_at'])
            _rrc(device=admin_totp)

            for tid in (tenant.id,):
                TenantMembership.objects.get_or_create(
                    user=web_admin,
                    tenant_id=tid,
                    defaults={'role': 'admin', 'is_active': True},
                )
                TenantMembership.objects.filter(
                    user=web_admin,
                    tenant_id=tid,
                ).update(role='admin', is_active=True)

            for email, role in (
                ('operator@tjsys.local', 'operator'),
                ('mfa@tjsys.local', 'admin'),
            ):
                e2e_user, _ = User.objects.get_or_create(email=email)
                e2e_user.set_password(password)
                e2e_user.email_verified_at = timezone.now()
                e2e_user.save()
                TenantMembership.objects.update_or_create(
                    user=e2e_user,
                    tenant=tenant,
                    defaults={'role': role, 'is_active': True},
                )

            # ── Segundo tenant e2e-beta ───────────────────────────────────────
            beta_tenant, _ = Tenant.objects.get_or_create(
                slug='e2e-beta',
                defaults={'name': 'E2E Beta'},
            )
            _token2 = set_current_tenant_id(beta_tenant.id)
            with transaction.atomic():
                with connection.cursor() as cursor:
                    cursor.execute(
                        "SELECT set_config('app.current_tenant_id', %s, false)",
                        [str(beta_tenant.id)],
                    )

                TenantMembership.objects.get_or_create(
                    user=web_admin,
                    tenant=beta_tenant,
                    defaults={'role': 'admin', 'is_active': True},
                )
                TenantMembership.objects.filter(
                    user=web_admin,
                    tenant=beta_tenant,
                ).update(role='admin', is_active=True)

                beta_company, _ = Company.objects.get_or_create(
                    tenant=beta_tenant,
                    name='E2E Beta Company',
                    defaults={'is_active': True},
                )
                Branch.objects.get_or_create(
                    company=beta_company,
                    tenant=beta_tenant,
                    name='E2E Beta Branch',
                )
            reset_current_tenant_id(_token2)

            self.stdout.write(
                self.style.SUCCESS(
                    f'Dados E2E criados:\n'
                    f'  Tenant: {tenant.slug}, Branch: {branch.id}\n'
                    f'  Tenant: {beta_tenant.slug}\n'
                    f'  Device: {device.id} (API key: {E2E_API_KEY})\n'
                    f'  Produto: {product.sku} (R$ 49,90)\n'
                    f'  Local estoque: {location.code}\n'
                    '  Web admin: web-admin@tjsys.local '
                    f'(membro de {tenant.slug} e {beta_tenant.slug})'
                )
            )
        finally:
            reset_current_tenant_id(token)
