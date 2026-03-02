-- Campaign-scoped tenant isolation tests.
-- Run with: psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -f supabase/tests/campaign_tenant_isolation.sql

BEGIN;

DO $$
DECLARE
  tenant_a CONSTANT uuid := 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  tenant_b CONSTANT uuid := 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
  campaign_a uuid;
  campaign_b uuid;
  visible_count int;
BEGIN
  INSERT INTO public.campaigns (tenant_id, name, season)
  VALUES (tenant_a, 'Campanha A', '2026')
  RETURNING id INTO campaign_a;

  INSERT INTO public.campaigns (tenant_id, name, season)
  VALUES (tenant_b, 'Campanha B', '2026')
  RETURNING id INTO campaign_b;

  INSERT INTO public.channel_margins (tenant_id, campaign_id, segment, margin_percent)
  VALUES (tenant_a, campaign_a, 'direto', 3.5);

  PERFORM set_config('role', 'authenticated', true);
  PERFORM set_config(
    'request.jwt.claims',
    json_build_object(
      'sub', '11111111-1111-4111-8111-111111111111',
      'role', 'authenticated',
      'tenant_id', tenant_a::text,
      'profile', 'manager'
    )::text,
    true
  );

  SELECT COUNT(*) INTO visible_count
  FROM public.campaigns
  WHERE id = campaign_b;

  IF visible_count <> 0 THEN
    RAISE EXCEPTION 'Falha: tenant A leu campanha de tenant B';
  END IF;

  BEGIN
    INSERT INTO public.channel_margins (tenant_id, campaign_id, segment, margin_percent)
    VALUES (tenant_b, campaign_b, 'distribuidor', 4.2);
    RAISE EXCEPTION 'Falha: tenant A escreveu channel_margins tenant B';
  EXCEPTION
    WHEN insufficient_privilege THEN NULL;
  END;

  PERFORM public.upsert_campaign_channel_margins(
    campaign_a,
    jsonb_build_array(
      jsonb_build_object('segment', 'direto', 'margin_percent', 2.1),
      jsonb_build_object('segment', 'cooperativa', 'margin_percent', 1.2)
    )
  );

  SELECT COUNT(*) INTO visible_count
  FROM public.channel_margins
  WHERE tenant_id = tenant_a
    AND campaign_id = campaign_a;

  IF visible_count <> 2 THEN
    RAISE EXCEPTION 'Falha: RPC não persistiu margens esperadas no tenant/campaign';
  END IF;

  BEGIN
    PERFORM public.upsert_campaign_channel_margins(
      campaign_b,
      jsonb_build_array(jsonb_build_object('segment', 'direto', 'margin_percent', 9.9))
    );
    RAISE EXCEPTION 'Falha: RPC permitiu mutação em campanha de outro tenant';
  EXCEPTION
    WHEN OTHERS THEN
      IF POSITION('acesso negado ao tenant da campanha' IN SQLERRM) = 0 THEN
        RAISE;
      END IF;
  END;
END$$;

ROLLBACK;
