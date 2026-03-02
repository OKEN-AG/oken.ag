-- Case management, stage queues, maker-checker, approvals and operational KPIs

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'operation_stage') THEN
    CREATE TYPE public.operation_stage AS ENUM (
      'kyc',
      'docs',
      'formalizacao',
      'pagamentos',
      'reconciliacao',
      'cobranca'
    );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'queue_status') THEN
    CREATE TYPE public.queue_status AS ENUM (
      'pending',
      'in_progress',
      'blocked',
      'completed',
      'canceled'
    );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'approval_status') THEN
    CREATE TYPE public.approval_status AS ENUM (
      'pending',
      'approved',
      'rejected',
      'overridden'
    );
  END IF;
END$$;

CREATE TABLE IF NOT EXISTS public.operation_stage_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID,
  deal_id UUID NOT NULL REFERENCES public.deals(id) ON DELETE CASCADE,
  stage public.operation_stage NOT NULL,
  queue_status public.queue_status NOT NULL DEFAULT 'pending',
  priority SMALLINT NOT NULL DEFAULT 3,
  position INTEGER,
  owner_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  maker_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  checker_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  maker_checker_required BOOLEAN NOT NULL DEFAULT true,
  maker_checker_validated_at TIMESTAMPTZ,
  rework_count INTEGER NOT NULL DEFAULT 0,
  sla_due_at TIMESTAMPTZ,
  entered_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT operation_stage_queue_priority_ck CHECK (priority BETWEEN 1 AND 5),
  CONSTRAINT operation_stage_queue_rework_non_negative_ck CHECK (rework_count >= 0),
  CONSTRAINT operation_stage_queue_maker_checker_ck CHECK (
    NOT maker_checker_required
    OR maker_user_id IS NULL
    OR checker_user_id IS NULL
    OR maker_user_id <> checker_user_id
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS operation_stage_queue_deal_stage_ux
  ON public.operation_stage_queue (deal_id, stage)
  WHERE queue_status IN ('pending', 'in_progress', 'blocked');

CREATE INDEX IF NOT EXISTS operation_stage_queue_tenant_stage_idx
  ON public.operation_stage_queue (tenant_id, stage, queue_status, entered_at);

CREATE TABLE IF NOT EXISTS public.approval_policies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID,
  policy_version TEXT NOT NULL,
  scope_stage public.operation_stage,
  rule_name TEXT NOT NULL,
  required_role TEXT,
  min_approval_level INTEGER,
  max_override_level INTEGER,
  criteria JSONB NOT NULL DEFAULT '{}'::jsonb,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT approval_policies_levels_ck CHECK (
    min_approval_level IS NULL
    OR max_override_level IS NULL
    OR max_override_level >= min_approval_level
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS approval_policies_tenant_scope_rule_version_ux
  ON public.approval_policies (tenant_id, scope_stage, rule_name, policy_version);

CREATE TABLE IF NOT EXISTS public.approval_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID,
  queue_item_id UUID NOT NULL REFERENCES public.operation_stage_queue(id) ON DELETE CASCADE,
  deal_id UUID NOT NULL REFERENCES public.deals(id) ON DELETE CASCADE,
  policy_id UUID REFERENCES public.approval_policies(id) ON DELETE SET NULL,
  policy_version TEXT NOT NULL,
  approval_status public.approval_status NOT NULL DEFAULT 'pending',
  maker_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  checker_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  required_approval_level INTEGER,
  granted_approval_level INTEGER,
  decision_reason TEXT,
  requested_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  decided_at TIMESTAMPTZ,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT approval_requests_maker_checker_ck CHECK (
    maker_user_id IS NULL
    OR checker_user_id IS NULL
    OR maker_user_id <> checker_user_id
  )
);

CREATE INDEX IF NOT EXISTS approval_requests_tenant_status_idx
  ON public.approval_requests (tenant_id, approval_status, requested_at DESC);

CREATE TABLE IF NOT EXISTS public.approval_overrides (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID,
  approval_request_id UUID NOT NULL REFERENCES public.approval_requests(id) ON DELETE CASCADE,
  policy_id UUID REFERENCES public.approval_policies(id) ON DELETE SET NULL,
  policy_version TEXT NOT NULL,
  override_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  override_level INTEGER NOT NULL,
  justification TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  CONSTRAINT approval_overrides_justification_ck CHECK (char_length(btrim(justification)) >= 15)
);

CREATE INDEX IF NOT EXISTS approval_overrides_tenant_created_idx
  ON public.approval_overrides (tenant_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.exception_cases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID,
  deal_id UUID NOT NULL REFERENCES public.deals(id) ON DELETE CASCADE,
  queue_item_id UUID REFERENCES public.operation_stage_queue(id) ON DELETE SET NULL,
  owner_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  stage public.operation_stage NOT NULL,
  policy_version TEXT,
  playbook JSONB NOT NULL DEFAULT '{}'::jsonb,
  status TEXT NOT NULL DEFAULT 'open',
  opened_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  closed_at TIMESTAMPTZ,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS exception_cases_tenant_status_idx
  ON public.exception_cases (tenant_id, status, opened_at DESC);

CREATE TABLE IF NOT EXISTS public.exception_case_comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  exception_case_id UUID NOT NULL REFERENCES public.exception_cases(id) ON DELETE CASCADE,
  author_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  comment TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT exception_case_comments_comment_ck CHECK (char_length(btrim(comment)) > 0)
);

CREATE TABLE IF NOT EXISTS public.exception_case_evidences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  exception_case_id UUID NOT NULL REFERENCES public.exception_cases(id) ON DELETE CASCADE,
  evidence_id UUID NOT NULL REFERENCES public.evidences(id) ON DELETE CASCADE,
  linked_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (exception_case_id, evidence_id)
);

CREATE OR REPLACE VIEW public."ExceptionCase" AS
SELECT
  ec.id,
  ec.tenant_id,
  ec.deal_id,
  ec.queue_item_id,
  ec.owner_user_id AS owner,
  ec.stage,
  ec.policy_version,
  ec.playbook,
  ec.status,
  ec.opened_at,
  ec.closed_at,
  ec.metadata,
  ec.created_at,
  ec.updated_at
FROM public.exception_cases ec;

CREATE TABLE IF NOT EXISTS public.core_action_audit (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID,
  action_name TEXT NOT NULL,
  aggregate_type TEXT NOT NULL,
  aggregate_id UUID,
  actor_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  policy_version TEXT,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS core_action_audit_tenant_created_idx
  ON public.core_action_audit (tenant_id, created_at DESC);

CREATE OR REPLACE FUNCTION public.prevent_immutable_changes()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'Immutable audit table: updates/deletes are not allowed';
END;
$$;

DROP TRIGGER IF EXISTS prevent_core_action_audit_update ON public.core_action_audit;
CREATE TRIGGER prevent_core_action_audit_update
  BEFORE UPDATE ON public.core_action_audit
  FOR EACH ROW EXECUTE FUNCTION public.prevent_immutable_changes();

DROP TRIGGER IF EXISTS prevent_core_action_audit_delete ON public.core_action_audit;
CREATE TRIGGER prevent_core_action_audit_delete
  BEFORE DELETE ON public.core_action_audit
  FOR EACH ROW EXECUTE FUNCTION public.prevent_immutable_changes();

CREATE OR REPLACE FUNCTION public.log_core_action(
  p_tenant_id UUID,
  p_action_name TEXT,
  p_aggregate_type TEXT,
  p_aggregate_id UUID,
  p_policy_version TEXT,
  p_payload JSONB
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.core_action_audit (
    tenant_id,
    action_name,
    aggregate_type,
    aggregate_id,
    actor_user_id,
    policy_version,
    payload
  )
  VALUES (
    p_tenant_id,
    p_action_name,
    p_aggregate_type,
    p_aggregate_id,
    auth.uid(),
    p_policy_version,
    COALESCE(p_payload, '{}'::jsonb)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.trg_log_queue_actions()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM public.log_core_action(
      NEW.tenant_id,
      'operation_stage_queue.created',
      'operation_stage_queue',
      NEW.id,
      NULL,
      jsonb_build_object('stage', NEW.stage, 'deal_id', NEW.deal_id)
    );
    RETURN NEW;
  END IF;

  PERFORM public.log_core_action(
    NEW.tenant_id,
    'operation_stage_queue.updated',
    'operation_stage_queue',
    NEW.id,
    NULL,
    jsonb_build_object(
      'stage', NEW.stage,
      'queue_status', NEW.queue_status,
      'maker_checker_validated_at', NEW.maker_checker_validated_at
    )
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS log_operation_stage_queue_actions ON public.operation_stage_queue;
CREATE TRIGGER log_operation_stage_queue_actions
  AFTER INSERT OR UPDATE ON public.operation_stage_queue
  FOR EACH ROW EXECUTE FUNCTION public.trg_log_queue_actions();

CREATE OR REPLACE FUNCTION public.trg_log_approval_actions()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM public.log_core_action(
      NEW.tenant_id,
      'approval_request.created',
      'approval_request',
      NEW.id,
      NEW.policy_version,
      jsonb_build_object('queue_item_id', NEW.queue_item_id, 'status', NEW.approval_status)
    );
  ELSE
    PERFORM public.log_core_action(
      NEW.tenant_id,
      'approval_request.updated',
      'approval_request',
      NEW.id,
      NEW.policy_version,
      jsonb_build_object('status', NEW.approval_status, 'decided_at', NEW.decided_at)
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS log_approval_actions ON public.approval_requests;
CREATE TRIGGER log_approval_actions
  AFTER INSERT OR UPDATE ON public.approval_requests
  FOR EACH ROW EXECUTE FUNCTION public.trg_log_approval_actions();

CREATE OR REPLACE FUNCTION public.trg_log_override_actions()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  PERFORM public.log_core_action(
    NEW.tenant_id,
    'approval_override.created',
    'approval_override',
    NEW.id,
    NEW.policy_version,
    jsonb_build_object('approval_request_id', NEW.approval_request_id, 'override_level', NEW.override_level)
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS log_override_actions ON public.approval_overrides;
CREATE TRIGGER log_override_actions
  AFTER INSERT ON public.approval_overrides
  FOR EACH ROW EXECUTE FUNCTION public.trg_log_override_actions();

CREATE OR REPLACE FUNCTION public.trg_log_exception_case_actions()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM public.log_core_action(
      NEW.tenant_id,
      'exception_case.created',
      'exception_case',
      NEW.id,
      NEW.policy_version,
      jsonb_build_object('deal_id', NEW.deal_id, 'stage', NEW.stage, 'owner_user_id', NEW.owner_user_id)
    );
  ELSE
    PERFORM public.log_core_action(
      NEW.tenant_id,
      'exception_case.updated',
      'exception_case',
      NEW.id,
      NEW.policy_version,
      jsonb_build_object('status', NEW.status, 'closed_at', NEW.closed_at)
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS log_exception_case_actions ON public.exception_cases;
CREATE TRIGGER log_exception_case_actions
  AFTER INSERT OR UPDATE ON public.exception_cases
  FOR EACH ROW EXECUTE FUNCTION public.trg_log_exception_case_actions();

DROP TRIGGER IF EXISTS update_operation_stage_queue_updated_at ON public.operation_stage_queue;
CREATE TRIGGER update_operation_stage_queue_updated_at
  BEFORE UPDATE ON public.operation_stage_queue
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_approval_policies_updated_at ON public.approval_policies;
CREATE TRIGGER update_approval_policies_updated_at
  BEFORE UPDATE ON public.approval_policies
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_approval_requests_updated_at ON public.approval_requests;
CREATE TRIGGER update_approval_requests_updated_at
  BEFORE UPDATE ON public.approval_requests
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_exception_cases_updated_at ON public.exception_cases;
CREATE TRIGGER update_exception_cases_updated_at
  BEFORE UPDATE ON public.exception_cases
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.operation_stage_queue ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.approval_policies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.approval_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.approval_overrides ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.exception_cases ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.exception_case_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.exception_case_evidences ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.core_action_audit ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant users can view operation_stage_queue"
  ON public.operation_stage_queue FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR tenant_id = public.current_tenant_id());

CREATE POLICY "Tenant users can manage operation_stage_queue"
  ON public.operation_stage_queue FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR tenant_id = public.current_tenant_id())
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR tenant_id = public.current_tenant_id());

CREATE POLICY "Tenant users can view approval_policies"
  ON public.approval_policies FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR tenant_id = public.current_tenant_id());

CREATE POLICY "Admins manage approval_policies"
  ON public.approval_policies FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Tenant users can view approval_requests"
  ON public.approval_requests FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR tenant_id = public.current_tenant_id());

CREATE POLICY "Tenant users can manage approval_requests"
  ON public.approval_requests FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR tenant_id = public.current_tenant_id())
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR tenant_id = public.current_tenant_id());

CREATE POLICY "Tenant users can view approval_overrides"
  ON public.approval_overrides FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR tenant_id = public.current_tenant_id());

CREATE POLICY "Tenant users can insert approval_overrides"
  ON public.approval_overrides FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR tenant_id = public.current_tenant_id());

CREATE POLICY "Tenant users can view exception_cases"
  ON public.exception_cases FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR tenant_id = public.current_tenant_id());

CREATE POLICY "Tenant users can manage exception_cases"
  ON public.exception_cases FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR tenant_id = public.current_tenant_id())
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR tenant_id = public.current_tenant_id());

CREATE POLICY "Tenant users can view exception_case_comments"
  ON public.exception_case_comments FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin')
    OR EXISTS (
      SELECT 1
      FROM public.exception_cases ec
      WHERE ec.id = exception_case_comments.exception_case_id
        AND ec.tenant_id = public.current_tenant_id()
    )
  );

CREATE POLICY "Tenant users can manage exception_case_comments"
  ON public.exception_case_comments FOR ALL TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin')
    OR EXISTS (
      SELECT 1
      FROM public.exception_cases ec
      WHERE ec.id = exception_case_comments.exception_case_id
        AND ec.tenant_id = public.current_tenant_id()
    )
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'admin')
    OR EXISTS (
      SELECT 1
      FROM public.exception_cases ec
      WHERE ec.id = exception_case_comments.exception_case_id
        AND ec.tenant_id = public.current_tenant_id()
    )
  );

CREATE POLICY "Tenant users can view exception_case_evidences"
  ON public.exception_case_evidences FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin')
    OR EXISTS (
      SELECT 1
      FROM public.exception_cases ec
      WHERE ec.id = exception_case_evidences.exception_case_id
        AND ec.tenant_id = public.current_tenant_id()
    )
  );

CREATE POLICY "Tenant users can manage exception_case_evidences"
  ON public.exception_case_evidences FOR ALL TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin')
    OR EXISTS (
      SELECT 1
      FROM public.exception_cases ec
      WHERE ec.id = exception_case_evidences.exception_case_id
        AND ec.tenant_id = public.current_tenant_id()
    )
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'admin')
    OR EXISTS (
      SELECT 1
      FROM public.exception_cases ec
      WHERE ec.id = exception_case_evidences.exception_case_id
        AND ec.tenant_id = public.current_tenant_id()
    )
  );

CREATE POLICY "Tenant users can view core_action_audit"
  ON public.core_action_audit FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR tenant_id = public.current_tenant_id());

CREATE POLICY "System inserts core_action_audit"
  ON public.core_action_audit FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR tenant_id = public.current_tenant_id());

CREATE OR REPLACE VIEW public.operational_kpis AS
SELECT
  q.tenant_id,
  q.stage,
  COUNT(*) AS total_cases,
  COUNT(*) FILTER (WHERE q.queue_status IN ('pending', 'in_progress', 'blocked')) AS open_cases,
  ROUND(AVG(EXTRACT(EPOCH FROM (COALESCE(q.completed_at, now()) - q.entered_at)) / 3600.0)::numeric, 2) AS avg_stage_time_hours,
  ROUND(AVG(
    CASE
      WHEN q.queue_status IN ('pending', 'in_progress', 'blocked')
      THEN EXTRACT(EPOCH FROM (now() - q.entered_at)) / 3600.0
      ELSE NULL
    END
  )::numeric, 2) AS avg_aging_hours,
  ROUND(
    COALESCE(
      COUNT(DISTINCT ec.id)::numeric / NULLIF(COUNT(*)::numeric, 0),
      0
    ),
    4
  ) AS exception_rate,
  ROUND(
    COALESCE(
      COUNT(*) FILTER (WHERE q.rework_count > 0)::numeric / NULLIF(COUNT(*)::numeric, 0),
      0
    ),
    4
  ) AS rework_rate
FROM public.operation_stage_queue q
LEFT JOIN public.exception_cases ec
  ON ec.queue_item_id = q.id
GROUP BY q.tenant_id, q.stage;
