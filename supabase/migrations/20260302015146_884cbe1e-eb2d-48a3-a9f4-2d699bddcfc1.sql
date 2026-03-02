
-- Attach validation triggers to their tables (if not already attached)

-- Campaign validation trigger
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'validate_campaign_trigger') THEN
    CREATE TRIGGER validate_campaign_trigger
      BEFORE INSERT OR UPDATE ON public.campaigns
      FOR EACH ROW EXECUTE FUNCTION public.validate_campaign_data();
  END IF;
END $$;

-- Channel margin validation trigger
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'validate_channel_margin_trigger') THEN
    CREATE TRIGGER validate_channel_margin_trigger
      BEFORE INSERT OR UPDATE ON public.channel_margins
      FOR EACH ROW EXECUTE FUNCTION public.validate_channel_margin_data();
  END IF;
END $$;

-- Combo validation trigger
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'validate_combo_trigger') THEN
    CREATE TRIGGER validate_combo_trigger
      BEFORE INSERT OR UPDATE ON public.combos
      FOR EACH ROW EXECUTE FUNCTION public.validate_combo_data();
  END IF;
END $$;

-- Product validation trigger
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'validate_product_trigger') THEN
    CREATE TRIGGER validate_product_trigger
      BEFORE INSERT OR UPDATE ON public.products
      FOR EACH ROW EXECUTE FUNCTION public.validate_product_data();
  END IF;
END $$;

-- Auto-update updated_at on campaigns
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'update_campaigns_updated_at') THEN
    CREATE TRIGGER update_campaigns_updated_at
      BEFORE UPDATE ON public.campaigns
      FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
  END IF;
END $$;

-- Auto-update updated_at on operations
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'update_operations_updated_at') THEN
    CREATE TRIGGER update_operations_updated_at
      BEFORE UPDATE ON public.operations
      FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
  END IF;
END $$;

-- Auto-generate campaign code
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'generate_campaign_code_trigger') THEN
    CREATE TRIGGER generate_campaign_code_trigger
      BEFORE INSERT ON public.campaigns
      FOR EACH ROW EXECUTE FUNCTION public.generate_campaign_code();
  END IF;
END $$;

-- Handle new user (profile + role creation)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'on_auth_user_created' AND tgrelid = 'auth.users'::regclass) THEN
    CREATE TRIGGER on_auth_user_created
      AFTER INSERT ON auth.users
      FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
  END IF;
END $$;

-- Sequence for campaign code (if missing)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_sequences WHERE schemaname = 'public' AND sequencename = 'campaign_code_seq') THEN
    CREATE SEQUENCE public.campaign_code_seq START 1;
  END IF;
END $$;
