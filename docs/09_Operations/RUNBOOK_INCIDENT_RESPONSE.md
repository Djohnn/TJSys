# Incident Response Runbook

## Severity Definitions

| Level | Definition | Response Time | Examples |
|-------|------------|---------------|----------|
| **SEV-1** | Complete service outage, data loss, security breach | 15 min | API down, DB unreachable, data corruption, unauthorized access |
| **SEV-2** | Major functionality degraded, revenue impact | 1 hour | Payment failing, fiscal emission down, sync broken |
| **SEV-3** | Minor functionality degraded, workaround exists | 4 hours | Non-critical report failing, slow queries, single PDV offline |
| **SEV-4** | Cosmetic issue, no functional impact | Next sprint | UI typo, minor UX issue, documentation error |

## Incident Response Flow

```
1. DETECT
   ├── Monitoring alert fires
   ├── Customer reports issue
   └── Team member notices anomaly

2. TRIAGE (5 min)
   ├── Acknowledge alert
   ├── Determine severity (SEV-1 to SEV-4)
   ├── Assign Incident Commander
   └── Create incident channel (#incident-YYYYMMDD-XXX)

3. MITIGATE
   ├── Apply immediate workaround
   ├── Communicate status to stakeholders
   └── Document timeline in incident channel

4. RESOLVE
   ├── Identify root cause
   ├── Deploy fix
   ├── Verify resolution
   └── Close incident

5. POSTMORTEM (within 48h for SEV-1/2)
   ├── Write postmortem (blameless)
   ├── Identify action items
   ├── Assign owners & due dates
   └── Share with team
```

## Runbook: Common Incidents

### SEV-1: API Completely Down
**Symptoms**: Health checks failing, all endpoints return 5xx or timeout

**Immediate Actions**:
1. Check `systemctl status tjsys-backend` (or container logs)
2. Check database connectivity: `pg_isready -h localhost -p 5432`
3. Check Redis: `redis-cli ping`
4. Check disk space: `df -h`
5. Check memory: `free -h`

**Common Causes & Fixes**:
| Cause | Check | Fix |
|-------|-------|-----|
| DB connection pool exhausted | `SELECT count(*) FROM pg_stat_activity;` | Restart app, increase pool size |
| OOM killer | `dmesg \| grep -i kill` | Increase memory, fix memory leak |
| Disk full | `df -h` | Clean logs, rotate, expand disk |
| Migration stuck | `SELECT * FROM pg_stat_activity WHERE state='active';` | Kill blocking query, re-run migration |

### SEV-2: Database Unreachable / Slow
**Symptoms**: Queries timeout, connection pool exhausted, high latency

**Immediate Actions**:
1. `SELECT * FROM pg_stat_activity WHERE state = 'active' AND now() - query_start > interval '30 seconds';`
2. Kill long-running queries: `SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE ...;`
3. Check for missing indexes: `EXPLAIN ANALYZE <slow query>;`
3. Check connection pool settings

**Fixes**:
- Add missing index (create concurrently)
- Increase `max_connections` if needed
- Scale read replica if available

### SEV-2: Fiscal Emission Failing
**Symptoms**: NFC-e documents stuck in PENDING/REJECTED, webhook failures

**Immediate Actions**:
1. Check `SELECT * FROM fiscal_fiscalcocument WHERE status IN ('REJECTED','FAILED') ORDER BY created_at DESC LIMIT 10;`
2. Check webhook logs: `grep fiscal_webhook /var/log/tjsys/*.log`
3. Check PlugNotas API status
4. Verify emitter config: `SELECT * FROM fiscal_fiscalemitter WHERE is_active = true;`

**Common Causes & Fixes**:
| Cause | Fix |
|-------|-----|
| Invalid CNPJ/IE | Update emitter config |
| PlugNotas API down | Wait, retry queue |
| Certificate expired | Renew certificate |
| Invalid NCM/CST | Update product fiscal config |
| Duplicate idempotency key | Re-queue with new key |

### SEV-2: Outbox Queue Backlog
**Symptoms**: `pending` messages > 1000, events not propagating

**Immediate Actions**:
1. `SELECT count(*) FROM outbox_outboxmessage WHERE status = 'pending';`
2. Check publisher task: `SELECT * FROM django_celery_beat_periodictask WHERE name LIKE '%outbox%';`
3. Check task worker logs
4. Manually trigger: `python manage.py process_outbox`

**Fixes**:
- Restart Celery worker
- Increase worker concurrency
- Fix failing handler causing retries

### SEV-3: Single PDV Offline
**Symptoms**: One PDV shows "offline", sync fails

**Immediate Actions**:
1. Check device status in admin
2. Verify network connectivity from PDV
3. Check device auth token validity
3. Restart PDV app

**Fixes**:
- Re-register device
- Update device token
- Check firewall/proxy rules

### SEV-3: Redis Memory High
**Symptoms**: Redis memory > 90%, evictions occurring

**Immediate Actions**:
1. `redis-cli INFO memory`
2. Check for large keys: `redis-cli --bigkeys`
3. Check TTL distribution

**Fixes**:
- Increase maxmemory
- Add TTL to cache keys
- Enable LRU eviction policy

## Communication Templates

### Internal Alert (Slack)
```
🚨 INCIDENT: [SEV-X] <Title>
Commander: @username
Started: <timestamp>
Impact: <description>
Status: Investigating / Mitigating / Resolved
Channel: #incident-YYYYMMDD-XXX
```

### Customer Communication (if needed)
> Subject: Service Update - [Brief Description]
> 
> We're experiencing [issue] affecting [scope]. Our team is investigating.
> Workaround: [if available]
> Next update: [time]
> 
> For urgent issues: support@tjsys.local

### Resolution
```
✅ RESOLVED: [SEV-X] <Title>
Duration: <time>
Root Cause: <brief>
Fix: <what was done>
Prevention: <what will change>
Postmortem: <link>
```

## Escalation Contacts

| Role | Name | Contact | Backup |
|------|------|---------|--------|
| Primary On-Call | - | - | - |
| Secondary On-Call | - | - | - |
| Engineering Lead | - | - | - |
| Product Owner | - | - | - |
| Infrastructure | - | - | - |

## Runbook Maintenance
- Review quarterly
- Update after each SEV-1/2 postmortem
- Test runbook steps in staging
- Keep contact list current