-- Allow negative values in channel_margins margin_percent (now acts as price list adjustment)
CREATE OR REPLACE FUNCTION public.validate_channel_margin_data()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.margin_percent < -100 OR NEW.margin_percent > 100 THEN
    RAISE EXCEPTION 'margin_percent must be between -100 and 100';
  END IF;
  RETURN NEW;
END;
$function$;

-- Ensure trigger exists
DROP TRIGGER IF EXISTS validate_channel_margin ON public.channel_margins;
CREATE TRIGGER validate_channel_margin
  BEFORE INSERT OR UPDATE ON public.channel_margins
  FOR EACH ROW
  EXECUTE FUNCTION public.validate_channel_margin_data();

NOTIFY pgrst, 'reload schema';
