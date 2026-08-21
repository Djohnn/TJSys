import uuid

import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('accounts', '0004_customuser_email_verified_at'),
        ('tenancy', '0001_initial'),
    ]

    operations = [
        migrations.CreateModel(
            name='UserFavorite',
            fields=[
                ('id', models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ('entity_type', models.CharField(help_text='Type of entity: product, category, route, etc.', max_length=32)),
                ('entity_id', models.UUIDField(blank=True, null=True)),
                ('label', models.CharField(max_length=200)),
                ('route', models.CharField(max_length=200)),
                ('position', models.PositiveIntegerField(default=0)),
                ('icon', models.CharField(blank=True, default='', max_length=32)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('tenant', models.ForeignKey(editable=False, on_delete=django.db.models.deletion.CASCADE, to='tenancy.tenant')),
                ('user', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='favorites', to=settings.AUTH_USER_MODEL)),
            ],
            options={
                'ordering': ['position'],
            },
        ),
        migrations.AddConstraint(
            model_name='userfavorite',
            constraint=models.UniqueConstraint(fields=('user', 'tenant', 'entity_type', 'entity_id'), name='uniq_favorite_user_entity'),
        ),
        migrations.AddConstraint(
            model_name='userfavorite',
            constraint=models.UniqueConstraint(fields=('user', 'tenant', 'position'), name='uniq_favorite_user_position'),
        ),
        migrations.RunSQL(
            sql="""
                ALTER TABLE accounts_userfavorite ENABLE ROW LEVEL SECURITY;
                ALTER TABLE accounts_userfavorite FORCE ROW LEVEL SECURITY;
                CREATE POLICY tenant_isolation_policy ON accounts_userfavorite
                    FOR ALL
                    USING (tenant_id::text = current_setting('app.current_tenant_id', TRUE))
                    WITH CHECK (tenant_id::text = current_setting('app.current_tenant_id', TRUE));
            """,
            reverse_sql="""
                DROP POLICY IF EXISTS tenant_isolation_policy ON accounts_userfavorite;
                ALTER TABLE accounts_userfavorite FORCE ROW LEVEL SECURITY OFF;
                ALTER TABLE accounts_userfavorite DISABLE ROW LEVEL SECURITY;
            """,
        ),
    ]
