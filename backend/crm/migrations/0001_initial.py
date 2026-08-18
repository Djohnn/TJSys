import django.db.models.deletion
import uuid
from django.conf import settings
from django.db import migrations, models
import django.utils.timezone


class Migration(migrations.Migration):

    dependencies = [
        ('people', '0001_initial'),
        ('tenancy', '0001_initial'),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.CreateModel(
            name='CustomerHistoryEntry',
            fields=[
                ('id', models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ('created_at', models.DateTimeField(default=django.utils.timezone.now, editable=False)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('version', models.PositiveIntegerField(default=1)),
                ('event_type', models.CharField(choices=[('sale', 'Venda'), ('return', 'Devolução'), ('payment', 'Pagamento'), ('activity', 'Atividade'), ('note', 'Nota'), ('communication', 'Comunicação'), ('opportunity', 'Oportunidade')], max_length=20)),
                ('reference_id', models.UUIDField(blank=True, null=True)),
                ('reference_model', models.CharField(blank=True, default='', max_length=100)),
                ('title', models.CharField(max_length=200)),
                ('description', models.TextField(blank=True, default='')),
                ('amount', models.DecimalField(blank=True, decimal_places=2, max_digits=18, null=True)),
                ('metadata', models.JSONField(blank=True, default=dict)),
                ('created_by', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='history_entries', to=settings.AUTH_USER_MODEL)),
                ('customer', models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, related_name='history_entries', to='people.person')),
                ('tenant', models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, related_name='%(class)s_set', to='tenancy.tenant')),
            ],
            options={
                'ordering': ['-created_at'],
                'verbose_name_plural': 'Customer history entries',
            },
        ),
    ]
