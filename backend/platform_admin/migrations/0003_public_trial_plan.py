from django.db import migrations, models


def seed_public_starter(apps, schema_editor):
    Plan = apps.get_model('platform_admin', 'Plan')
    plan, created = Plan.objects.get_or_create(
        code='starter',
        defaults={
            'name': 'Starter',
            'is_active': True,
            'is_public': True,
            'trial_days': 14,
            'sort_order': 10,
        },
    )
    if not created:
        Plan.objects.filter(pk=plan.pk).update(
            is_active=True,
            is_public=True,
            trial_days=14,
        )


class Migration(migrations.Migration):
    dependencies = [
        ('platform_admin', '0002_alter_platformadminaudit_action'),
    ]

    operations = [
        migrations.AddField(
            model_name='plan',
            name='is_public',
            field=models.BooleanField(default=False),
        ),
        migrations.AddField(
            model_name='plan',
            name='trial_days',
            field=models.PositiveIntegerField(default=0),
        ),
        migrations.RunPython(seed_public_starter, migrations.RunPython.noop),
    ]
