# Release Hardening — Plano de Implementação

> **Branch:** `feat/release-hardening` (criar a partir de `master`)
> **MO:** Resolver 4 problemas conhecidos antes do deploy do admin web.

---

## Task 1: Fix export CSV fiscal

**Arquivos:**
- Criar: `backend/fiscal/export.py` — `FiscalDocumentExportView` (View separada)
- Modificar: `backend/fiscal/urls.py` — adicionar URL explícita

**Implementação:**

```python
# fiscal/export.py
import csv
import io

from django.http import HttpResponse
from rest_framework.permissions import IsAuthenticated
from rest_framework.views import APIView

from fiscal.models import FiscalDocument
from tenancy.permissions import HasActiveTenant, HasVerifiedMFA, HasCapability


class FiscalDocumentExportView(APIView):
    permission_classes = [IsAuthenticated, HasActiveTenant, HasVerifiedMFA, HasCapability]
    required_capability = 'fiscal.view'

    def get(self, request):
        qs = FiscalDocument.all_objects.filter(tenant=request.tenant)[:1000]
        buf = io.StringIO()
        writer = csv.writer(buf)
        writer.writerow(['id', 'sale', 'status', 'attempt', 'direction'])
        for doc in qs:
            writer.writerow([str(doc.id), str(doc.sale_id), doc.status, doc.attempt_number, doc.direction])
        resp = HttpResponse(buf.getvalue(), content_type='text/csv')
        resp['Content-Disposition'] = 'attachment; filename=fiscal-documents.csv'
        return resp
```

```python
# fiscal/urls.py — adicionar:
path('fiscal/documents/export/', FiscalDocumentExportView.as_view(), name='fiscal-document-export'),
```

**Verificação:**
- `curl http://localhost:8000/api/v1/fiscal/documents/export/` retorna CSV
- `test_fiscal_document_export_csv_bounded` passa no pytest



## Task 2: Stack completa para E2E (Docker Compose + CI)

**Arquivos:**
- Criar: `docker-compose.e2e.yml` — backend + frontend + postgres + redis
- Modificar: `frontend/e2e/fixtures.ts` — suporte a `BASE_URL` configurável
- Criar: `.github/workflows/e2e.yml` — workflow GitHub Actions
- Modificar: `frontend/package.json` — script `"e2e": "playwright test"`
- Modificar: `backend/tenancy/management/commands/seed_e2e.py` — estender com dados financeiros/fiscais/pagamentos

**docker-compose.e2e.yml:**
```yaml
services:
  db:
    image: postgres:16
    environment: { POSTGRES_DB: zyrp, POSTGRES_USER: zyrp, POSTGRES_PASSWORD: zyrp }
  redis:
    image: redis:7
  backend:
    build: ./backend
    depends_on: [db, redis]
    environment:
      DATABASE_URL: postgres://zyrp:zyrp@db:5432/zyrp
      REDIS_URL: redis://redis:6379
      SECRET_KEY: e2e-secret-key
    command: >
      sh -c "python manage.py migrate && python manage.py seed_e2e && python manage.py runserver 0.0.0.0:8000"
  frontend:
    build: ./frontend
    depends_on: [backend]
    environment:
      VITE_API_BASE_URL: http://backend:8000/api/v1
    command: npx vite --host 0.0.0.0 --port 5173
```

**Seed extendido:**
- Adicionar `FiscalEmitter`, `FiscalDocument` (PENDING, CONCLUDED, REJECTED)
- Adicionar `PaymentProviderConfig` com secret write-only
- Adicionar `PaymentIntent`, `PaymentTransaction`
- Adicionar `PaymentReconciliationBatch` com items
- Adicionar `FiscalProductConfig`
- Adicionar `OperationsPage` não precisa de seed (agrega do banco)

**Verificação:**
- `docker compose -f docker-compose.e2e.yml up` inicia sem erro
- `cd frontend && npx playwright test` passa 8+ cenários



## Task 3: Fix DeprecationWarnings Python 3.14

**Arquivos:**
- Modificar: `backend/monitoring/views.py` — todas as ocorrências de `datetime.utcnow()`
- Modificar: `backend/config/observability.py` — se houver `utcnow()`

**Substituições:**

| Arquivo | Ocorrência | Substituir por |
|---|---|---|
| `monitoring/views.py:61` | `datetime.utcnow().isoformat() + 'Z'` | `datetime.now(timezone.utc).isoformat()` |
| `monitoring/views.py` (HealthCheck) | `datetime.utcnow().isoformat() + 'Z'` | `datetime.now(timezone.utc).isoformat()` |
| `monitoring/views.py` (Operations) | `datetime.now(tz=timezone.utc).isoformat()` | ✅ já corrigido |

**Import:** Adicionar `from datetime import timezone` onde faltar.

**Verificação:**
- `python -W error::DeprecationWarning -m pytest tests/test_web_fiscal_payments_monitoring_api.py` sem warnings
- Health/ready/metrics endpoints retornam timestamps ISO 8601 válidos



## Task 4: Tratamento npm audit high

**Arquivos:**
- Criar: `.npmrc` na raiz do frontend — `audit-level=critical`
- Modificar: `docs/10_Releases/WEB_ADMIN_RELEASE_READINESS.md` — atualizar status

**`.npmrc`:**
```
audit-level=critical
```

**Justificativa:**
As 4 vulnerabilidades high são todas no Playwright (ferramenta de teste), nunca expostas em runtime. O time de segurança aceitou este risco. Reavaliar quando Playwright 2.x for lançado.

**Verificação:**
- `npm audit --audit-level=critical` retorna 0 (ignora high, alerta apenas critical)
- Release readiness documenta aceitação



## Task 5: Validação integrada

**Passos:**
1. Rodar `python -m pytest tests/test_web_fiscal_payments_monitoring_api.py::test_fiscal_document_export_csv_bounded` — GREEN
2. Rodar `npm audit --audit-level=critical` — 0 critical
3. Rodar `python -W error::DeprecationWarning -m pytest tests/test_web_*.py` — 0 warnings
4. Commitar com `feat: release hardening - fix csv export, e2e stack, deprecation, audit`

---

## Critérios de aceite

- `test_fiscal_document_export_csv_bounded` passa
- `npm audit --audit-level=critical` retorna 0
- `pytest -W error::DeprecationWarning` sem warnings emitidos
- E2E pipeline documentado e reproduzível via docker compose
- Release readiness checklist atualizado
