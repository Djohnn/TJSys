# Observability Dashboards

## Overview
This document defines the operational dashboards and alert thresholds for the TJSys ERP pilot deployment.

## Dashboard Panels

### 1. API Health & Latency
| Panel | Metric | Warning | Critical |
|-------|--------|---------|----------|
| API Latency (p95) | `histogram_quantile(0.95, rate(http_request_duration_seconds_bucket[5m]))` | > 500ms | > 2s |
| Error Rate | `rate(http_requests_total{status=~"5.."}[5m])` | > 1% | > 5% |
| Request Rate | `rate(http_requests_total[5m])` | N/A | N/A |

**Data Source**: `monitoring/metrics/` endpoint + Prometheus scrape

### 2. Database Health
| Panel | Metric | Warning | Critical |
|-------|--------|---------|----------|
| Connections | `pg_stat_database_numbackends` | > 80% of max | > 95% of max |
| Latency | `pg_stat_database_blks_read_time` | > 10ms | > 50ms |
| Long Queries | `pg_stat_activity` count where `state = 'active'` and `now() - query_start > 30s` | > 5 | > 20 |

**Query**: `SELECT * FROM pg_stat_activity WHERE state = 'active' AND now() - query_start > interval '30 seconds';`

### 3. Cache (Redis) Health
| Panel | Metric | Warning | Critical |
|-------|--------|---------|----------|
| Memory Usage | `used_memory / maxmemory` | > 75% | > 90% |
| Hit Rate | `keyspace_hits / (keyspace_hits + keyspace_misses)` | < 80% | < 50% |
| Connected Clients | `connected_clients` | > 80% of max | > 95% of max |

### 4. Outbox Queue
| Panel | Metric | Warning | Critical |
|-------|--------|---------|----------|
| Pending Messages | `SELECT count(*) FROM outbox_outboxmessage WHERE status = 'pending';` | > 100 | > 1000 |
| Oldest Pending Age | `SELECT EXTRACT(EPOCH FROM (now() - MIN(created_at))) FROM outbox_outboxmessage WHERE status = 'pending';` | > 60s | > 300s |
| Failed Messages | `SELECT count(*) FROM outbox_outboxmessage WHERE status = 'failed';` | > 0 | > 10 |

### 5. Fiscal Processing
| Panel | Metric | Warning | Critical |
|-------|--------|---------|----------|
| Pending Documents | `SELECT count(*) FROM fiscal_fiscalcocument WHERE status IN ('PENDING','PROCESSING');` | > 10 | > 50 |
| Rejected Documents | `SELECT count(*) FROM fiscal_fiscalcocument WHERE status = 'REJECTED' AND created_at > now() - interval '1 hour';` | > 0 | > 5 |
| Error Rate | `SELECT count(*) FROM fiscal_fiscalcocument WHERE status = 'FAILED' AND created_at > now() - interval '1 hour';` | > 0 | > 3 |

### 6. PDV Offline Queue
| Panel | Metric | Warning | Critical |
|-------|--------|---------|----------|
| Offline Devices | `SELECT count(*) FROM tenancy_device WHERE last_seen < now() - interval '5 minutes';` | > 0 | > 2 |
| Pending Sync Ops | `SELECT count(*) FROM operationjournal WHERE status = 'pending';` | > 50 | > 200 |

## Alert Thresholds (Pilot Baselines)

| Alert | Condition | Severity | Notification |
|-------|-----------|----------|--------------|
| API Down | Health check fails 3x in 1min | SEV-1 | PagerDuty + Slack |
| DB Connections > 90% | `pg_stat_database_numbackends > 0.9 * max_connections` | SEV-2 | Slack |
| Outbox Backlog > 1000 | `pending > 1000 for 5min` | SEV-2 | Slack |
| Fiscal Rejected > 5/hr | `rejected_count > 5 in 1h` | SEV-2 | Slack + Email |
| Redis Memory > 90% | `used_memory / maxmemory > 0.9` | SEV-2 | Slack |
| PDV Offline > 5min | `last_seen < now() - 5min` | SEV-3 | Slack |

## Dashboard Implementation Notes

### Grafana (if available)
- Import dashboard JSON from `docs/09_Operations/grafana_dashboard.json`
- Configure data sources: PostgreSQL, Redis, Prometheus

### Built-in Metrics Endpoint
The application exposes metrics at:
```
GET /api/v1/monitoring/metrics/
```
Returns JSON with:
- Request counts per endpoint
- Latency percentiles (avg, min, max)
- Error counts by status code
- Database/cache health

### Prometheus Scrape Config (if using)
```yaml
- job_name: 'tjsys-backend'
  static_configs:
    - targets: ['backend:8000']
  metrics_path: '/api/v1/monitoring/metrics/'
  scrape_interval: 30s
```

## Pilot Dashboard Checklist
- [ ] API Latency dashboard shows < 500ms p95
- [ ] Error rate < 1%
- [ ] Database connections < 80%
- [ ] Outbox queue < 100 pending
- [ ] No fiscal rejections in last hour
- [ ] All PDV devices online
- [ ] Redis memory < 75%
- [ ] No long-running queries (>30s)