from django.db.models import Q
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView


class GlobalSearchView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        query = request.query_params.get('q', '').strip()
        limit = min(int(request.query_params.get('limit', 10)), 50)

        if len(query) < 2:
            return Response({'results': []})

        tenant_id = request.headers.get('X-Tenant-ID')
        if not tenant_id:
            return Response({'results': []})

        results = []

        # Search products
        results.extend(self._search_products(query, tenant_id, limit))

        # Search categories
        results.extend(self._search_categories(query, tenant_id, limit))

        # Search brands
        results.extend(self._search_brands(query, tenant_id, limit))

        # Search people
        results.extend(self._search_people(query, tenant_id, limit))

        # Search suppliers
        results.extend(self._search_suppliers(query, tenant_id, limit))

        # Sort by relevance (name match first, then label match)
        results.sort(
            key=lambda x: (
                not x['label'].lower().startswith(query.lower()),
                x['label'].lower(),
            )
        )

        return Response({'results': results[:limit]})

    def _search_products(self, query, tenant_id, limit):
        try:
            from catalog.models import Product

            products = Product.objects.filter(
                tenant_id=tenant_id,
                is_active=True,
            ).filter(
                Q(name__icontains=query)
                | Q(sku__icontains=query)
                | Q(barcode__icontains=query)
                | Q(description__icontains=query)
            )[:limit]

            return [
                {
                    'type': 'product',
                    'id': str(p.id),
                    'label': p.name,
                    'subtitle': f'SKU: {p.sku}',
                    'route': f'/catalog/products/{p.id}/edit',
                    'icon': 'catalog',
                }
                for p in products
            ]
        except Exception:
            return []

    def _search_categories(self, query, tenant_id, limit):
        try:
            from catalog.models import Category

            categories = Category.objects.filter(
                tenant_id=tenant_id,
            ).filter(Q(name__icontains=query) | Q(code__icontains=query))[:limit]

            return [
                {
                    'type': 'category',
                    'id': str(c.id),
                    'label': c.name,
                    'subtitle': f'Código: {c.code}' if c.code else 'Categoria',
                    'route': '/catalog/categories',
                    'icon': 'catalog',
                }
                for c in categories
            ]
        except Exception:
            return []

    def _search_brands(self, query, tenant_id, limit):
        try:
            from catalog.models import Brand

            brands = Brand.objects.filter(
                tenant_id=tenant_id,
            ).filter(Q(name__icontains=query))[:limit]

            return [
                {
                    'type': 'brand',
                    'id': str(b.id),
                    'label': b.name,
                    'subtitle': 'Marca',
                    'route': '/catalog/brands',
                    'icon': 'catalog',
                }
                for b in brands
            ]
        except Exception:
            return []

    def _search_people(self, query, tenant_id, limit):
        try:
            from people.models import Person

            people = Person.objects.filter(
                tenant_id=tenant_id,
            ).filter(
                Q(name__icontains=query) | Q(document__icontains=query) | Q(email__icontains=query)
            )[:limit]

            return [
                {
                    'type': 'person',
                    'id': str(p.id),
                    'label': p.name,
                    'subtitle': f'Documento: {p.document}' if p.document else 'Pessoa',
                    'route': f'/people/{p.id}',
                    'icon': 'admin',
                }
                for p in people
            ]
        except Exception:
            return []

    def _search_suppliers(self, query, tenant_id, limit):
        try:
            from purchasing.models import Supplier

            suppliers = Supplier.objects.filter(
                tenant_id=tenant_id,
            ).filter(Q(name__icontains=query) | Q(document__icontains=query))[:limit]

            return [
                {
                    'type': 'supplier',
                    'id': str(s.id),
                    'label': s.name,
                    'subtitle': f'Documento: {s.document}' if s.document else 'Fornecedor',
                    'route': '/purchasing/suppliers',
                    'icon': 'purchasing',
                }
                for s in suppliers
            ]
        except Exception:
            return []
