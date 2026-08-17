# Pilot Readiness Checklist

## Overview
This checklist must be completed and signed off before initiating the Zyrp pilot with 1-2 stores.

## Sections

### 1. Tenant & User Setup
| Item | Status | Evidence | Owner |
|------|--------|----------|-------|
| Tenant created for pilot store(s) | ☐ | Screenshot/DB record | |
| Admin user created with MFA | ☐ | User record | |
| Operator users created with MFA | ☐ | User records | |
| Device registered for each PDV | ☐ | Device records | |
| API keys generated and distributed securely | ☐ | Key records (not values) | |

### 2. Catalog & Inventory
| Item | Status | Evidence | Owner |
|------|--------|----------|-------|
| Product catalog imported/created | ☐ | Product count | |
| NCM codes configured for all products | ☐ | FiscalProductConfig records | |
| CST/CSOSN/ICMS configured | ☐ | FiscalProductConfig records | |
| Stock locations created | ☐ | Location records | |
| Initial stock quantities loaded | ☐ | StockOperation records | |
| Price lists configured per branch | ☐ | ProductPrice records | |

### 3. Sales & PDV
| Item | Status | Evidence | Owner |
|------|--------|----------|-------|
| PDV app installed on all devices | ☐ | Device list | |
| Cash session workflow tested | ☐ | Test session record | |
| Payment methods configured (cash, PIX, card) | ☐ | Payment method config | |
| Sale flow end-to-end tested | ☐ | Test sale record | |
| Refund/cancel flow tested | ☐ | Test refund record | |

### 4. Fiscal (NFC-e)
| Item | Status | Evidence | Owner |
|------|--------|----------|-------|
| FiscalEmitter configured per branch | ☐ | Emitter records | |
| PlugNotas credentials valid | ☐ | Test emission success | |
| Test NFC-e emitted successfully | ☐ | CONCLUDED document | |
| Rejection handling tested | ☐ | REJECTED document + retry | |
| Certificate valid (not expiring < 30 days) | ☐ | Cert expiry date | |

### 5. Backup & Restore
| Item | Status | Evidence | Owner |
|------|--------|----------|-------|
| Automated backup scheduled | ☐ | Cron/job config | |
| Backup retention configured (7+ days) | ☑ | `backup_postgres.ps1`: 7 dias | Engineering |
| Restore tested successfully | ☑ | Relatório R8: restore descartável em 2026-08-12 | Engineering |
| Backup encryption enabled | ☐ | Backup file format | |
| Off-site backup location configured | ☐ | Storage location | |

### 6. Monitoring & Alerting
| Item | Status | Evidence | Owner |
|------|--------|----------|-------|
| Health/readiness endpoints responding | ☑ | Smoke R8: HTTP 200; negativos: HTTP 503 | Engineering |
| Metrics endpoint accessible | ☑ | Smoke autenticado R8: HTTP 200 | Engineering |
| Grafana/Prometheus dashboards configured | ☐ | Dashboard screenshots | |
| Alert rules created for SEV-1/2 triggers | ☐ | Alert rule config | |
| Notification channels tested (Slack/Email) | ☐ | Test notification | |
| Runbooks accessible to on-call | ☑ | `docs/09_Operations/RUNBOOK_*.md` | Engineering |

### 7. Security & Privacy
| Item | Status | Evidence | Owner |
|------|--------|----------|-------|
| No secrets in code/config (detect-secrets clean) | ☐ | Scan report | |
| TLS enabled on all endpoints | ☐ | SSL Labs grade A+ | |
| CORS/CSRF configured correctly | ☐ | Security headers check | |
| Rate limiting enabled on auth endpoints | ☐ | Throttle config | |
| PII handling documented | ☐ | Data map doc | |
| LGPD compliance review completed | ☐ | Legal sign-off | |

### 8. Disaster Recovery
| Item | Status | Evidence | Owner |
|------|--------|----------|-------|
| RTO/RPO documented | ☐ | DR plan doc | |
| Restore tested within RTO | ☐ | DR test log | |
| Rollback procedure tested | ☐ | Rollback test log | |
| Runbooks accessible to on-call | ☐ | Doc links | |
| Contact list current | ☐ | Contact list | |

### 9. Support & Operations
| Item | Status | Evidence | Owner |
|------|--------|----------|-------|
| On-call rotation defined | ☐ | Rotation schedule | |
| Escalation contacts documented | ☐ | Contact list | |
| Support ticket process defined | ☐ | Process doc | |
| SLA targets defined for pilot | ☐ | SLA doc | |
| Communication templates ready | ☐ | Template files | |

### 10. Performance Baselines
| Item | Status | Evidence | Owner |
|------|--------|----------|-------|
| API P95 latency measured (<500ms) | ☐ | Load test report | |
| Error rate baseline (<1%) | ☐ | Monitoring data | |
| DB connection pool sized | ☐ | Pool config | |
| Cache hit rate baseline (>80%) | ☐ | Redis stats | |

---

## Sign-Off

| Role | Name | Signature | Date |
|------|------|-----------|------|
| **Product Owner** | | | |
| **Engineering Lead** | | | |
| **Support Lead** | | | |
| **Security/Compliance** | | | |

---

## Pilot Go/No-Go Decision

| Criteria | Go | No-Go |
|----------|----|-------|
| All mandatory items (☐) checked | | |
| No unresolved SEV-1/2 risks | | |
| Sign-offs obtained | | |
| Rollback plan validated | | |

**Decision**: ☐ GO  ☐ NO-GO

**Date**: ___________  **Approved By**: ___________
