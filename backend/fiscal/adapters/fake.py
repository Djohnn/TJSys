from fiscal.ports import CancelResult, EmitResult, FiscalProvider, QueryResult


class DeterministicFiscalAdapter(FiscalProvider):
    """Local provider used by the real browser E2E; never calls PlugNotas."""

    def __init__(self, api_key=''):
        self.api_key = api_key

    def emit(self, tenant, emitter, document, items, payments):
        return EmitResult(
            provider_document_id=f'e2e-{document.id}',
            raw_response={'status': 'PROCESSANDO'},
        )

    def query(self, tenant, provider_document_id):
        return QueryResult(
            status='CONCLUIDO',
            protocol=f'protocol-{provider_document_id}',
            xml_url=None,
            pdf_url=None,
            error_reason=None,
        )

    def cancel(self, tenant, provider_document_id):
        return CancelResult(success=True, protocol=f'cancel-{provider_document_id}')
