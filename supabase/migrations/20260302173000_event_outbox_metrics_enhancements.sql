-- Event outbox observability enhancements: publish-time and failures by destination

ALTER TABLE public.event_outbox_dlq
  ADD COLUMN IF NOT EXISTS last_error TEXT;

UPDATE public.event_outbox_dlq
SET last_error = COALESCE(error_payload->>'message', last_error)
WHERE last_error IS NULL;

ALTER TABLE public.event_outbox_publish_attempts
  ADD COLUMN IF NOT EXISTS publish_time_ms INTEGER CHECK (publish_time_ms >= 0);

CREATE OR REPLACE FUNCTION public.event_outbox_to_dead_letter(
  p_outbox_id UUID,
  p_error_payload JSONB,
  p_error_stack TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_outbox public.event_outbox%ROWTYPE;
  v_event_payload JSONB;
BEGIN
  SELECT * INTO v_outbox
  FROM public.event_outbox eo
  WHERE eo.id = p_outbox_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'event_outbox entry % not found', p_outbox_id;
  END IF;

  SELECT be.payload INTO v_event_payload
  FROM public.business_events be
  WHERE be.id = v_outbox.business_event_id;

  UPDATE public.event_outbox
  SET
    status = 'dead_lettered',
    next_retry_at = NULL,
    last_error = COALESCE(p_error_payload->>'message', last_error),
    updated_at = now()
  WHERE id = v_outbox.id;

  INSERT INTO public.event_outbox_dlq (
    outbox_id,
    business_event_id,
    destination,
    payload,
    error_payload,
    last_error,
    error_stack,
    failed_at
  ) VALUES (
    v_outbox.id,
    v_outbox.business_event_id,
    v_outbox.destination,
    COALESCE(v_event_payload, '{}'::jsonb),
    COALESCE(p_error_payload, '{}'::jsonb),
    COALESCE(p_error_payload->>'message', NULL),
    p_error_stack,
    now()
  )
  ON CONFLICT (outbox_id)
  DO UPDATE SET
    error_payload = EXCLUDED.error_payload,
    last_error = EXCLUDED.last_error,
    error_stack = EXCLUDED.error_stack,
    failed_at = EXCLUDED.failed_at;
END;
$$;

CREATE OR REPLACE VIEW public.event_outbox_operational_metrics AS
WITH backlog AS (
  SELECT
    COUNT(*) FILTER (WHERE status = 'pending')::bigint AS pending_count,
    COUNT(*) FILTER (WHERE status = 'failed')::bigint AS failed_count,
    COUNT(*) FILTER (WHERE status = 'dead_lettered')::bigint AS dead_lettered_count
  FROM public.event_outbox
),
attempts_1h AS (
  SELECT
    COUNT(*)::bigint AS total_attempts,
    COUNT(*) FILTER (WHERE attempt_no > 1)::bigint AS retry_attempts,
    COALESCE(percentile_cont(0.95) WITHIN GROUP (ORDER BY latency_ms), 0)::numeric(12,2) AS latency_p95_ms,
    COALESCE(AVG(latency_ms), 0)::numeric(12,2) AS avg_latency_ms,
    COALESCE(percentile_cont(0.95) WITHIN GROUP (ORDER BY publish_time_ms) FILTER (WHERE publish_time_ms IS NOT NULL), 0)::numeric(12,2) AS publish_time_p95_ms,
    COALESCE(AVG(publish_time_ms) FILTER (WHERE publish_time_ms IS NOT NULL), 0)::numeric(12,2) AS avg_publish_time_ms
  FROM public.event_outbox_publish_attempts
  WHERE created_at >= now() - interval '1 hour'
)
SELECT
  b.pending_count,
  b.failed_count,
  b.dead_lettered_count,
  a.total_attempts,
  a.retry_attempts,
  CASE
    WHEN a.total_attempts = 0 THEN 0::numeric(10,4)
    ELSE (a.retry_attempts::numeric / a.total_attempts::numeric)
  END AS retry_rate,
  a.latency_p95_ms,
  a.avg_latency_ms,
  a.publish_time_p95_ms,
  a.avg_publish_time_ms,
  now() AS measured_at
FROM backlog b
CROSS JOIN attempts_1h a;

CREATE OR REPLACE VIEW public.event_outbox_destination_failures_1h AS
SELECT
  destination,
  COUNT(*) FILTER (WHERE status IN ('retry', 'dead_lettered'))::bigint AS failed_attempts,
  COUNT(*)::bigint AS total_attempts,
  CASE
    WHEN COUNT(*) = 0 THEN 0::numeric(10,4)
    ELSE (COUNT(*) FILTER (WHERE status IN ('retry', 'dead_lettered'))::numeric / COUNT(*)::numeric)
  END AS failure_rate,
  MAX(created_at) AS last_attempt_at
FROM public.event_outbox_publish_attempts
WHERE created_at >= now() - interval '1 hour'
GROUP BY destination
ORDER BY failed_attempts DESC, destination;
