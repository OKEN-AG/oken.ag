-- Freight reducers: explicit pt-BR aliases for server-side freight engine
ALTER TABLE public.freight_reducers
  ADD COLUMN IF NOT EXISTS cidade TEXT,
  ADD COLUMN IF NOT EXISTS porto TEXT,
  ADD COLUMN IF NOT EXISTS km NUMERIC(10,2),
  ADD COLUMN IF NOT EXISTS custo_km NUMERIC(10,4),
  ADD COLUMN IF NOT EXISTS ajuste NUMERIC(10,2);

UPDATE public.freight_reducers
SET
  cidade = COALESCE(NULLIF(cidade, ''), origin),
  porto = COALESCE(NULLIF(porto, ''), destination),
  km = COALESCE(km, distance_km, 0),
  custo_km = COALESCE(custo_km, cost_per_km, 0),
  ajuste = COALESCE(ajuste, adjustment, 0);

ALTER TABLE public.freight_reducers
  ALTER COLUMN cidade SET NOT NULL,
  ALTER COLUMN porto SET NOT NULL,
  ALTER COLUMN km SET NOT NULL,
  ALTER COLUMN custo_km SET NOT NULL,
  ALTER COLUMN ajuste SET NOT NULL;

-- Keep legacy columns synchronized for backward compatibility.
UPDATE public.freight_reducers
SET
  origin = cidade,
  destination = porto,
  distance_km = km,
  cost_per_km = custo_km,
  adjustment = ajuste,
  total_reducer = GREATEST((km * custo_km) + ajuste, 0);

CREATE OR REPLACE FUNCTION public.sync_freight_reducers_columns()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.cidade := COALESCE(NULLIF(NEW.cidade, ''), NEW.origin, '');
  NEW.porto := COALESCE(NULLIF(NEW.porto, ''), NEW.destination, '');
  NEW.km := COALESCE(NEW.km, NEW.distance_km, 0);
  NEW.custo_km := COALESCE(NEW.custo_km, NEW.cost_per_km, 0);
  NEW.ajuste := COALESCE(NEW.ajuste, NEW.adjustment, 0);

  NEW.origin := NEW.cidade;
  NEW.destination := NEW.porto;
  NEW.distance_km := NEW.km;
  NEW.cost_per_km := NEW.custo_km;
  NEW.adjustment := NEW.ajuste;
  NEW.total_reducer := GREATEST((NEW.km * NEW.custo_km) + NEW.ajuste, 0);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_freight_reducers_columns ON public.freight_reducers;
CREATE TRIGGER trg_sync_freight_reducers_columns
BEFORE INSERT OR UPDATE ON public.freight_reducers
FOR EACH ROW EXECUTE FUNCTION public.sync_freight_reducers_columns();

CREATE INDEX IF NOT EXISTS freight_reducers_city_port_idx
  ON public.freight_reducers (campaign_id, cidade, porto);
