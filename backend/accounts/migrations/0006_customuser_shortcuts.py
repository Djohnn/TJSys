from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('accounts', '0005_userfavorite'),
    ]

    operations = [
        migrations.AddField(
            model_name='customuser',
            name='shortcuts',
            field=models.JSONField(blank=True, default=dict, help_text='Custom keyboard shortcuts as JSON object'),
        ),
    ]
