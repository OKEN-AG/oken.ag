-- Inputs for commodity calculation memories (insumo/divida)
CREATE TABLE public.operation_calculation_inputs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operation_id uuid NOT NULL REFERENCES public.operations(id) ON DELETE CASCADE,
  scenario_type text NOT NULL CHECK (scenario_type IN ('insumo', 'divida')),

  -- Formula governance
  calculation_version text NOT NULL DEFAULT 'v1',

  -- Common financial inputs
  juros_cet_aa numeric NOT NULL,
  fee_oken_pct numeric NOT NULL,
  incentivo_pct numeric NOT NULL DEFAULT 0,
  preco_bruto_commodity numeric NOT NULL,
  desconto_impostos_pct numeric NOT NULL DEFAULT 0,
  rendimento_antecipacao_aa numeric NOT NULL DEFAULT 0,

  -- Dates used by the memory formulas
  data_concessao date NOT NULL,
  vencimento date NOT NULL,
  data_entrega date NOT NULL,
  data_pagamento date NOT NULL,
  data_repasse date,

  -- Scenario specific inputs
  preco_fornecedor numeric,
  markup_pct numeric,
  desconto_pct numeric,
  fee_merchant_pct numeric,

  valor_divida_pv numeric,
  fee_dealer_pct numeric,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,

  -- Conditional required fields by scenario
  CONSTRAINT operation_calc_inputs_insumo_required CHECK (
    scenario_type <> 'insumo' OR (
      preco_fornecedor IS NOT NULL AND
      markup_pct IS NOT NULL AND
      desconto_pct IS NOT NULL AND
      fee_merchant_pct IS NOT NULL
    )
  ),
  CONSTRAINT operation_calc_inputs_divida_required CHECK (
    scenario_type <> 'divida' OR (
      valor_divida_pv IS NOT NULL AND
      fee_dealer_pct IS NOT NULL
    )
  )
);

CREATE UNIQUE INDEX uq_operation_calculation_inputs_operation_scenario
  ON public.operation_calculation_inputs(operation_id, scenario_type);

CREATE INDEX idx_operation_calculation_inputs_operation
  ON public.operation_calculation_inputs(operation_id);

ALTER TABLE public.operation_calculation_inputs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own operation calculation inputs"
ON public.operation_calculation_inputs
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.operations
    WHERE operations.id = operation_calculation_inputs.operation_id
      AND operations.user_id = auth.uid()
  )
);

CREATE POLICY "Users can insert own operation calculation inputs"
ON public.operation_calculation_inputs
FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.operations
    WHERE operations.id = operation_calculation_inputs.operation_id
      AND operations.user_id = auth.uid()
  )
);

CREATE POLICY "Users can update own operation calculation inputs"
ON public.operation_calculation_inputs
FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM public.operations
    WHERE operations.id = operation_calculation_inputs.operation_id
      AND operations.user_id = auth.uid()
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.operations
    WHERE operations.id = operation_calculation_inputs.operation_id
      AND operations.user_id = auth.uid()
  )
);

CREATE POLICY "Admins can view all operation calculation inputs"
ON public.operation_calculation_inputs
FOR SELECT
USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can delete operation calculation inputs"
ON public.operation_calculation_inputs
FOR DELETE
USING (has_role(auth.uid(), 'admin'::app_role));
