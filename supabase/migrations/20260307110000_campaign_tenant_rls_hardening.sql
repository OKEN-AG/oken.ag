-- Campaign/tenant hardening:
-- 1) tenant_id obrigatório em tabelas de negócio com campaign_id
-- 2) índices compostos (tenant_id, campaign_id)
-- 3) RLS por tenant/profile claim
-- 4) RPC para mutação sensível com validação de escopo

CREATE OR REPLACE FUNCTION public.current_profile_claim()
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_claim text;
BEGIN
  v_claim := auth.jwt() ->> 'profile';
  IF v_claim IS NULL OR btrim(v_claim) = '' THEN
    RETURN NULL;
  END IF;

  RETURN lower(btrim(v_claim));
END;
$$;

REVOKE ALL ON FUNCTION public.current_profile_claim() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.current_profile_claim() TO authenticated;
GRANT EXECUTE ON FUNCTION public.current_profile_claim() TO service_role;

CREATE OR REPLACE FUNCTION public.enforce_campaign_tenant_match()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_campaign_tenant uuid;
BEGIN
  IF NEW.campaign_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT c.tenant_id INTO v_campaign_tenant
  FROM public.campaigns c
  WHERE c.id = NEW.campaign_id;

  IF v_campaign_tenant IS NULL THEN
    RAISE EXCEPTION 'campaign_id inválido ou sem tenant associado';
  END IF;

  IF NEW.tenant_id IS NULL THEN
    NEW.tenant_id := v_campaign_tenant;
  END IF;

  IF NEW.tenant_id <> v_campaign_tenant THEN
    RAISE EXCEPTION 'tenant_id deve corresponder ao tenant da campanha';
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.upsert_campaign_channel_margins(
  p_campaign_id uuid,
  p_margins jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_tenant_id uuid;
  v_profile text;
BEGIN
  IF p_campaign_id IS NULL THEN
    RAISE EXCEPTION 'campaign_id é obrigatório';
  END IF;

  v_profile := public.current_profile_claim();

  SELECT c.tenant_id INTO v_tenant_id
  FROM public.campaigns c
  WHERE c.id = p_campaign_id;

  IF v_tenant_id IS NULL THEN
    RAISE EXCEPTION 'campanha não encontrada';
  END IF;

  IF v_tenant_id <> public.current_tenant_id() THEN
    RAISE EXCEPTION 'acesso negado ao tenant da campanha';
  END IF;

  IF COALESCE(v_profile, '') NOT IN ('admin', 'manager')
     AND NOT public.has_role(auth.uid(), 'admin'::public.app_role)
  THEN
    RAISE EXCEPTION 'perfil sem permissão para mutação de margens';
  END IF;

  DELETE FROM public.channel_margins
  WHERE campaign_id = p_campaign_id
    AND tenant_id = v_tenant_id;

  INSERT INTO public.channel_margins (tenant_id, campaign_id, segment, margin_percent)
  SELECT
    v_tenant_id,
    p_campaign_id,
    (item->>'segment')::public.channel_segment,
    COALESCE((item->>'margin_percent')::numeric, 0)
  FROM jsonb_array_elements(COALESCE(p_margins, '[]'::jsonb)) AS item;
END;
$$;

REVOKE ALL ON FUNCTION public.upsert_campaign_channel_margins(uuid, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.upsert_campaign_channel_margins(uuid, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.upsert_campaign_channel_margins(uuid, jsonb) TO service_role;

DO $$
DECLARE
  rec record;
BEGIN
  FOR rec IN
    SELECT c.table_schema, c.table_name
    FROM information_schema.columns c
    WHERE c.table_schema = 'public'
    GROUP BY c.table_schema, c.table_name
    HAVING BOOL_OR(c.column_name = 'tenant_id')
       AND BOOL_OR(c.column_name = 'campaign_id')
  LOOP
    EXECUTE format(
      'UPDATE %I.%I t SET tenant_id = c.tenant_id FROM public.campaigns c WHERE t.campaign_id = c.id AND t.tenant_id IS NULL',
      rec.table_schema,
      rec.table_name
    );

    EXECUTE format(
      'ALTER TABLE %I.%I ALTER COLUMN tenant_id SET NOT NULL',
      rec.table_schema,
      rec.table_name
    );

    EXECUTE format(
      'CREATE INDEX IF NOT EXISTS %I ON %I.%I (tenant_id, campaign_id)',
      rec.table_name || '_tenant_campaign_idx',
      rec.table_schema,
      rec.table_name
    );

    EXECUTE format(
      'DROP TRIGGER IF EXISTS trg_%I_enforce_campaign_tenant ON %I.%I',
      rec.table_name,
      rec.table_schema,
      rec.table_name
    );

    EXECUTE format(
      'CREATE TRIGGER trg_%I_enforce_campaign_tenant BEFORE INSERT OR UPDATE ON %I.%I FOR EACH ROW EXECUTE FUNCTION public.enforce_campaign_tenant_match()',
      rec.table_name,
      rec.table_schema,
      rec.table_name
    );

    EXECUTE format('ALTER TABLE %I.%I ENABLE ROW LEVEL SECURITY', rec.table_schema, rec.table_name);

    EXECUTE format('DROP POLICY IF EXISTS %I ON %I.%I', rec.table_name || '_tenant_select', rec.table_schema, rec.table_name);
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I.%I', rec.table_name || '_tenant_mutation', rec.table_schema, rec.table_name);

    EXECUTE format(
      'CREATE POLICY %I ON %I.%I FOR SELECT TO authenticated USING (tenant_id = public.current_tenant_id())',
      rec.table_name || '_tenant_select',
      rec.table_schema,
      rec.table_name
    );

    EXECUTE format(
      $$CREATE POLICY %I ON %I.%I FOR ALL TO authenticated
         USING (
           tenant_id = public.current_tenant_id()
           AND (
             public.has_role(auth.uid(), 'admin'::public.app_role)
             OR COALESCE(public.current_profile_claim(), '') IN ('admin', 'manager')
           )
         )
         WITH CHECK (
           tenant_id = public.current_tenant_id()
           AND (
             public.has_role(auth.uid(), 'admin'::public.app_role)
             OR COALESCE(public.current_profile_claim(), '') IN ('admin', 'manager')
           )
         )$$,
      rec.table_name || '_tenant_mutation',
      rec.table_schema,
      rec.table_name
    );
  END LOOP;
END;
$$;

ALTER TABLE public.campaigns ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS campaigns_tenant_select ON public.campaigns;
DROP POLICY IF EXISTS campaigns_tenant_mutation ON public.campaigns;

CREATE POLICY campaigns_tenant_select
  ON public.campaigns
  FOR SELECT
  TO authenticated
  USING (tenant_id = public.current_tenant_id());

CREATE POLICY campaigns_tenant_mutation
  ON public.campaigns
  FOR ALL
  TO authenticated
  USING (
    tenant_id = public.current_tenant_id()
    AND (
      public.has_role(auth.uid(), 'admin'::public.app_role)
      OR COALESCE(public.current_profile_claim(), '') IN ('admin', 'manager')
    )
  )
  WITH CHECK (
    tenant_id = public.current_tenant_id()
    AND (
      public.has_role(auth.uid(), 'admin'::public.app_role)
      OR COALESCE(public.current_profile_claim(), '') IN ('admin', 'manager')
    )
  );
