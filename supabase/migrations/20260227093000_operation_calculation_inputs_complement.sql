-- Complement required dictionary fields for calculation inputs
ALTER TABLE public.operation_calculation_inputs
  ADD COLUMN IF NOT EXISTS commodity text,
  ADD COLUMN IF NOT EXISTS periodo_entrega text,
  ADD COLUMN IF NOT EXISTS local_entrega text,
  ADD COLUMN IF NOT EXISTS tem_imposto boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS input_audit_tags jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS formula_dependencies jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS formula_resolved jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS regra_excecao_temporal text;

-- enforce core dictionary fields
ALTER TABLE public.operation_calculation_inputs
  ALTER COLUMN commodity SET NOT NULL,
  ALTER COLUMN periodo_entrega SET NOT NULL,
  ALTER COLUMN local_entrega SET NOT NULL;

-- temporal validation: concessao <= vencimento and entrega <= pagamento <= repasse (unless justified exception)
ALTER TABLE public.operation_calculation_inputs
  DROP CONSTRAINT IF EXISTS operation_calc_inputs_temporal_check;

ALTER TABLE public.operation_calculation_inputs
  ADD CONSTRAINT operation_calc_inputs_temporal_check CHECK (
    data_concessao <= vencimento
    AND data_entrega <= data_pagamento
    AND (
      data_repasse IS NULL
      OR data_pagamento <= data_repasse
      OR COALESCE(NULLIF(trim(regra_excecao_temporal), ''), '') <> ''
    )
  );
