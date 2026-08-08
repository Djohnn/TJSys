# Security & Privacy Checklist

## Overview
This checklist ensures the TJSys platform meets security and privacy requirements for pilot deployment.

---

## 1. Secrets Management
| Check | Status | Evidence |
|-------|--------|----------|
| No hardcoded secrets in codebase | ☐ | `detect-secrets` scan clean |
| No secrets in Docker images | ☐ | Image scan report |
| No secrets in CI/CD logs | ☐ | Log audit |
| Environment variables used for all secrets | ☐ | Config review |
| Secrets rotated in last 90 days | ☐ | Rotation log |
| Secret rotation procedure documented | ☐ | Procedure doc |

---

## 2. Authentication & Authorization
| Check | Status | Evidence |
|-------|--------|----------|
| MFA enforced for all admin users | ☐ | MFA policy config |
| MFA enforced for all operator users | ☐ | MFA policy config |
| Device authentication via JWT + API key | ☐ | Auth flow review |
| Session timeout configured (< 8 hours) | ☐ | Settings |
| Failed login lockout enabled | ☐ | Throttle config |
| Password complexity enforced | ☐ | Password policy |
| Role-based access control implemented | ☐ | Permission matrix |
| Tenant isolation verified (RLS) | ☐ | Test isolation report |

---

## 3. Data Protection
| Check | Status | Evidence |
|-------|--------|----------|
| TLS 1.2+ on all external endpoints | ☐ | SSL Labs A+ |
| HSTS enabled with preload | ☐ | Security headers |
| CSP header configured | ☐ | Response headers |
| Database encryption at rest | ☐ | RDS/PostgreSQL config |
| Database encryption in transit | ☐ | SSL mode=require |
| PII fields identified and documented | ☐ | Data dictionary |
| PII encrypted or pseudonymized | ☐ | Schema review |
| Backup encryption enabled | ☐ | Backup config |
| Data retention policy implemented | ☐ | Retention job config |

---

## 4. Application Security
| Check | Status | Evidence |
|-------|--------|----------|
| Input validation on all endpoints | ☐ | Serializer validation |
| SQL injection prevented (ORM used) | ☐ | Code review |
| XSS protection (CSP, escaping) | ☐ | Template review |
| CSRF protection on state-changing ops | ☐ | Middleware config |
| CORS policy restrictive | ☐ | CORS config |
| Rate limiting on auth endpoints | ☐ | Throttle config |
| Rate limiting on API endpoints | ☐ | Throttle config |
| File upload validation (if any) | ☐ | Upload handler |
| Dependency scanning in CI/CD | ☐ | Snyk/Dependabot report |

---

## 5. Infrastructure Security
| Check | Status | Evidence |
|-------|--------|----------|
| Server OS hardened (CIS benchmarks) | ☐ | Audit report |
| Firewall rules minimal (deny by default) | ☐ | Security groups/UFW |
| SSH key-only access (no passwords) | ☐ | SSHD config |
| Unnecessary services disabled | ☐ | systemctl list |
| Log forwarding to SIEM | ☐ | Log config |
| Vulnerability scanning scheduled | ☐ | Scan schedule |
| Container images scanned | ☐ | Trivy/Anchore report |

---

## 6. Privacy (LGPD/GDPR)
| Check | Status | Evidence |
|-------|--------|----------|
| Data Processing Agreement (DPA) with subprocessors | ☐ | DPA docs |
| Data subject rights implemented (access, deletion, portability) | ☐ | API endpoints |
| Consent management for marketing | ☐ | Consent records |
| Data breach notification procedure | ☐ | Incident runbook |
| DPO designated | ☐ | DPO contact |
| Records of Processing Activities (ROPA) maintained | ☐ | ROPA document |
| Data transfer safeguards (if international) | ☐ | SCC/adequacy decision |

---

## 7. Logging & Monitoring
| Check | Status | Evidence |
|-------|--------|----------|
| Structured JSON logging | ☐ | Log sample |
| Correlation IDs propagated | ☐ | Log trace |
| No PII in logs (filtered) | ☐ | Log review |
| Security events logged (auth, authz, admin actions) | ☐ | Audit log |
| Log retention configured | ☐ | Retention policy |
| Alert on security events | ☐ | Alert rules |

---

## 8. Incident Response
| Check | Status | Evidence |
|-------|--------|----------|
| Incident response plan documented | ☐ | IR plan doc |
| Security contacts defined | ☐ | Contact list |
| Breach notification timeline defined (72h LGPD) | ☐ | IR plan |
| Forensic readiness (disk images, logs) | ☐ | Procedure |
| Tabletop exercise conducted | ☐ | Exercise report |

---

## 8. Third-Party Risk
| Check | Status | Evidence |
|-------|--------|----------|
| Vendor security assessments completed | ☐ | Assessment reports |
| DPAs signed with all data processors | ☐ | DPA list |
| Subprocessor list maintained | ☐ | Subprocessor register |
| Vendor access reviewed quarterly | ☐ | Access review log |

---

## 9. Compliance Evidence
| Artifact | Location | Last Updated |
|----------|----------|--------------|
| Detect-secrets baseline | `.secrets.baseline` | |
| Dependency scan report | `security/scan-report.json` | |
| Container scan report | `security/container-scan.json` | |
| SSL Labs report | `security/ssl-report.pdf` | |
| Penetration test report | `security/pentest-report.pdf` | |
| LGPD compliance assessment | `security/lgpd-assessment.pdf` | |

---

## Sign-Off

| Role | Name | Signature | Date |
|------|------|-----------|------|
| **Security Lead** | | | |
| **Engineering Lead** | | | |
| **DPO / Legal** | | | |
| **Product Owner** | | | |

---

## Exceptions / Risk Acceptance

| Risk ID | Description | Severity | Mitigation | Accepted By | Date |
|---------|-------------|----------|------------|-------------|------|
| | | | | | |
| | | | | | |

---

*This checklist must be reviewed and updated before each major release and at least quarterly.*