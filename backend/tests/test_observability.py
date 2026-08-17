import logging
import uuid

import pytest
from django.contrib.auth import get_user_model
from django.test import override_settings

from config.log_context import get_request_context
from monitoring.views import ReadinessView

User = get_user_model()


@pytest.mark.django_db(transaction=True)
class TestRequestObservability:
    def test_valid_correlation_id_is_preserved(self, client):
        correlation_id = str(uuid.uuid4())
        response = client.get('/health/', HTTP_X_CORRELATION_ID=correlation_id)
        assert response.headers['X-Correlation-ID'] == correlation_id

    def test_invalid_correlation_id_is_replaced(self, client):
        response = client.get('/health/', HTTP_X_CORRELATION_ID='not-a-uuid')
        returned = response.headers['X-Correlation-ID']
        assert returned != 'not-a-uuid'
        assert str(uuid.UUID(returned)) == returned

    def test_authenticated_tenant_is_present_in_request_log(
        self,
        client,
        caplog,
        user_alpha,
        tenant_alpha,
        company_alpha,
    ):
        client.force_login(user_alpha)
        session = client.session
        session['mfa_tenant_id'] = str(tenant_alpha.id)
        session['mfa_method'] = 'totp'
        session.save()
        caplog.set_level(logging.INFO, logger='config.request')

        response = client.get(
            '/api/v1/companies/',
            HTTP_X_TENANT_ID=str(tenant_alpha.id),
            HTTP_X_CORRELATION_ID=str(uuid.uuid4()),
        )

        assert response.status_code == 200
        record = next(record for record in caplog.records if record.name == 'config.request')
        assert record.tenant_id == str(tenant_alpha.id)
        assert record.user == user_alpha.email
        assert record.correlation_id == response.headers['X-Correlation-ID']

    def test_request_context_is_cleared_after_response(self, client):
        client.get('/health/')
        assert get_request_context() == {}

    def test_monitoring_readiness_returns_503_when_database_is_down(self, client, monkeypatch):
        """Given DB failure, readiness shall fail closed with a useful reason."""
        monkeypatch.setattr(ReadinessView, '_check_db', lambda self: False)
        monkeypatch.setattr(ReadinessView, '_check_redis', lambda self: True)

        response = client.get('/api/v1/monitoring/ready/')

        assert response.status_code == 503
        assert response.json() == {'status': 'not_ready', 'reason': 'database unavailable'}
        assert response.headers['X-Correlation-ID']

    def test_monitoring_readiness_returns_503_when_cache_is_down(self, client, monkeypatch):
        """Given cache failure, readiness shall fail closed with a useful reason."""
        monkeypatch.setattr(ReadinessView, '_check_db', lambda self: True)
        monkeypatch.setattr(ReadinessView, '_check_redis', lambda self: False)

        response = client.get('/api/v1/monitoring/ready/')

        assert response.status_code == 503
        assert response.json() == {'status': 'not_ready', 'reason': 'cache unavailable'}
        assert response.headers['X-Correlation-ID']


@pytest.mark.django_db
class TestMetricsResetAuthorization:
    @override_settings(DEBUG=True)
    def test_anonymous_metrics_reset_is_forbidden(self, client):
        response = client.post('/api/v1/monitoring/metrics/reset/')

        assert response.status_code == 403

    @override_settings(DEBUG=True)
    def test_staff_can_reset_metrics_in_debug_environment(self, client):
        staff = User.objects.create_user(email='metrics-admin@example.com', password='pass')
        staff.is_staff = True
        staff.save(update_fields=['is_staff'])
        client.force_login(staff)

        response = client.post('/api/v1/monitoring/metrics/reset/')

        assert response.status_code == 200
        assert response.json() == {'status': 'reset'}

    @override_settings(DEBUG=False)
    def test_metrics_reset_is_disabled_outside_debug(self, client):
        staff = User.objects.create_user(email='metrics-prod@example.com', password='pass')
        staff.is_staff = True
        staff.save(update_fields=['is_staff'])
        client.force_login(staff)

        response = client.post('/api/v1/monitoring/metrics/reset/')

        assert response.status_code == 403
