-- Tenant isolation smoke tests for canonical common-core tables.
-- Run with: psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -f supabase/tests/common_core_tenant_isolation.sql

BEGIN;

DO $$
DECLARE
  tenant_a CONSTANT uuid := 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  tenant_b CONSTANT uuid := 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
  org_a uuid;
  org_b uuid;
  program_a uuid;
  deal_a uuid;
  snapshot_a uuid;
  event_a uuid;
  visible_count int;
BEGIN
  -- Seed as privileged role
  INSERT INTO public.organizations (tenant_id, organization_type, legal_name)
  VALUES (tenant_a, 'client', 'Org A') RETURNING id INTO org_a;

  INSERT INTO public.organizations (tenant_id, organization_type, legal_name)
  VALUES (tenant_b, 'client', 'Org B') RETURNING id INTO org_b;

  INSERT INTO public.programs (tenant_id, organization_id, name)
  VALUES (tenant_a, org_a, 'Programa A') RETURNING id INTO program_a;

  INSERT INTO public.deals (tenant_id, program_id, currency)
  VALUES (tenant_a, program_a, 'BRL') RETURNING id INTO deal_a;

  INSERT INTO public.core_snapshots (tenant_id, snapshot_type, domain_ref, domain_id, payload)
  VALUES (tenant_a, 'deal_state', 'deal', deal_a, '{}'::jsonb) RETURNING id INTO snapshot_a;

  INSERT INTO public.business_events (
    tenant_id,
    event_name,
    aggregate_type,
    aggregate_id,
    snapshot_id,
    payload
  )
  VALUES (
    tenant_a,
    'deal.created',
    'deal',
    deal_a,
    snapshot_a,
    '{}'::jsonb
  )
  RETURNING id INTO event_a;

  -- Impersonate tenant A authenticated session
  PERFORM set_config('role', 'authenticated', true);
  PERFORM set_config(
    'request.jwt.claims',
    json_build_object(
      'sub', '11111111-1111-4111-8111-111111111111',
      'role', 'authenticated',
      'tenant_id', tenant_a::text,
      'org_scope', json_build_array(org_a::text)
    )::text,
    true
  );

  -- Leitura isolada entre tenants
  SELECT COUNT(*) INTO visible_count
  FROM public.organizations
  WHERE id = org_b;

  IF visible_count <> 0 THEN
    RAISE EXCEPTION 'Falha de isolamento: tenant A conseguiu ler organization tenant B';
  END IF;

  SELECT COUNT(*) INTO visible_count
  FROM public.business_events
  WHERE id = event_a;

  IF visible_count <> 1 THEN
    RAISE EXCEPTION 'Falha: tenant A não conseguiu ler seu próprio business_event';
  END IF;

  -- Insert cruzado deve falhar
  BEGIN
    INSERT INTO public.organizations (tenant_id, organization_type, legal_name)
    VALUES (tenant_b, 'client', 'Org indevida');
    RAISE EXCEPTION 'Falha de isolamento: tenant A conseguiu gravar dados de tenant B';
  EXCEPTION
    WHEN insufficient_privilege THEN
      NULL;
  END;

  BEGIN
    INSERT INTO public.business_events (
      tenant_id,
      event_name,
      aggregate_type,
      payload
    )
    VALUES (
      tenant_b,
      'cross-tenant.write',
      'manual',
      '{}'::jsonb
    );
    RAISE EXCEPTION 'Falha de isolamento: tenant A conseguiu inserir business_event tenant B';
  EXCEPTION
    WHEN insufficient_privilege THEN
      NULL;
  END;

  -- Update cruzado deve falhar
  BEGIN
    UPDATE public.organizations
    SET legal_name = 'Org B violada'
    WHERE id = org_b;

    IF FOUND THEN
      RAISE EXCEPTION 'Falha de isolamento: tenant A conseguiu atualizar organization tenant B';
    END IF;
  EXCEPTION
    WHEN insufficient_privilege THEN
      NULL;
  END;

  BEGIN
    UPDATE public.business_events
    SET event_name = 'cross-tenant.update'
    WHERE id = event_a
      AND tenant_id = tenant_b;

    IF FOUND THEN
      RAISE EXCEPTION 'Falha de isolamento: update cruzado em business_events foi permitido';
    END IF;
  EXCEPTION
    WHEN insufficient_privilege THEN
      NULL;
  END;

  -- Validate claim parser behavior
  IF public.current_tenant_id() <> tenant_a THEN
    RAISE EXCEPTION 'current_tenant_id() não retornou tenant do claim JWT';
  END IF;
END$$;

ROLLBACK;
