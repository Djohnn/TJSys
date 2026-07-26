import logging
import uuid

import pytest

from config.log_context import get_request_context


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
