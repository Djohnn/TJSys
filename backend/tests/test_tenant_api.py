import uuid

from django.contrib.auth import get_user_model
from django.db import connection
from django.test import TestCase

from audit.models import AuditRecord
from tenancy.models import Company, Tenant, TenantMembership

User = get_user_model()


class TenantCompanyAPITest(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.tenant_a = Tenant.objects.create(name='Tenant A', slug='tenant-a-api')
        cls.tenant_b = Tenant.objects.create(name='Tenant B', slug='tenant-b-api')
        cls.user_a = User.objects.create_user(
            username='tenant-a-user', email='a-api@test.local', password='pass123',
        )
        TenantMembership.objects.create(
            user=cls.user_a, tenant=cls.tenant_a, role='admin',
        )

        cls._set_context(cls.tenant_a.id)
        cls.company_a = Company.objects.create(tenant=cls.tenant_a, name='Company A')
        cls._set_context(cls.tenant_b.id)
        cls.company_b = Company.objects.create(tenant=cls.tenant_b, name='Company B')
        cls._set_context(None)

    @staticmethod
    def _set_context(tenant_id):
        value = str(tenant_id) if tenant_id else ''
        with connection.cursor() as cursor:
            cursor.execute('SET app.current_tenant_id = %s', [value])

    def setUp(self):
        self.client.force_login(self.user_a)
        session = self.client.session
        session['mfa_tenant_id'] = str(self.tenant_a.id)
        session['mfa_method'] = 'totp'
        session.save()

    def test_tenant_header_is_required(self):
        response = self.client.get('/api/v1/companies/')
        self.assertEqual(response.status_code, 403)

    def test_invalid_tenant_header_is_rejected(self):
        response = self.client.get(
            '/api/v1/companies/', HTTP_X_TENANT_ID='not-a-uuid',
        )
        self.assertEqual(response.status_code, 400)

    def test_user_cannot_select_tenant_without_membership(self):
        response = self.client.get(
            '/api/v1/companies/', HTTP_X_TENANT_ID=str(self.tenant_b.id),
        )
        self.assertEqual(response.status_code, 404)

    def test_list_returns_only_active_tenant_companies(self):
        response = self.client.get(
            '/api/v1/companies/', HTTP_X_TENANT_ID=str(self.tenant_a.id),
        )
        self.assertEqual(response.status_code, 200)
        ids = {item['id'] for item in response.json()['results']}
        self.assertEqual(ids, {str(self.company_a.id)})

    def test_cross_tenant_detail_returns_404(self):
        response = self.client.get(
            f'/api/v1/companies/{self.company_b.id}/',
            HTTP_X_TENANT_ID=str(self.tenant_a.id),
        )
        self.assertEqual(response.status_code, 404)

    def test_create_forces_active_tenant(self):
        response = self.client.post(
            '/api/v1/companies/',
            {'name': 'Created safely', 'tenant': str(uuid.uuid4())},
            content_type='application/json',
            HTTP_X_TENANT_ID=str(self.tenant_a.id),
        )
        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.json()['tenant'], str(self.tenant_a.id))
        audit = AuditRecord.objects.get(
            action='company.created', resource_id=response.json()['id'],
        )
        self.assertEqual(audit.actor, self.user_a)
        self.assertEqual(audit.tenant_id, str(self.tenant_a.id))
