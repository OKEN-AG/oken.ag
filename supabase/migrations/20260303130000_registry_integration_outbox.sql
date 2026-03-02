-- Registry integration backbone: endpoints, requests/callbacks/reconciliation,
-- dedicated outbox with destination-scoped DLQ and status normalization.

CREATE TABLE IF NOT EXISTS public.registry_endpoints (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID,
  provider TEXT NOT NULL,
  endpoint_type TEXT NOT NULL CHECK (endpoint_type IN ('request', 'callback', 'status_sync')),
  destination TEXT NOT NULL,
  auth_type TEXT NOT NULL DEFAULT 'none' CHECK (auth_type IN ('none', 'bearer', 'basic', 'mtls')),
  auth_config JSONB NOT NULL DEFAULT '{}'::jsonb,
  timeout_ms INTEGER NOT NULL DEFAULT 8000 CHECK (timeout_ms >= 100),
  max_attempts INTEGER NOT NULL DEFAULT 8 CHECK (max_attempts >= 1),
  base_backoff_ms INTEGER NOT NULL DEFAULT 1000 CHECK (base_backoff_ms >= 100),
  is_active BOOLEAN NOT NULL DEFAULT true,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, provider, endpoint_type)
);

CREATE INDEX IF NOT EXISTS registry_endpoints_active_idx
  ON public.registry_endpoints (provider, endpoint_type)
  WHERE is_active;

CREATE TABLE IF NOT EXISTS public.registry_status_mappings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID,
  provider TEXT NOT NULL,
  external_status TEXT NOT NULL,
  canonical_status public.document_status NOT NULL,
  requirement_flag BOOLEAN NOT NULL DEFAULT false,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, provider, external_status)
);

CREATE INDEX IF NOT EXISTS registry_status_mappings_lookup_idx
  ON public.registry_status_mappings (provider, external_status);

CREATE OR REPLACE FUNCTION public.map_registry_external_status(
  p_provider TEXT,
  p_external_status TEXT,
  p_tenant_id UUID DEFAULT NULL
)
RETURNS public.document_status
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT COALESCE(
    (
      SELECT rsm.canonical_status
      FROM public.registry_status_mappings rsm
      WHERE rsm.provider = p_provider
        AND lower(rsm.external_status) = lower(p_external_status)
        AND (
          (p_tenant_id IS NOT NULL AND rsm.tenant_id = p_tenant_id)
          OR rsm.tenant_id IS NULL
        )
      ORDER BY CASE WHEN rsm.tenant_id IS NULL THEN 1 ELSE 0 END, rsm.created_at DESC
      LIMIT 1
    ),
    'pendente'::public.document_status
  );
$$;

CREATE TABLE IF NOT EXISTS public.registry_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID,
  operation_id UUID REFERENCES public.operations(id) ON DELETE SET NULL,
  document_id UUID REFERENCES public.operation_documents(id) ON DELETE SET NULL,
  endpoint_id UUID REFERENCES public.registry_endpoints(id) ON DELETE SET NULL,
  provider TEXT NOT NULL,
  request_type TEXT NOT NULL DEFAULT 'registration' CHECK (request_type IN ('registration', 'status_sync')),
  idempotency_key TEXT NOT NULL,
  payload JSONB NOT NULL,
  external_request_id TEXT,
  external_status TEXT,
  canonical_status public.document_status NOT NULL DEFAULT 'pendente',
  requirement_flag BOOLEAN NOT NULL DEFAULT false,
  requested_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  responded_at TIMESTAMPTZ,
  correlation_id TEXT,
  error_payload JSONB,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (provider, idempotency_key)
);

CREATE INDEX IF NOT EXISTS registry_requests_operation_idx
  ON public.registry_requests (operation_id, requested_at DESC);

CREATE INDEX IF NOT EXISTS registry_requests_status_idx
  ON public.registry_requests (provider, canonical_status, requested_at DESC);

CREATE TABLE IF NOT EXISTS public.registry_callbacks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID,
  endpoint_id UUID REFERENCES public.registry_endpoints(id) ON DELETE SET NULL,
  request_id UUID REFERENCES public.registry_requests(id) ON DELETE SET NULL,
  provider TEXT NOT NULL,
  callback_ref TEXT,
  external_status TEXT,
  canonical_status public.document_status NOT NULL DEFAULT 'pendente',
  requirement_flag BOOLEAN NOT NULL DEFAULT false,
  payload JSONB NOT NULL,
  headers JSONB NOT NULL DEFAULT '{}'::jsonb,
  processed_at TIMESTAMPTZ,
  received_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS registry_callbacks_request_idx
  ON public.registry_callbacks (request_id, received_at DESC);

CREATE TABLE IF NOT EXISTS public.registry_reconciliation (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID,
  provider TEXT NOT NULL,
  operation_id UUID REFERENCES public.operations(id) ON DELETE SET NULL,
  request_id UUID REFERENCES public.registry_requests(id) ON DELETE SET NULL,
  callback_id UUID REFERENCES public.registry_callbacks(id) ON DELETE SET NULL,
  source TEXT NOT NULL CHECK (source IN ('request', 'callback', 'status_sync', 'manual')),
  external_status TEXT,
  canonical_status public.document_status NOT NULL,
  requirement_flag BOOLEAN NOT NULL DEFAULT false,
  divergence BOOLEAN NOT NULL DEFAULT false,
  divergence_reasons JSONB NOT NULL DEFAULT '[]'::jsonb,
  details JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS registry_reconciliation_provider_idx
  ON public.registry_reconciliation (provider, created_at DESC);

CREATE TABLE IF NOT EXISTS public.registry_event_outbox (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  registry_request_id UUID NOT NULL REFERENCES public.registry_requests(id) ON DELETE CASCADE,
  endpoint_id UUID REFERENCES public.registry_endpoints(id) ON DELETE SET NULL,
  destination TEXT NOT NULL,
  payload JSONB NOT NULL,
  status public.event_status NOT NULL DEFAULT 'pending',
  attempts INTEGER NOT NULL DEFAULT 0,
  next_retry_at TIMESTAMPTZ,
  last_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (registry_request_id, destination)
);

CREATE INDEX IF NOT EXISTS registry_event_outbox_status_idx
  ON public.registry_event_outbox (status, next_retry_at, created_at);

CREATE TABLE IF NOT EXISTS public.registry_event_outbox_publish_attempts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  outbox_id UUID NOT NULL REFERENCES public.registry_event_outbox(id) ON DELETE CASCADE,
  registry_request_id UUID NOT NULL REFERENCES public.registry_requests(id) ON DELETE CASCADE,
  destination TEXT NOT NULL,
  attempt_no INTEGER NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('success', 'retry', 'dead_lettered')),
  latency_ms INTEGER NOT NULL CHECK (latency_ms >= 0),
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS registry_outbox_attempts_dest_idx
  ON public.registry_event_outbox_publish_attempts (destination, created_at DESC);

CREATE TABLE IF NOT EXISTS public.registry_event_outbox_dlq (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  outbox_id UUID NOT NULL REFERENCES public.registry_event_outbox(id) ON DELETE CASCADE,
  registry_request_id UUID NOT NULL REFERENCES public.registry_requests(id) ON DELETE CASCADE,
  destination TEXT NOT NULL,
  payload JSONB NOT NULL,
  error_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  error_stack TEXT,
  last_error TEXT,
  failed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  reprocessed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (outbox_id)
);

CREATE INDEX IF NOT EXISTS registry_outbox_dlq_dest_open_idx
  ON public.registry_event_outbox_dlq (destination, failed_at DESC)
  WHERE reprocessed_at IS NULL;

CREATE OR REPLACE FUNCTION public.registry_event_outbox_to_dead_letter(
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
  v_outbox public.registry_event_outbox%ROWTYPE;
BEGIN
  SELECT * INTO v_outbox
  FROM public.registry_event_outbox reo
  WHERE reo.id = p_outbox_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'registry_event_outbox entry % not found', p_outbox_id;
  END IF;

  UPDATE public.registry_event_outbox
  SET
    status = 'dead_lettered',
    next_retry_at = NULL,
    last_error = COALESCE(p_error_payload->>'message', last_error),
    updated_at = now()
  WHERE id = v_outbox.id;

  INSERT INTO public.registry_event_outbox_dlq (
    outbox_id,
    registry_request_id,
    destination,
    payload,
    error_payload,
    error_stack,
    last_error,
    failed_at
  ) VALUES (
    v_outbox.id,
    v_outbox.registry_request_id,
    v_outbox.destination,
    COALESCE(v_outbox.payload, '{}'::jsonb),
    COALESCE(p_error_payload, '{}'::jsonb),
    p_error_stack,
    COALESCE(p_error_payload->>'message', NULL),
    now()
  )
  ON CONFLICT (outbox_id)
  DO UPDATE SET
    error_payload = EXCLUDED.error_payload,
    error_stack = EXCLUDED.error_stack,
    last_error = EXCLUDED.last_error,
    failed_at = EXCLUDED.failed_at;
END;
$$;

CREATE OR REPLACE FUNCTION public.update_registry_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS update_registry_endpoints_updated_at ON public.registry_endpoints;
CREATE TRIGGER update_registry_endpoints_updated_at
  BEFORE UPDATE ON public.registry_endpoints
  FOR EACH ROW
  EXECUTE FUNCTION public.update_registry_updated_at();

DROP TRIGGER IF EXISTS update_registry_status_mappings_updated_at ON public.registry_status_mappings;
CREATE TRIGGER update_registry_status_mappings_updated_at
  BEFORE UPDATE ON public.registry_status_mappings
  FOR EACH ROW
  EXECUTE FUNCTION public.update_registry_updated_at();

DROP TRIGGER IF EXISTS update_registry_requests_updated_at ON public.registry_requests;
CREATE TRIGGER update_registry_requests_updated_at
  BEFORE UPDATE ON public.registry_requests
  FOR EACH ROW
  EXECUTE FUNCTION public.update_registry_updated_at();

ALTER TABLE public.registry_endpoints ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.registry_status_mappings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.registry_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.registry_callbacks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.registry_reconciliation ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.registry_event_outbox ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.registry_event_outbox_publish_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.registry_event_outbox_dlq ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage registry endpoints"
  ON public.registry_endpoints FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE POLICY "Admins can manage registry status mappings"
  ON public.registry_status_mappings FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE POLICY "Tenant users can view registry requests"
  ON public.registry_requests FOR SELECT TO authenticated
  USING (
    tenant_id IS NULL OR public.can_access_tenant(tenant_id)
  );

CREATE POLICY "Admins can manage registry requests"
  ON public.registry_requests FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE POLICY "Tenant users can view registry callbacks"
  ON public.registry_callbacks FOR SELECT TO authenticated
  USING (
    tenant_id IS NULL OR public.can_access_tenant(tenant_id)
  );

CREATE POLICY "Admins can manage registry callbacks"
  ON public.registry_callbacks FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE POLICY "Tenant users can view registry reconciliation"
  ON public.registry_reconciliation FOR SELECT TO authenticated
  USING (
    tenant_id IS NULL OR public.can_access_tenant(tenant_id)
  );

CREATE POLICY "Admins can manage registry reconciliation"
  ON public.registry_reconciliation FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE POLICY "Tenant users can view registry outbox"
  ON public.registry_event_outbox FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.registry_requests rr
      WHERE rr.id = registry_event_outbox.registry_request_id
        AND (rr.tenant_id IS NULL OR public.can_access_tenant(rr.tenant_id))
    )
  );

CREATE POLICY "Admins can manage registry outbox"
  ON public.registry_event_outbox FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE POLICY "Tenant users can view registry outbox attempts"
  ON public.registry_event_outbox_publish_attempts FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.registry_requests rr
      WHERE rr.id = registry_event_outbox_publish_attempts.registry_request_id
        AND (rr.tenant_id IS NULL OR public.can_access_tenant(rr.tenant_id))
    )
  );

CREATE POLICY "Admins can manage registry outbox attempts"
  ON public.registry_event_outbox_publish_attempts FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE POLICY "Tenant users can view registry outbox dlq"
  ON public.registry_event_outbox_dlq FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.registry_requests rr
      WHERE rr.id = registry_event_outbox_dlq.registry_request_id
        AND (rr.tenant_id IS NULL OR public.can_access_tenant(rr.tenant_id))
    )
  );

CREATE POLICY "Admins can manage registry outbox dlq"
  ON public.registry_event_outbox_dlq FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

INSERT INTO public.registry_status_mappings (tenant_id, provider, external_status, canonical_status, requirement_flag, metadata)
VALUES
  (NULL, 'default', 'submitted', 'pendente', false, '{"seed":true}'::jsonb),
  (NULL, 'default', 'in_analysis', 'em_analise', false, '{"seed":true}'::jsonb),
  (NULL, 'default', 'registered', 'registrado', false, '{"seed":true}'::jsonb),
  (NULL, 'default', 'rejected', 'reprovado', true, '{"seed":true,"reason":"requirement_or_rejection"}'::jsonb),
  (NULL, 'default', 'cancelled', 'cancelado', false, '{"seed":true}'::jsonb)
ON CONFLICT (tenant_id, provider, external_status) DO NOTHING;
