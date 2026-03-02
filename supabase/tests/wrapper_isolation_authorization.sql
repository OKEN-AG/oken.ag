-- Wrapper isolation and authorization tests.
-- Run with: psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -f supabase/tests/wrapper_isolation_authorization.sql

BEGIN;

DO $$
DECLARE
  tenant_a CONSTANT uuid := 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  visible_count int;
BEGIN
  -- Seed two wrappers for the same tenant.
  INSERT INTO public.tenant_wrapper_capabilities (tenant_id, wrapper, capability_key, is_enabled)
  VALUES
    (tenant_a, 'platform_88', 'reports.export_csv', true),
    (tenant_a, 'okensec', 'reports.export_csv', false)
  ON CONFLICT (tenant_id, wrapper, capability_key) DO UPDATE
  SET is_enabled = EXCLUDED.is_enabled,
      updated_at = now();

  INSERT INTO public.wrapper_reports (tenant_id, wrapper, report_type, report_ref, payload)
  VALUES
    (tenant_a, 'platform_88', 'originations', 'P88-R1', '{"source":"seed"}'::jsonb),
    (tenant_a, 'okensec', 'regulatory', 'SEC-R1', '{"source":"seed"}'::jsonb)
  ON CONFLICT (tenant_id, wrapper, report_type, report_ref) DO NOTHING;

  -- Authenticated as platform_88 wrapper.
  PERFORM set_config('role', 'authenticated', true);
  PERFORM set_config(
    'request.jwt.claims',
    json_build_object(
      'sub', '11111111-1111-4111-8111-111111111111',
      'role', 'authenticated',
      'tenant_id', tenant_a::text,
      'wrapper', 'platform_88'
    )::text,
    true
  );

  -- Read isolation: platform_88 cannot read okensec report.
  SELECT COUNT(*) INTO visible_count
  FROM public.wrapper_reports
  WHERE tenant_id = tenant_a
    AND wrapper = 'okensec';

  IF visible_count <> 0 THEN
    RAISE EXCEPTION 'Falha: wrapper platform_88 conseguiu ler relatório de okensec';
  END IF;

  -- Positive read for own wrapper.
  SELECT COUNT(*) INTO visible_count
  FROM public.wrapper_reports
  WHERE tenant_id = tenant_a
    AND wrapper = 'platform_88';

  IF visible_count = 0 THEN
    RAISE EXCEPTION 'Falha: wrapper platform_88 não conseguiu ler seu próprio relatório';
  END IF;

  -- Write isolation: platform_88 cannot write okensec regulatory rule.
  BEGIN
    INSERT INTO public.wrapper_regulatory_rules (
      tenant_id,
      wrapper,
      rule_code,
      rule_version,
      description,
      criteria
    ) VALUES (
      tenant_a,
      'okensec',
      'CVM-SEC-001',
      '1.0.0',
      'Regra indevida entre wrappers',
      '{}'::jsonb
    );

    RAISE EXCEPTION 'Falha: wrapper platform_88 conseguiu inserir regra regulatória de okensec';
  EXCEPTION
    WHEN insufficient_privilege THEN
      NULL;
  END;

  -- Capability check is wrapper-aware.
  IF public.is_wrapper_capability_enabled(tenant_a, 'platform_88', 'reports.export_csv') IS NOT TRUE THEN
    RAISE EXCEPTION 'Falha: capability habilitada para platform_88 não foi reconhecida';
  END IF;

  IF public.is_wrapper_capability_enabled(tenant_a, 'okensec', 'reports.export_csv') IS NOT FALSE THEN
    RAISE EXCEPTION 'Falha: capability desabilitada para okensec retornou true';
  END IF;

  -- Claim parser behavior for wrapper.
  IF public.current_wrapper() <> 'platform_88'::public.wrapper_code THEN
    RAISE EXCEPTION 'Falha: current_wrapper() não retornou wrapper do JWT';
  END IF;
END$$;

ROLLBACK;
