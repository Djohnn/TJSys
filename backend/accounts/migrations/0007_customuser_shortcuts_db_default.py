from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ('accounts', '0006_customuser_shortcuts'),
    ]

    operations = [
        migrations.AlterField(
            model_name='customuser',
            name='shortcuts',
            field=models.JSONField(
                blank=True,
                db_default={},
                default=dict,
                help_text='Custom keyboard shortcuts as JSON object',
            ),
        ),
    ]
