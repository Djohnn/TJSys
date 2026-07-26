"""Tests for frontend readiness — CORS, OpenAPI schema, and Swagger UI."""

from django.test import Client, TestCase, override_settings


class FrontendReadinessTest(TestCase):
    """Verify the backend is properly configured for frontend integration."""

    def setUp(self):
        self.client = Client()

    @override_settings(
        CORS_ALLOWED_ORIGINS=[
            'http://localhost:5173',
            'http://127.0.0.1:5173',
        ],
        CORS_ALLOW_CREDENTIALS=True,
    )
    def test_allowed_origin_receives_credentialed_cors_headers(self):
        """When an allowed origin makes a request, the response includes
        Access-Control-Allow-Origin and Access-Control-Allow-Credentials."""
        response = self.client.get(
            '/health/',
            HTTP_ORIGIN='http://localhost:5173',
        )
        self.assertEqual(
            response.headers.get('Access-Control-Allow-Origin'),
            'http://localhost:5173',
        )
        self.assertEqual(
            response.headers.get('Access-Control-Allow-Credentials'),
            'true',
        )

    @override_settings(
        CORS_ALLOWED_ORIGINS=[
            'http://localhost:5173',
            'http://127.0.0.1:5173',
        ],
        CORS_ALLOW_CREDENTIALS=True,
    )
    def test_unlisted_origin_does_not_receive_cors_headers(self):
        """When an unlisted origin makes a request, the response does not
        include CORS headers."""
        response = self.client.get(
            '/health/',
            HTTP_ORIGIN='https://evil.example.com',
        )
        self.assertNotIn('Access-Control-Allow-Origin', response.headers)

    @override_settings(DEBUG=True)
    def test_schema_endpoint_returns_openapi_json(self):
        """When a user hits /api/v1/schema/, the response is 200 with
        OpenAPI JSON (contains openapi/info/paths keys)."""
        response = self.client.get(
            '/api/v1/schema/',
            HTTP_ACCEPT='application/json',
        )
        self.assertEqual(response.status_code, 200)
        self.assertIn('application/json', response['Content-Type'])
        data = response.json()
        self.assertIn('openapi', data)
        self.assertIn('info', data)
        self.assertIn('paths', data)

    @override_settings(DEBUG=True)
    def test_docs_endpoint_loads_swagger_ui(self):
        """When a user hits /api/v1/docs/, the response is 200 and the HTML
        contains 'swagger'."""
        response = self.client.get('/api/v1/docs/')
        self.assertEqual(response.status_code, 200)
        self.assertContains(response, 'swagger')
