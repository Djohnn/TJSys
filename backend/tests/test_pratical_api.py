"""Testes práticos de API — Given/When/Then BDD.

Verifica endpoints críticos do sistema: health, pagination, export CSV,
isolamento cross-tenant, autenticação e monitoring.
"""

import pytest
from django.contrib.auth import get_user_model
from django.db import connection

from tenancy.context import reset_current_tenant_id, set_current_tenant_id
from tenancy.models import Tenant, TenantMembership

User = get_user_model()


def _setup(client, email='practical@test.local', tenant_slug='practical'):
    user = User.objects.create_user(email=email, password='pass123')
    tenant = Tenant.objects.create(name='Practical Test', slug=tenant_slug)
    TenantMembership.objects.create(user=user, tenant=tenant, role='admin', is_active=True)
    client.force_login(user)
    session = client.session
    session['mfa_tenant_id'] = str(tenant.id)
    session['mfa_method'] = 'totp'
    session.save()
    token = set_current_tenant_id(tenant.id)
    with connection.cursor() as cursor:
        cursor.execute("SELECT set_config('app.current_tenant_id', %s, false)", [str(tenant.id)])
    reset_current_tenant_id(token)
    return user, tenant


class TestHealth:
    @pytest.mark.django_db
    def test_health_returns_200(self, client):
        """Given a running backend, when GET /api/v1/health/, then 200 with status."""
        response = client.get('/api/v1/health/')
        assert response.status_code == 200
        data = response.json()
        assert 'status' in data
        assert data['status'] in ('healthy', 'unhealthy')


class TestAuth:
    @pytest.mark.django_db
    def test_unauthorized_returns_401(self, client):
        """Given no auth, when access protected endpoint, then 401."""
        response = client.get('/api/v1/products/')
        assert response.status_code in (401, 403)


class TestPagination:
    @pytest.mark.django_db
    def test_paginated_format(self, client):
        """Given authenticated user, when GET list, then results/next format."""
        user, tenant = _setup(client)
        response = client.get('/api/v1/purchasing/suppliers/', HTTP_X_TENANT_ID=str(tenant.id))
        assert response.status_code == 200
        data = response.json()
        assert 'results' in data
        assert 'next' in data


class TestFiscalExport:
    @pytest.mark.django_db
    def test_export_csv_returns_csv(self, client):
        """Given authenticated admin, when GET fiscal export, then CSV."""
        user, tenant = _setup(client)
        response = client.get('/api/v1/fiscal/documents/export/', HTTP_X_TENANT_ID=str(tenant.id))
        assert response.status_code == 200
        assert response['Content-Type'] == 'text/csv'


class TestCrossTenant:
    @pytest.mark.django_db
    def test_cross_tenant_empty_list(self, client):
        """Given two tenants, user from B sees 0 products from A."""
        _setup(client, email='a@test.local', tenant_slug='tenant-a')
        user_b, tenant_b = _setup(client, email='b@test.local', tenant_slug='tenant-b')
        response = client.get('/api/v1/products/', HTTP_X_TENANT_ID=str(tenant_b.id))
        assert response.status_code == 200
        assert len(response.json()['results']) == 0


class TestMonitoring:
    @pytest.mark.django_db
    def test_monitoring_operations(self, client):
        """Given authenticated admin, when GET operations, then health+metrics."""
        user, tenant = _setup(client)
        response = client.get('/api/v1/monitoring/operations/', HTTP_X_TENANT_ID=str(tenant.id))
        assert response.status_code == 200
        data = response.json()
        assert 'health' in data
        assert 'system_metrics' in data
        assert 'runbook_links' in data


class TestWriteOnlySecrets:
    @pytest.mark.django_db
    def test_fiscal_secret_not_returned(self, client):
        """Given admin, when create emitter, then secret never in response."""
        from tenancy.models import Branch, Company

        user, tenant = _setup(client)
        # Create Branch inside tenant context
        token = set_current_tenant_id(tenant.id)
        with connection.cursor() as cursor:
            cursor.execute(
                "SELECT set_config('app.current_tenant_id', %s, false)", [str(tenant.id)]
            )
        company = Company.all_objects.create(tenant=tenant, name='Co')
        branch = Branch.all_objects.create(tenant=tenant, company=company, name='Br')
        reset_current_tenant_id(token)
        response = client.post(
            '/api/v1/fiscal/emitters/',
            {
                'branch': str(branch.id),
                'provider': 'nfce',
                'cpf_cnpj': '11111111111111',
                'ie': '111',
                'api_key': 'super-secret-123',
            },
            content_type='application/json',
            HTTP_X_TENANT_ID=str(tenant.id),
        )
        assert response.status_code == 201
        body_text = str(response.json())
        assert 'super-secret-123' not in body_text
        assert response.json().get('configured') is True


class TestOperatorDenied:
    @pytest.mark.django_db
    def test_operator_cannot_create_emitter(self, client):
        """Given operator role, when POST emitter, then 403."""
        from tenancy.models import Branch, Company

        user = User.objects.create_user(email='op@test.local', password='pass123')
        tenant = Tenant.objects.create(name='Op Test', slug='op-test')
        TenantMembership.objects.create(user=user, tenant=tenant, role='operator', is_active=True)
        client.force_login(user)
        session = client.session
        session['mfa_tenant_id'] = str(tenant.id)
        session['mfa_method'] = 'totp'
        session.save()
        token = set_current_tenant_id(tenant.id)
        with connection.cursor() as cursor:
            cursor.execute(
                "SELECT set_config('app.current_tenant_id', %s, false)", [str(tenant.id)]
            )
        company = Company.all_objects.create(tenant=tenant, name='Op Co')
        branch = Branch.all_objects.create(tenant=tenant, company=company, name='Op Br')
        reset_current_tenant_id(token)
        response = client.post(
            '/api/v1/fiscal/emitters/',
            {
                'branch': str(branch.id),
                'provider': 'nfce',
                'cpf_cnpj': '11111111111111',
                'ie': '111',
                'api_key': 'secret',
            },
            content_type='application/json',
        )
        assert response.status_code == 403
