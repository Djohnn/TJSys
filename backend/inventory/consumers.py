import logging

from django.db import connection

from outbox.handlers import register_handler
from tenancy.context import reset_current_tenant_id, set_current_tenant_id

logger = logging.getLogger(__name__)


@register_handler('sales.sale.confirmed')
def handle_sale_confirmed_for_kit_decomposition(message):
    sale_id = message.payload.get('sale_id') or message.aggregate_id
    tenant_id = message.tenant_id

    from sales.models import Sale
    from tenancy.models import Tenant

    tenant = Tenant.objects.get(id=tenant_id)
    sale = Sale.all_objects.prefetch_related('items__product').get(id=sale_id)

    token = set_current_tenant_id(tenant.id)
    try:
        with connection.cursor() as cursor:
            cursor.execute('SET app.current_tenant_id = %s', [str(tenant.id)])

        from inventory.kit_decomposition import decompose_kit_sale
        from inventory.models import StockLocation

        location = StockLocation.all_objects.filter(
            tenant=tenant,
            branch=sale.branch,
            is_primary=True,
        ).first()

        results = []
        for item in sale.items.all():
            if item.product.product_kind == 'kit':
                movements = decompose_kit_sale(
                    tenant=tenant,
                    sale=sale,
                    kit_product=item.product,
                    kit_quantity=item.quantity,
                    sale_event_id=str(message.id),
                    location=location,
                )
                results.append(
                    {
                        'item_id': str(item.id),
                        'kit_sku': item.product.sku,
                        'movements_created': len(movements),
                    }
                )

        return {'sale_id': sale_id, 'decompositions': results}
    finally:
        reset_current_tenant_id(token)
