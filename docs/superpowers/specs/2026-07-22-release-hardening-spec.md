# Release Hardening — Correções Pós-Sprint 20

## Objetivo

Resolver os 4 problemas conhecidos remanescentes após a conclusão dos Sprints 16 a 20 e preparar o release administrativo web para deploy real.

## Problemas

### P1 — Export CSV fiscal (DRF action não registra)

**Sintoma:** `GET /api/v1/fiscal/documents/export/` retorna 404. O `@action(detail=False, methods=['get'])` no `FiscalDocumentViewSet` não é registrado corretamente pelo `DefaultRouter`.

**Causa:** O decorator `@action` com `detail=False` e método `get` conflita com a rota de listagem padrão do ViewSet. O `DefaultRouter` prioriza a action `list` sobre a action custom `export` quando ambas são GET e detail=False.

**Solução:** Criar uma View separada (não action) com URL pattern explícito em `fiscal/urls.py`.

### P2 — E2E Playwright requer stack completa

**Sintoma:** 10 specs Playwright (8 legacy + 5 release) existem mas nunca são executados porque exigem backend + frontend + seed data.

**Causa:** Nenhum CI configurado, seed data incompleta, sem script de inicialização integrado.

**Solução:** Docker Compose para stack completa, seed E2E estendido, script `npm run e2e` integrado, GitHub Actions workflow.

### P3 — DeprecationWarnings Python 3.14

**Sintoma:** 
- `datetime.datetime.utcnow()` é deprecated (usado em `monitoring/views.py`, `health/ready/metrics`)
- `asyncio.iscoroutinefunction` é deprecated (Django internals)

**Causa:** Python 3.14 alpha removeu funções `utcnow()` e marca `iscoroutinefunction` como deprecated.

**Solução:** Substituir `datetime.utcnow()` por `datetime.now(datetime.UTC)` em todos os views. Manter Python 3.14 alpha ou fixar versão 3.12/3.13 no ambiente.

### P4 — npm audit high (Playwright dep)

**Sintoma:** 4 vulnerabilidades high no `npm audit` — todas no Playwright e suas dependências.

**Causa:** Playwright 1.x depende de pacotes com CVEs conhecidas.

**Solução:** Atualizar para Playwright 2.x (se disponível) ou adicionar ao `.npmrc` `audit-level=critical` para suprimir high em deps de teste, documentado como risco aceito.

## Fora do escopo

- Provider fiscal/pagamento real
- Deploy em produção (Kubernetes, DNS, SSL)
- Testes de carga/performance
- App mobile
