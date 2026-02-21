-- Add aforo and contract price types to campaigns
ALTER TABLE public.campaigns 
  ADD COLUMN IF NOT EXISTS aforo_percent NUMERIC DEFAULT 130,
  ADD COLUMN IF NOT EXISTS contract_price_types TEXT[] DEFAULT '{fixo,a_fixar}'::TEXT[];

-- Add guarantee category to operation_documents
ALTER TABLE public.operation_documents
  ADD COLUMN IF NOT EXISTS guarantee_category TEXT;

-- Add performance/price variation indices to operations
ALTER TABLE public.operations
  ADD COLUMN IF NOT EXISTS performance_index NUMERIC DEFAULT 1,
  ADD COLUMN IF NOT EXISTS price_variation_index NUMERIC DEFAULT 1,
  ADD COLUMN IF NOT EXISTS aforo_percent NUMERIC DEFAULT 130,
  ADD COLUMN IF NOT EXISTS contract_price_type TEXT DEFAULT 'fixo';

-- Add producer/farm fields to profiles
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS inscricao_estadual TEXT DEFAULT '',
  ADD COLUMN IF NOT EXISTS car_number TEXT DEFAULT '',
  ADD COLUMN IF NOT EXISTS land_type TEXT DEFAULT '',
  ADD COLUMN IF NOT EXISTS farm_name TEXT DEFAULT '',
  ADD COLUMN IF NOT EXISTS farm_address TEXT DEFAULT '',
  ADD COLUMN IF NOT EXISTS bank_name TEXT DEFAULT '',
  ADD COLUMN IF NOT EXISTS bank_agency TEXT DEFAULT '',
  ADD COLUMN IF NOT EXISTS bank_account TEXT DEFAULT '',
  ADD COLUMN IF NOT EXISTS pix_key TEXT DEFAULT '';

-- Create operation_guarantees table
CREATE TABLE IF NOT EXISTS public.operation_guarantees (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  operation_id UUID NOT NULL REFERENCES public.operations(id),
  document_id UUID REFERENCES public.operation_documents(id),
  category TEXT NOT NULL, -- poe/pol/pod
  estimated_value NUMERIC DEFAULT 0,
  effective_value NUMERIC DEFAULT 0,
  ip_at_evaluation NUMERIC DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'pendente', -- pendente/validado/expirado
  evaluated_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  notes TEXT DEFAULT ''
);

ALTER TABLE public.operation_guarantees ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own operation guarantees"
  ON public.operation_guarantees FOR SELECT
  USING (EXISTS (SELECT 1 FROM operations WHERE operations.id = operation_guarantees.operation_id AND operations.user_id = auth.uid()));

CREATE POLICY "Users can insert own operation guarantees"
  ON public.operation_guarantees FOR INSERT
  WITH CHECK (EXISTS (SELECT 1 FROM operations WHERE operations.id = operation_guarantees.operation_id AND operations.user_id = auth.uid()));

CREATE POLICY "Users can update own operation guarantees"
  ON public.operation_guarantees FOR UPDATE
  USING (EXISTS (SELECT 1 FROM operations WHERE operations.id = operation_guarantees.operation_id AND operations.user_id = auth.uid()));

CREATE POLICY "Admins can view all operation guarantees"
  ON public.operation_guarantees FOR SELECT
  USING (has_role(auth.uid(), 'admin'::app_role));