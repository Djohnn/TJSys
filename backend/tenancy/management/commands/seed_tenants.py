from decouple import config
from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand, CommandError
from django.db import connection, transaction

from tenancy.context import reset_current_tenant_id, set_current_tenant_id
from tenancy.models import Branch, Company, Tenant, TenantMembership

User = get_user_model()


class Command(BaseCommand):
    help = 'Cria dois tenants locais de demonstração sem expor credenciais.'

    def handle(self, *args, **options):
        password = config('SEED_ADMIN_PASSWORD', default='')
        if not password:
            raise CommandError('SEED_ADMIN_PASSWORD is required for local seed data.')

        admin_user, created = User.objects.get_or_create(email='admin@tjsys.local')
        if created:
            admin_user.is_staff = True
            admin_user.is_superuser = True
        admin_user.set_password(password)
        admin_user.save()

        tenant_data = [
            (
                'casa-de-racao-alpha',
                'Casa de Ração Alpha',
                'Alpha Matriz',
                ['Loja Centro', 'Loja Norte'],
            ),
            ('pet-shop-beta', 'Pet Shop Beta', 'Beta Filial Sul', ['Loja Paulista']),
        ]

        for slug, tenant_name, company_name, branch_names in tenant_data:
            tenant, _ = Tenant.objects.get_or_create(slug=slug, defaults={'name': tenant_name})
            self._create_tenant_structure(tenant, company_name, branch_names)
            TenantMembership.objects.get_or_create(
                user=admin_user,
                tenant=tenant,
                defaults={'role': 'admin'},
            )

        self.stdout.write(self.style.SUCCESS('Seed local concluído sem exibir credenciais.'))

    @staticmethod
    def _create_tenant_structure(tenant, company_name, branch_names):
        token = set_current_tenant_id(tenant.id)
        try:
            with transaction.atomic():
                with connection.cursor() as cursor:
                    cursor.execute(
                        "SELECT set_config('app.current_tenant_id', %s, true)",
                        [str(tenant.id)],
                    )
                company, _ = Company.objects.get_or_create(
                    tenant=tenant,
                    name=company_name,
                    defaults={'is_active': True},
                )
                for branch_name in branch_names:
                    Branch.objects.get_or_create(
                        company=company,
                        tenant=tenant,
                        name=branch_name,
                    )
        finally:
            reset_current_tenant_id(token)
