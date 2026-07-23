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
        qs = FiscalDocument.all_objects.filter(tenant=request.tenant).order_by('-created_at')[:1000]
        buf = io.StringIO()
        writer = csv.writer(buf)
        writer.writerow(['id', 'sale', 'status', 'attempt', 'direction'])
        for doc in qs:
            writer.writerow([str(doc.id), str(doc.sale_id), doc.status, doc.attempt_number, doc.direction])
        resp = HttpResponse(buf.getvalue(), content_type='text/csv')
        resp['Content-Disposition'] = 'attachment; filename=fiscal-documents.csv'
        return resp
