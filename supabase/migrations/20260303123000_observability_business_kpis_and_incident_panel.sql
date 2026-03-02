-- Business KPI materializations, case panel, adapter metrics and incident/runbook linkage

DROP MATERIALIZED VIEW IF EXISTS public.business_kpi_cycle_times;
CREATE MATERIALIZED VIEW public.business_kpi_cycle_times AS
WITH approval_events AS (
  SELECT
    ar.deal_id,
    MIN(ar.requested_at) AS first_approval_requested_at,
    MIN(ar.decided_at) FILTER (WHERE ar.approval_status IN ('approved', 'overridden')) AS first_approval_decided_at
  FROM public.approval_requests ar
  GROUP BY ar.deal_id
),
formalization_events AS (
  SELECT
    q.deal_id,
    MIN(q.entered_at) FILTER (WHERE q.stage = 'formalizacao') AS formalization_entered_at,
    MIN(q.completed_at) FILTER (WHERE q.stage = 'formalizacao') AS formalization_completed_at,
    MIN(q.completed_at) FILTER (WHERE q.stage = 'pagamentos') AS disbursement_completed_at,
    MAX(q.completed_at) FILTER (WHERE q.queue_status = 'completed') AS last_stage_completed_at
  FROM public.operation_stage_queue q
  GROUP BY q.deal_id
)
SELECT
  d.tenant_id,
  d.id AS deal_id,
  d.status AS deal_status,
  d.created_at AS deal_created_at,
  ae.first_approval_requested_at,
  ae.first_approval_decided_at,
  fe.formalization_entered_at,
  fe.formalization_completed_at,
  fe.disbursement_completed_at,
  ROUND((EXTRACT(EPOCH FROM (ae.first_approval_decided_at - d.created_at)) / 3600.0)::numeric, 2) AS hours_to_approval,
  ROUND((EXTRACT(EPOCH FROM (fe.formalization_completed_at - d.created_at)) / 3600.0)::numeric, 2) AS hours_to_formalization,
  ROUND((EXTRACT(EPOCH FROM (fe.disbursement_completed_at - d.created_at)) / 3600.0)::numeric, 2) AS hours_to_disbursement,
  ROUND((EXTRACT(EPOCH FROM (COALESCE(fe.last_stage_completed_at, now()) - d.created_at)) / 3600.0)::numeric, 2) AS aging_hours,
  now() AS measured_at
FROM public.deals d
LEFT JOIN approval_events ae ON ae.deal_id = d.id
LEFT JOIN formalization_events fe ON fe.deal_id = d.id;

CREATE UNIQUE INDEX business_kpi_cycle_times_deal_ux
  ON public.business_kpi_cycle_times (deal_id);

DROP MATERIALIZED VIEW IF EXISTS public.business_kpi_credit_outcomes;
CREATE MATERIALIZED VIEW public.business_kpi_credit_outcomes AS
WITH collateral_rollup AS (
  SELECT
    o.tenant_id,
    o.deal_id,
    COUNT(*) FILTER (WHERE cp.status = 'default')::bigint AS default_packages,
    COUNT(*) FILTER (WHERE cp.status = 'settled')::bigint AS settled_packages,
    COUNT(*) FILTER (WHERE cp.status = 'delivered')::bigint AS delivered_packages
  FROM public.collateral_packages cp
  JOIN public.operations o ON o.id = cp.operation_id
  WHERE o.deal_id IS NOT NULL
  GROUP BY o.tenant_id, o.deal_id
)
SELECT
  d.tenant_id,
  d.id AS deal_id,
  (
    COALESCE((d.metadata ->> 'credit_status') = 'default', false)
    OR COALESCE(cr.default_packages, 0) > 0
  ) AS is_default,
  (
    COALESCE((d.metadata ->> 'credit_status') = 'cured', false)
    OR (d.metadata ? 'cure_at')
  ) AS is_cured,
  (
    COALESCE((d.metadata ->> 'credit_status') = 'recovered', false)
    OR CASE
      WHEN COALESCE(d.metadata ->> 'recovery_amount', '') ~ '^-?\d+(\.\d+)?$'
      THEN (d.metadata ->> 'recovery_amount')::numeric > 0
      ELSE false
    END
  ) AS is_recovered,
  COALESCE(cr.default_packages, 0) AS default_packages,
  COALESCE(cr.settled_packages, 0) AS settled_packages,
  COALESCE(cr.delivered_packages, 0) AS delivered_packages,
  now() AS measured_at
FROM public.deals d
LEFT JOIN collateral_rollup cr ON cr.deal_id = d.id;

CREATE UNIQUE INDEX business_kpi_credit_outcomes_deal_ux
  ON public.business_kpi_credit_outcomes (deal_id);

CREATE OR REPLACE VIEW public.case_operational_panel AS
WITH active_queue AS (
  SELECT DISTINCT ON (q.deal_id)
    q.id,
    q.tenant_id,
    q.deal_id,
    q.stage,
    q.queue_status,
    q.owner_user_id,
    q.sla_due_at,
    q.entered_at,
    q.metadata
  FROM public.operation_stage_queue q
  WHERE q.queue_status IN ('pending', 'in_progress', 'blocked')
  ORDER BY q.deal_id, q.priority ASC, q.entered_at ASC
),
latest_open_exception AS (
  SELECT DISTINCT ON (ec.deal_id)
    ec.id,
    ec.deal_id,
    ec.owner_user_id,
    ec.status,
    ec.opened_at,
    ec.playbook,
    ec.metadata
  FROM public.exception_cases ec
  WHERE ec.status <> 'closed'
  ORDER BY ec.deal_id, ec.opened_at DESC
)
SELECT
  aq.tenant_id,
  aq.deal_id,
  aq.stage AS current_stage,
  aq.queue_status AS current_stage_status,
  COALESCE(loe.metadata ->> 'blocker', aq.metadata ->> 'blocker_reason', 'none') AS blocker,
  COALESCE(loe.owner_user_id, aq.owner_user_id) AS owner_user_id,
  aq.sla_due_at AS next_sla_at,
  ROUND((EXTRACT(EPOCH FROM (COALESCE(aq.sla_due_at, now()) - now())) / 3600.0)::numeric, 2) AS hours_to_next_sla,
  COALESCE(loe.metadata ->> 'operational_risk', aq.metadata ->> 'operational_risk', 'unknown') AS operational_risk,
  COALESCE(loe.metadata ->> 'financial_risk', aq.metadata ->> 'financial_risk', 'unknown') AS financial_risk,
  COALESCE(loe.metadata ->> 'regulatory_risk', aq.metadata ->> 'regulatory_risk', 'unknown') AS regulatory_risk,
  loe.id AS exception_case_id,
  loe.status AS exception_status,
  loe.playbook AS incident_playbook,
  now() AS measured_at
FROM active_queue aq
LEFT JOIN latest_open_exception loe
  ON loe.deal_id = aq.deal_id;

CREATE OR REPLACE VIEW public.adapter_operational_metrics_1h AS
WITH attempts AS (
  SELECT
    eopa.destination AS adapter_name,
    COUNT(*)::bigint AS total_attempts,
    COUNT(*) FILTER (WHERE eopa.status = 'success')::bigint AS success_attempts,
    COUNT(*) FILTER (WHERE eopa.status IN ('retry', 'dead_lettered'))::bigint AS error_attempts,
    COUNT(*) FILTER (WHERE eopa.status = 'retry')::bigint AS retry_attempts,
    COUNT(*) FILTER (WHERE eopa.status = 'dead_lettered')::bigint AS dead_letter_attempts,
    COALESCE(AVG(eopa.latency_ms), 0)::numeric(12,2) AS avg_latency_ms,
    COALESCE(percentile_cont(0.95) WITHIN GROUP (ORDER BY eopa.latency_ms), 0)::numeric(12,2) AS latency_p95_ms,
    MAX(eopa.created_at) AS last_attempt_at
  FROM public.event_outbox_publish_attempts eopa
  WHERE eopa.created_at >= now() - interval '1 hour'
  GROUP BY eopa.destination
),
backlog AS (
  SELECT
    eo.destination AS adapter_name,
    COUNT(*) FILTER (WHERE eo.status IN ('pending', 'failed'))::bigint AS integration_backlog,
    COUNT(*) FILTER (WHERE eo.status = 'dead_lettered')::bigint AS dead_letter_backlog
  FROM public.event_outbox eo
  GROUP BY eo.destination
),
dlq_open AS (
  SELECT
    dlq.destination AS adapter_name,
    COUNT(*) FILTER (WHERE dlq.reprocessed_at IS NULL)::bigint AS dlq_open_items
  FROM public.event_outbox_dlq dlq
  GROUP BY dlq.destination
)
SELECT
  COALESCE(a.adapter_name, b.adapter_name, d.adapter_name) AS adapter_name,
  COALESCE(a.total_attempts, 0) AS total_attempts,
  COALESCE(a.success_attempts, 0) AS success_attempts,
  COALESCE(a.error_attempts, 0) AS error_attempts,
  COALESCE(a.retry_attempts, 0) AS retry_attempts,
  COALESCE(a.dead_letter_attempts, 0) AS dead_letter_attempts,
  CASE
    WHEN COALESCE(a.total_attempts, 0) = 0 THEN 0::numeric(10,4)
    ELSE COALESCE(a.error_attempts, 0)::numeric / a.total_attempts::numeric
  END AS error_rate,
  COALESCE(a.avg_latency_ms, 0)::numeric(12,2) AS avg_latency_ms,
  COALESCE(a.latency_p95_ms, 0)::numeric(12,2) AS latency_p95_ms,
  COALESCE(b.integration_backlog, 0) AS integration_backlog,
  COALESCE(b.dead_letter_backlog, 0) AS dead_letter_backlog,
  COALESCE(d.dlq_open_items, 0) AS dlq_open_items,
  a.last_attempt_at,
  now() AS measured_at
FROM attempts a
FULL OUTER JOIN backlog b ON b.adapter_name = a.adapter_name
FULL OUTER JOIN dlq_open d ON d.adapter_name = COALESCE(a.adapter_name, b.adapter_name);

CREATE OR REPLACE VIEW public.exception_case_incident_handling AS
SELECT
  ec.id AS exception_case_id,
  ec.tenant_id,
  ec.deal_id,
  ec.stage,
  ec.status,
  ec.owner_user_id,
  ec.opened_at,
  ec.closed_at,
  ec.playbook,
  COALESCE(ec.playbook ->> 'runbook',
           CASE
             WHEN ec.stage = 'pagamentos' THEN 'docs/runbooks/event-outbox-dlq-reprocess.md'
             ELSE 'docs/runbooks/common-core-tenant-backfill-rollout.md'
           END) AS runbook_reference,
  COUNT(ecc.id)::bigint AS comments_count,
  COUNT(ece.id)::bigint AS evidences_count,
  now() AS measured_at
FROM public.exception_cases ec
LEFT JOIN public.exception_case_comments ecc
  ON ecc.exception_case_id = ec.id
LEFT JOIN public.exception_case_evidences ece
  ON ece.exception_case_id = ec.id
GROUP BY ec.id;
