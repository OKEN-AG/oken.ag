# Dashboard e alertas — Event Outbox Worker

## Fonte dos dados

Todos os painéis abaixo partem da view `public.event_outbox_operational_metrics` e das tabelas:

- `public.event_outbox`
- `public.event_outbox_publish_attempts`
- `public.event_outbox_dlq`

## Dashboard (Grafana / Supabase SQL)

### 1) Backlog de publicação

**Métrica:** pendentes (`pending_count`)  
**Query sugerida:**

```sql
select measured_at, pending_count
from public.event_outbox_operational_metrics;
```

### 2) Dead-letter rate (1h)

**Métrica:** `dead_lettered_count / total_attempts` na janela móvel de 1h.  
**Query sugerida:**

```sql
with base as (
  select
    count(*) filter (where status = 'dead_lettered')::numeric as dead_lettered,
    count(*)::numeric as total
  from public.event_outbox_publish_attempts
  where created_at >= now() - interval '1 hour'
)
select
  case when total = 0 then 0 else dead_lettered / total end as dead_letter_rate
from base;
```

### 3) Latência média e p95 (1h)

**Métrica:** `avg_latency_ms` e `latency_p95_ms`.  
**Query sugerida:**

```sql
select measured_at, avg_latency_ms, latency_p95_ms
from public.event_outbox_operational_metrics;
```

### 4) Taxa de retry (1h)

**Métrica:** `retry_rate`.  
**Query sugerida:**

```sql
select measured_at, retry_rate
from public.event_outbox_operational_metrics;
```

## Alertas

### Alerta A — backlog acima do limite

- **Nome:** `event_outbox_backlog_high`
- **Condição:** `pending_count > 500` por 10 minutos
- **Severidade:** warning (critical se `> 2000`)
- **Ação:** revisar health do endpoint de destino, taxa de erro e throughput do worker.

### Alerta B — dead-letter rate elevado

- **Nome:** `event_outbox_dead_letter_rate_high`
- **Condição:** `dead_letter_rate > 0.02` por 15 minutos
- **Severidade:** critical
- **Ação:** pausar consumidores afetados e iniciar runbook de reprocessamento.

### Alerta C — tempo médio de publicação elevado

- **Nome:** `event_outbox_publish_latency_high`
- **Condição:** `avg_latency_ms > 2000` por 15 minutos
- **Severidade:** warning
- **Ação:** validar latência de rede, timeout dos destinos e saturação de worker.

## Exemplo de regra (Prometheus-like)

```yaml
groups:
  - name: event-outbox-alerts
    rules:
      - alert: event_outbox_backlog_high
        expr: event_outbox_pending_count > 500
        for: 10m
        labels:
          severity: warning

      - alert: event_outbox_dead_letter_rate_high
        expr: event_outbox_dead_letter_rate_1h > 0.02
        for: 15m
        labels:
          severity: critical

      - alert: event_outbox_publish_latency_high
        expr: event_outbox_avg_latency_ms_1h > 2000
        for: 15m
        labels:
          severity: warning
```
