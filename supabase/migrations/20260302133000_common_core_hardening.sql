-- Common Core hardening (Phase 1.1)
-- Addresses data integrity and security gaps from initial foundation.

-- 1) Integrity constraints
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'deals_snapshot_id_fkey'
  ) THEN
    ALTER TABLE public.deals
      ADD CONSTRAINT deals_snapshot_id_fkey
      FOREIGN KEY (snapshot_id)
      REFERENCES public.core_snapshots(id)
      ON DELETE SET NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'deals_amounts_non_negative_ck'
  ) THEN
    ALTER TABLE public.deals
      ADD CONSTRAINT deals_amounts_non_negative_ck
      CHECK (
        (requested_amount IS NULL OR requested_amount >= 0)
        AND (approved_amount IS NULL OR approved_amount >= 0)
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'business_events_event_version_positive_ck'
  ) THEN
    ALTER TABLE public.business_events
      ADD CONSTRAINT business_events_event_version_positive_ck
      CHECK (event_version > 0);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'event_outbox_attempts_non_negative_ck'
  ) THEN
    ALTER TABLE public.event_outbox
      ADD CONSTRAINT event_outbox_attempts_non_negative_ck
      CHECK (attempts >= 0);
  END IF;
END$$;

-- 2) Useful uniqueness guarantees
CREATE UNIQUE INDEX IF NOT EXISTS programs_legacy_campaign_id_ux
  ON public.programs (legacy_campaign_id)
  WHERE legacy_campaign_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS deals_legacy_operation_id_ux
  ON public.deals (legacy_operation_id)
  WHERE legacy_operation_id IS NOT NULL;

-- 3) Auto-updated timestamp triggers for new tables
DROP TRIGGER IF EXISTS update_parties_updated_at ON public.parties;
CREATE TRIGGER update_parties_updated_at
  BEFORE UPDATE ON public.parties
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_organizations_updated_at ON public.organizations;
CREATE TRIGGER update_organizations_updated_at
  BEFORE UPDATE ON public.organizations
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_programs_updated_at ON public.programs;
CREATE TRIGGER update_programs_updated_at
  BEFORE UPDATE ON public.programs
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_deals_updated_at ON public.deals;
CREATE TRIGGER update_deals_updated_at
  BEFORE UPDATE ON public.deals
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_event_outbox_updated_at ON public.event_outbox;
CREATE TRIGGER update_event_outbox_updated_at
  BEFORE UPDATE ON public.event_outbox
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 4) RLS policies (minimum secure baseline)
-- Parties
DROP POLICY IF EXISTS "Authenticated can view parties" ON public.parties;
CREATE POLICY "Authenticated can view parties"
  ON public.parties FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS "Admins can manage parties" ON public.parties;
CREATE POLICY "Admins can manage parties"
  ON public.parties FOR ALL
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Organizations
DROP POLICY IF EXISTS "Authenticated can view organizations" ON public.organizations;
CREATE POLICY "Authenticated can view organizations"
  ON public.organizations FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS "Admins can manage organizations" ON public.organizations;
CREATE POLICY "Admins can manage organizations"
  ON public.organizations FOR ALL
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Programs
DROP POLICY IF EXISTS "Authenticated can view programs" ON public.programs;
CREATE POLICY "Authenticated can view programs"
  ON public.programs FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS "Admins can manage programs" ON public.programs;
CREATE POLICY "Admins can manage programs"
  ON public.programs FOR ALL
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Deals
DROP POLICY IF EXISTS "Authenticated can view deals" ON public.deals;
CREATE POLICY "Authenticated can view deals"
  ON public.deals FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS "Admins can manage deals" ON public.deals;
CREATE POLICY "Admins can manage deals"
  ON public.deals FOR ALL
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Evidences
DROP POLICY IF EXISTS "Authenticated can view evidences" ON public.evidences;
CREATE POLICY "Authenticated can view evidences"
  ON public.evidences FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS "Admins can manage evidences" ON public.evidences;
CREATE POLICY "Admins can manage evidences"
  ON public.evidences FOR ALL
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Core snapshots
DROP POLICY IF EXISTS "Authenticated can view core snapshots" ON public.core_snapshots;
CREATE POLICY "Authenticated can view core snapshots"
  ON public.core_snapshots FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS "Admins can manage core snapshots" ON public.core_snapshots;
CREATE POLICY "Admins can manage core snapshots"
  ON public.core_snapshots FOR ALL
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Business events
DROP POLICY IF EXISTS "Authenticated can view business events" ON public.business_events;
CREATE POLICY "Authenticated can view business events"
  ON public.business_events FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS "Admins can manage business events" ON public.business_events;
CREATE POLICY "Admins can manage business events"
  ON public.business_events FOR ALL
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Event outbox
DROP POLICY IF EXISTS "Authenticated can view event outbox" ON public.event_outbox;
CREATE POLICY "Authenticated can view event outbox"
  ON public.event_outbox FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS "Admins can manage event outbox" ON public.event_outbox;
CREATE POLICY "Admins can manage event outbox"
  ON public.event_outbox FOR ALL
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));
