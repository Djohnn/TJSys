from decimal import Decimal

import pytest
from django.core.exceptions import ValidationError
from django.db import IntegrityError

from sales.models import Sale, SaleCancellation, SaleItem, SaleRefund, SaleReturn, SaleReturnItem
from tenancy.models import Tenant


def _get_first_sale(ctx):
    return Sale.all_objects.filter(tenant=ctx['tenant']).first()


@pytest.mark.django_db
class TestSaleReturnModel:
    def test_create_sale_return_minimal_fields(self, sale_context):
        ctx = sale_context
        sale = _get_first_sale(ctx)
        sale_return = SaleReturn.all_objects.create(
            tenant=ctx['tenant'],
            sale=sale,
            reason='Cliente desistiu',
        )
        assert sale_return.status == 'draft'
        assert sale_return.sale == sale
        assert sale_return.reason == 'Cliente desistiu'
        assert sale_return.tenant == ctx['tenant']

    def test_sale_return_default_status_is_draft(self, sale_context):
        ctx = sale_context
        sale = _get_first_sale(ctx)
        sale_return = SaleReturn.all_objects.create(
            tenant=ctx['tenant'],
            sale=sale,
            reason='Teste',
        )
        assert sale_return.status == 'draft'

    def test_sale_return_status_choices(self, sale_context):
        ctx = sale_context
        sale = _get_first_sale(ctx)
        for status in ['draft', 'completed', 'cancelled']:
            sale_return = SaleReturn.all_objects.create(
                tenant=ctx['tenant'],
                sale=sale,
                reason='Teste',
                status=status,
            )
            assert sale_return.status == status

    def test_sale_return_clean_validates_tenant(self, sale_context):
        ctx = sale_context
        other_tenant = Tenant.objects.create(name='Other', slug='other')
        sale = _get_first_sale(ctx)
        sale_return = SaleReturn(tenant=other_tenant, sale=sale, reason='Cross-tenant')
        with pytest.raises(ValidationError):
            sale_return.full_clean()

    def test_sale_return_idempotency_unique(self, sale_context):
        ctx = sale_context
        sale = _get_first_sale(ctx)
        SaleReturn.all_objects.create(
            tenant=ctx['tenant'],
            sale=sale,
            reason='Primeira',
            idempotency_key='ret-unique-1',
        )
        with pytest.raises(IntegrityError):
            SaleReturn.all_objects.create(
                tenant=ctx['tenant'],
                sale=sale,
                reason='Duplicada',
                idempotency_key='ret-unique-1',
            )


@pytest.mark.django_db
class TestSaleReturnItemModel:
    def test_create_return_item(self, sale_context):
        ctx = sale_context
        sale = _get_first_sale(ctx)
        sale_item = SaleItem.all_objects.filter(sale=sale).first()
        sale_return = SaleReturn.all_objects.create(
            tenant=ctx['tenant'],
            sale=sale,
            reason='Teste',
        )
        item = SaleReturnItem.all_objects.create(
            tenant=ctx['tenant'],
            sale_return=sale_return,
            sale_item=sale_item,
            quantity=Decimal('1'),
        )
        assert item.quantity == Decimal('1')
        assert item.sale_return == sale_return
        assert item.sale_item == sale_item

    def test_return_item_quantity_must_be_positive(self, sale_context):
        ctx = sale_context
        sale = _get_first_sale(ctx)
        sale_item = SaleItem.all_objects.filter(sale=sale).first()
        sale_return = SaleReturn.all_objects.create(
            tenant=ctx['tenant'],
            sale=sale,
            reason='Teste',
        )
        with pytest.raises(ValidationError):
            item = SaleReturnItem(
                tenant=ctx['tenant'],
                sale_return=sale_return,
                sale_item=sale_item,
                quantity=Decimal('-1'),
            )
            item.full_clean()

    def test_return_item_quantity_cannot_be_zero(self, sale_context):
        ctx = sale_context
        sale = _get_first_sale(ctx)
        sale_item = SaleItem.all_objects.filter(sale=sale).first()
        sale_return = SaleReturn.all_objects.create(
            tenant=ctx['tenant'],
            sale=sale,
            reason='Teste',
        )
        with pytest.raises(ValidationError):
            item = SaleReturnItem(
                tenant=ctx['tenant'],
                sale_return=sale_return,
                sale_item=sale_item,
                quantity=Decimal('0'),
            )
            item.full_clean()


@pytest.mark.django_db
class TestSaleRefundModel:
    def test_refund_persists_reason(self, sale_context):
        # Given a confirmed sale in the tenant context.
        ctx = sale_context
        sale = _get_first_sale(ctx)
        refund = SaleRefund.all_objects.create(
            tenant=ctx['tenant'],
            sale=sale,
            method='cash',
            amount=Decimal('50.00'),
            reason='Produto avariado',
        )

        # When the persisted refund is loaded again.
        refund.refresh_from_db()

        # Then its reason is retained.
        assert refund.reason == 'Produto avariado'

    def test_create_cash_refund(self, sale_context):
        ctx = sale_context
        sale = _get_first_sale(ctx)
        refund = SaleRefund.all_objects.create(
            tenant=ctx['tenant'],
            sale=sale,
            method='cash',
            amount=Decimal('50.00'),
            reason='Devolução em dinheiro',
        )
        assert refund.method == 'cash'
        assert refund.amount == Decimal('50.00')
        assert refund.reason == 'Devolução em dinheiro'
        assert refund.status == 'pending'

    def test_refund_method_choices(self, sale_context):
        ctx = sale_context
        sale = _get_first_sale(ctx)
        for method in ['cash', 'pix', 'card_external']:
            refund = SaleRefund.all_objects.create(
                tenant=ctx['tenant'],
                sale=sale,
                method=method,
                amount=Decimal('10.00'),
                reason='Método de reembolso',
            )
            assert refund.method == method

    def test_refund_amount_must_be_positive(self, sale_context):
        ctx = sale_context
        sale = _get_first_sale(ctx)
        with pytest.raises(ValidationError):
            refund = SaleRefund(
                tenant=ctx['tenant'],
                sale=sale,
                method='cash',
                amount=Decimal('-10.00'),
                reason='Valor inválido',
            )
            refund.full_clean()

    def test_refund_amount_cannot_be_zero(self, sale_context):
        ctx = sale_context
        sale = _get_first_sale(ctx)
        with pytest.raises(ValidationError):
            refund = SaleRefund(
                tenant=ctx['tenant'],
                sale=sale,
                method='cash',
                amount=Decimal('0'),
                reason='Valor inválido',
            )
            refund.full_clean()


@pytest.mark.django_db
class TestSaleCancellationModel:
    def test_create_cancellation(self, sale_context):
        ctx = sale_context
        sale = _get_first_sale(ctx)
        cancellation = SaleCancellation.all_objects.create(
            tenant=ctx['tenant'],
            sale=sale,
            reason='Cancelamento total',
        )
        assert cancellation.sale == sale
        assert cancellation.reason == 'Cancelamento total'
        assert cancellation.status == 'draft'

    def test_cancellation_idempotency(self, sale_context):
        ctx = sale_context
        sale = _get_first_sale(ctx)
        SaleCancellation.all_objects.create(
            tenant=ctx['tenant'],
            sale=sale,
            reason='Cancelar',
            idempotency_key='cancel-unique-1',
        )
        with pytest.raises(IntegrityError):
            SaleCancellation.all_objects.create(
                tenant=ctx['tenant'],
                sale=sale,
                reason='Duplicado',
                idempotency_key='cancel-unique-1',
            )

    def test_cancellation_references_sale_status(self, sale_context):
        ctx = sale_context
        sale = _get_first_sale(ctx)
        cancellation = SaleCancellation.all_objects.create(
            tenant=ctx['tenant'],
            sale=sale,
            reason='Teste',
        )
        assert cancellation.sale.status == 'confirmed'
