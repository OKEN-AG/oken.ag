-- Common Core tenant-aware security (Phase 1.2)
-- Evolves baseline RLS policies from global authenticated-read to tenant-scoped access.

-- 1) Helper: resolve tenant_id from JWT claim safely
CREATE OR REPLACE FUNCTION public.current_tenant_id()
RETURNS UUID
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_claim TEXT;
BEGIN
  v_claim := auth.jwt() ->> 'tenant_id';
  IF v_claim IS NULL OR btrim(v_claim) = '' THEN
    RETURN NULL;
  END IF;

  RETURN v_claim::uuid;
EXCEPTION
  WHEN invalid_text_representation THEN
    RETURN NULL;
END;
$$;

-- 2) Helpful indexes for tenant-scoped filters
CREATE INDEX IF NOT EXISTS parties_tenant_idx ON public.parties (tenant_id);
CREATE INDEX IF NOT EXISTS organizations_tenant_idx ON public.organizations (tenant_id);
CREATE INDEX IF NOT EXISTS programs_tenant_idx ON public.programs (tenant_id);
CREATE INDEX IF NOT EXISTS deals_tenant_idx ON public.deals (tenant_id);
CREATE INDEX IF NOT EXISTS evidences_tenant_idx ON public.evidences (tenant_id);
CREATE INDEX IF NOT EXISTS core_snapshots_tenant_idx ON public.core_snapshots (tenant_id);
CREATE INDEX IF NOT EXISTS business_events_tenant_idx ON public.business_events (tenant_id);

-- 3) Replace baseline RLS policies with tenant-aware policies

-- Parties
DROP POLICY IF EXISTS "Authenticated can view parties" ON public.parties;
DROP POLICY IF EXISTS "Admins can manage parties" ON public.parties;

CREATE POLICY "Tenant users can view parties"
  ON public.parties FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin')
    OR tenant_id = public.current_tenant_id()
  );

CREATE POLICY "Tenant users can insert parties"
  ON public.parties FOR INSERT TO authenticated
  WITH CHECK (
    public.has_role(auth.uid(), 'admin')
    OR tenant_id = public.current_tenant_id()
  );

CREATE POLICY "Tenant users can update parties"
  ON public.parties FOR UPDATE TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin')
    OR tenant_id = public.current_tenant_id()
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'admin')
    OR tenant_id = public.current_tenant_id()
  );

CREATE POLICY "Admins can delete parties"
  ON public.parties FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- Organizations
DROP POLICY IF EXISTS "Authenticated can view organizations" ON public.organizations;
DROP POLICY IF EXISTS "Admins can manage organizations" ON public.organizations;

CREATE POLICY "Tenant users can view organizations"
  ON public.organizations FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin')
    OR tenant_id = public.current_tenant_id()
  );

CREATE POLICY "Tenant users can insert organizations"
  ON public.organizations FOR INSERT TO authenticated
  WITH CHECK (
    public.has_role(auth.uid(), 'admin')
    OR tenant_id = public.current_tenant_id()
  );

CREATE POLICY "Tenant users can update organizations"
  ON public.organizations FOR UPDATE TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin')
    OR tenant_id = public.current_tenant_id()
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'admin')
    OR tenant_id = public.current_tenant_id()
  );

CREATE POLICY "Admins can delete organizations"
  ON public.organizations FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- Programs
DROP POLICY IF EXISTS "Authenticated can view programs" ON public.programs;
DROP POLICY IF EXISTS "Admins can manage programs" ON public.programs;

CREATE POLICY "Tenant users can view programs"
  ON public.programs FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin')
    OR tenant_id = public.current_tenant_id()
  );

CREATE POLICY "Tenant users can insert programs"
  ON public.programs FOR INSERT TO authenticated
  WITH CHECK (
    public.has_role(auth.uid(), 'admin')
    OR tenant_id = public.current_tenant_id()
  );

CREATE POLICY "Tenant users can update programs"
  ON public.programs FOR UPDATE TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin')
    OR tenant_id = public.current_tenant_id()
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'admin')
    OR tenant_id = public.current_tenant_id()
  );

CREATE POLICY "Admins can delete programs"
  ON public.programs FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- Deals
DROP POLICY IF EXISTS "Authenticated can view deals" ON public.deals;
DROP POLICY IF EXISTS "Admins can manage deals" ON public.deals;

CREATE POLICY "Tenant users can view deals"
  ON public.deals FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin')
    OR tenant_id = public.current_tenant_id()
  );

CREATE POLICY "Tenant users can insert deals"
  ON public.deals FOR INSERT TO authenticated
  WITH CHECK (
    public.has_role(auth.uid(), 'admin')
    OR tenant_id = public.current_tenant_id()
  );

CREATE POLICY "Tenant users can update deals"
  ON public.deals FOR UPDATE TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin')
    OR tenant_id = public.current_tenant_id()
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'admin')
    OR tenant_id = public.current_tenant_id()
  );

CREATE POLICY "Admins can delete deals"
  ON public.deals FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- Evidences
DROP POLICY IF EXISTS "Authenticated can view evidences" ON public.evidences;
DROP POLICY IF EXISTS "Admins can manage evidences" ON public.evidences;

CREATE POLICY "Tenant users can view evidences"
  ON public.evidences FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin')
    OR tenant_id = public.current_tenant_id()
  );

CREATE POLICY "Tenant users can insert evidences"
  ON public.evidences FOR INSERT TO authenticated
  WITH CHECK (
    public.has_role(auth.uid(), 'admin')
    OR tenant_id = public.current_tenant_id()
  );

CREATE POLICY "Tenant users can update evidences"
  ON public.evidences FOR UPDATE TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin')
    OR tenant_id = public.current_tenant_id()
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'admin')
    OR tenant_id = public.current_tenant_id()
  );

CREATE POLICY "Admins can delete evidences"
  ON public.evidences FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- Core snapshots
DROP POLICY IF EXISTS "Authenticated can view core snapshots" ON public.core_snapshots;
DROP POLICY IF EXISTS "Admins can manage core snapshots" ON public.core_snapshots;

CREATE POLICY "Tenant users can view core snapshots"
  ON public.core_snapshots FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin')
    OR tenant_id = public.current_tenant_id()
  );

CREATE POLICY "Tenant users can insert core snapshots"
  ON public.core_snapshots FOR INSERT TO authenticated
  WITH CHECK (
    public.has_role(auth.uid(), 'admin')
    OR tenant_id = public.current_tenant_id()
  );

CREATE POLICY "Tenant users can update core snapshots"
  ON public.core_snapshots FOR UPDATE TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin')
    OR tenant_id = public.current_tenant_id()
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'admin')
    OR tenant_id = public.current_tenant_id()
  );

CREATE POLICY "Admins can delete core snapshots"
  ON public.core_snapshots FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- Business events
DROP POLICY IF EXISTS "Authenticated can view business events" ON public.business_events;
DROP POLICY IF EXISTS "Admins can manage business events" ON public.business_events;

CREATE POLICY "Tenant users can view business events"
  ON public.business_events FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin')
    OR tenant_id = public.current_tenant_id()
  );

CREATE POLICY "Tenant users can insert business events"
  ON public.business_events FOR INSERT TO authenticated
  WITH CHECK (
    public.has_role(auth.uid(), 'admin')
    OR tenant_id = public.current_tenant_id()
  );

CREATE POLICY "Tenant users can update business events"
  ON public.business_events FOR UPDATE TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin')
    OR tenant_id = public.current_tenant_id()
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'admin')
    OR tenant_id = public.current_tenant_id()
  );

CREATE POLICY "Admins can delete business events"
  ON public.business_events FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- Event outbox (tenant via business_event relation)
DROP POLICY IF EXISTS "Authenticated can view event outbox" ON public.event_outbox;
DROP POLICY IF EXISTS "Admins can manage event outbox" ON public.event_outbox;

CREATE POLICY "Tenant users can view event outbox"
  ON public.event_outbox FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin')
    OR EXISTS (
      SELECT 1
      FROM public.business_events be
      WHERE be.id = event_outbox.business_event_id
        AND be.tenant_id = public.current_tenant_id()
    )
  );

CREATE POLICY "Tenant users can insert event outbox"
  ON public.event_outbox FOR INSERT TO authenticated
  WITH CHECK (
    public.has_role(auth.uid(), 'admin')
    OR EXISTS (
      SELECT 1
      FROM public.business_events be
      WHERE be.id = event_outbox.business_event_id
        AND be.tenant_id = public.current_tenant_id()
    )
  );

CREATE POLICY "Tenant users can update event outbox"
  ON public.event_outbox FOR UPDATE TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin')
    OR EXISTS (
      SELECT 1
      FROM public.business_events be
      WHERE be.id = event_outbox.business_event_id
        AND be.tenant_id = public.current_tenant_id()
    )
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'admin')
    OR EXISTS (
      SELECT 1
      FROM public.business_events be
      WHERE be.id = event_outbox.business_event_id
        AND be.tenant_id = public.current_tenant_id()
    )
  );

CREATE POLICY "Admins can delete event outbox"
  ON public.event_outbox FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));
