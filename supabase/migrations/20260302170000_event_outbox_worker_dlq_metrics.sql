-- Event outbox worker: DLQ, retries and observability primitives

CREATE TABLE IF NOT EXISTS public.event_outbox_dlq (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  outbox_id UUID NOT NULL REFERENCES public.event_outbox(id) ON DELETE CASCADE,
  business_event_id UUID NOT NULL REFERENCES public.business_events(id) ON DELETE CASCADE,
  destination TEXT NOT NULL,
  payload JSONB NOT NULL,
  error_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  error_stack TEXT,
  failed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  reprocessed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (outbox_id)
);

CREATE INDEX IF NOT EXISTS event_outbox_dlq_failed_at_idx
  ON public.event_outbox_dlq (failed_at DESC);

CREATE INDEX IF NOT EXISTS event_outbox_dlq_reprocessed_idx
  ON public.event_outbox_dlq (reprocessed_at)
  WHERE reprocessed_at IS NULL;

CREATE TABLE IF NOT EXISTS public.event_outbox_publish_attempts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  outbox_id UUID NOT NULL REFERENCES public.event_outbox(id) ON DELETE CASCADE,
  business_event_id UUID NOT NULL REFERENCES public.business_events(id) ON DELETE CASCADE,
  destination TEXT NOT NULL,
  attempt_no INTEGER NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('success', 'retry', 'dead_lettered')),
  latency_ms INTEGER NOT NULL CHECK (latency_ms >= 0),
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS event_outbox_attempts_created_idx
  ON public.event_outbox_publish_attempts (created_at DESC);

CREATE INDEX IF NOT EXISTS event_outbox_attempts_status_idx
  ON public.event_outbox_publish_attempts (status, created_at DESC);

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
    error_stack,
    failed_at
  ) VALUES (
    v_outbox.id,
    v_outbox.business_event_id,
    v_outbox.destination,
    COALESCE(v_event_payload, '{}'::jsonb),
    COALESCE(p_error_payload, '{}'::jsonb),
    p_error_stack,
    now()
  )
  ON CONFLICT (outbox_id)
  DO UPDATE SET
    error_payload = EXCLUDED.error_payload,
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
    COALESCE(
      percentile_cont(0.95) WITHIN GROUP (ORDER BY latency_ms),
      0
    )::numeric(12,2) AS latency_p95_ms,
    AVG(latency_ms)::numeric(12,2) AS avg_latency_ms
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
  COALESCE(a.avg_latency_ms, 0)::numeric(12,2) AS avg_latency_ms,
  now() AS measured_at
FROM backlog b
CROSS JOIN attempts_1h a;

ALTER TABLE public.event_outbox_dlq ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.event_outbox_publish_attempts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Tenant users can view event outbox dlq" ON public.event_outbox_dlq;
CREATE POLICY "Tenant users can view event outbox dlq"
  ON public.event_outbox_dlq FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.business_events be
      WHERE be.id = event_outbox_dlq.business_event_id
        AND public.can_access_tenant(be.tenant_id)
    )
  );

DROP POLICY IF EXISTS "Admins can manage event outbox dlq" ON public.event_outbox_dlq;
CREATE POLICY "Admins can manage event outbox dlq"
  ON public.event_outbox_dlq FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

DROP POLICY IF EXISTS "Tenant users can view outbox publish attempts" ON public.event_outbox_publish_attempts;
CREATE POLICY "Tenant users can view outbox publish attempts"
  ON public.event_outbox_publish_attempts FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.business_events be
      WHERE be.id = event_outbox_publish_attempts.business_event_id
        AND public.can_access_tenant(be.tenant_id)
    )
  );

DROP POLICY IF EXISTS "Admins can manage outbox publish attempts" ON public.event_outbox_publish_attempts;
CREATE POLICY "Admins can manage outbox publish attempts"
  ON public.event_outbox_publish_attempts FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));
