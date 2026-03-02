# Observabilidade de negócio e operação (KPIs, painel de caso, adapters e incidentes)

## 1) Views/materializações para KPIs de negócio

A migration `20260303123000_observability_business_kpis_and_incident_panel.sql` adiciona:

- `public.business_kpi_cycle_times` (**materialized view**)
  - Tempo até aprovação (`hours_to_approval`)
  - Tempo até formalização (`hours_to_formalization`)
  - Tempo até desembolso (`hours_to_disbursement`)
  - Aging total (`aging_hours`)

- `public.business_kpi_credit_outcomes` (**materialized view**)
  - Flags de outcome por negócio: `is_default`, `is_cured`, `is_recovered`
  - Apoio operacional via colateral: `default_packages`, `settled_packages`, `delivered_packages`

### Refresh recomendado

```sql
refresh materialized view concurrently public.business_kpi_cycle_times;
refresh materialized view concurrently public.business_kpi_credit_outcomes;
```

> Sugestão: rodar refresh a cada 5 minutos em produção, com janela mais curta em incidentes de crédito.

## 2) Painel por caso

A view `public.case_operational_panel` consolida por `deal_id`:

- etapa atual (`current_stage`) e status da etapa;
- blocker (`blocker`), priorizando `exception_cases.metadata`;
- owner (`owner_user_id`), com fallback entre exception e queue;
- próximo SLA (`next_sla_at` + `hours_to_next_sla`);
- riscos operacional, financeiro e regulatório.

Query sugerida para dashboard:

```sql
select
  tenant_id,
  deal_id,
  current_stage,
  current_stage_status,
  blocker,
  owner_user_id,
  next_sla_at,
  hours_to_next_sla,
  operational_risk,
  financial_risk,
  regulatory_risk,
  exception_case_id,
  exception_status
from public.case_operational_panel
order by hours_to_next_sla asc nulls last;
```

## 3) Métricas por adapter

A view `public.adapter_operational_metrics_1h` entrega por adapter (`destination`):

- latência (`avg_latency_ms`, `latency_p95_ms`);
- erro (`error_attempts`, `error_rate`);
- retry (`retry_attempts`);
- DLQ (`dead_letter_attempts`, `dead_letter_backlog`, `dlq_open_items`);
- backlog de integração (`integration_backlog`).

Query sugerida:

```sql
select *
from public.adapter_operational_metrics_1h
order by error_rate desc, integration_backlog desc;
```

## 4) Alertas operacionais e de negócio

### Alertas operacionais

1. `adapter_error_rate_high`
   - Condição: `error_rate > 0.08` por adapter por 10 min.
   - Severidade: warning (critical se `> 0.15`).

2. `adapter_latency_p95_high`
   - Condição: `latency_p95_ms > 2000` por adapter por 15 min.
   - Severidade: warning.

3. `adapter_dlq_open_high`
   - Condição: `dlq_open_items > 50` por adapter por 10 min.
   - Severidade: critical.

4. `case_sla_breach_imminent`
   - Condição: `hours_to_next_sla < 1` e `current_stage_status in ('pending','in_progress','blocked')`.
   - Severidade: warning.

### Alertas de negócio

1. `deal_time_to_approval_regression`
   - Condição: p95 de `hours_to_approval` acima de baseline semanal + 25%.

2. `deal_time_to_formalization_regression`
   - Condição: p95 de `hours_to_formalization` acima de baseline semanal + 25%.

3. `deal_time_to_disbursement_regression`
   - Condição: p95 de `hours_to_disbursement` acima de baseline semanal + 25%.

4. `credit_default_rate_high`
   - Condição: `sum(is_default::int)/count(*) > threshold` (threshold por tenant/produto).

5. `credit_cure_rate_drop`
   - Condição: queda > 20% na taxa de cure (janela 30d vs 90d).

## 5) Incident handling conectado com `exception_cases` e runbooks

A view `public.exception_case_incident_handling` cria uma camada pronta para incident management:

- contexto do case (`exception_case_id`, `stage`, `status`, `owner_user_id`);
- playbook armazenado no próprio case (`playbook`);
- referência de runbook (`runbook_reference`), com fallback padrão por estágio;
- prontidão operacional (`comments_count`, `evidences_count`).

Query sugerida para triagem:

```sql
select
  exception_case_id,
  tenant_id,
  deal_id,
  stage,
  status,
  owner_user_id,
  opened_at,
  runbook_reference,
  comments_count,
  evidences_count
from public.exception_case_incident_handling
where status <> 'closed'
order by opened_at asc;
```

### Runbooks mapeados

- `docs/runbooks/event-outbox-dlq-reprocess.md` (incidentes de pagamentos/outbox).
- `docs/runbooks/common-core-tenant-backfill-rollout.md` (fallback padrão para incidentes operacionais de base).
