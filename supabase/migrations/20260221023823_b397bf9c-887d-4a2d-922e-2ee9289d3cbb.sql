-- E1: Collateral packages
CREATE TABLE public.collateral_packages (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  operation_id UUID NOT NULL REFERENCES public.operations(id) ON DELETE CASCADE,
  poe_type TEXT NOT NULL DEFAULT 'grao_producao', -- grao_existente, grao_producao, cpr
  pol_type TEXT NOT NULL DEFAULT 'ccv_pf', -- ccv_pf, ccv_paf, outro
  delivery_due_date DATE,
  quantity_ton NUMERIC DEFAULT 0,
  equivalent_sacks NUMERIC DEFAULT 0,
  ip_index NUMERIC DEFAULT 1, -- 0..1
  status TEXT NOT NULL DEFAULT 'draft', -- draft, pending_docs, pending_cession, eligible, delivered, settled, default
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  notes TEXT
);

ALTER TABLE public.collateral_packages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own collateral packages"
ON public.collateral_packages FOR ALL
USING (EXISTS (SELECT 1 FROM operations WHERE operations.id = collateral_packages.operation_id AND operations.user_id = auth.uid()))
WITH CHECK (EXISTS (SELECT 1 FROM operations WHERE operations.id = collateral_packages.operation_id AND operations.user_id = auth.uid()));

CREATE POLICY "Admins can view all collateral packages"
ON public.collateral_packages FOR SELECT
USING (public.has_role(auth.uid(), 'admin'));

-- E2: Collateral evidences
CREATE TABLE public.collateral_evidences (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  package_id UUID NOT NULL REFERENCES public.collateral_packages(id) ON DELETE CASCADE,
  document_id UUID REFERENCES public.operation_documents(id),
  evidence_type TEXT NOT NULL DEFAULT 'poe', -- poe, pol, pod
  metadata JSONB DEFAULT '{}',
  accepted_by UUID,
  accepted_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.collateral_evidences ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own collateral evidences"
ON public.collateral_evidences FOR ALL
USING (EXISTS (
  SELECT 1 FROM collateral_packages cp 
  JOIN operations o ON o.id = cp.operation_id 
  WHERE cp.id = collateral_evidences.package_id AND o.user_id = auth.uid()
))
WITH CHECK (EXISTS (
  SELECT 1 FROM collateral_packages cp 
  JOIN operations o ON o.id = cp.operation_id 
  WHERE cp.id = collateral_evidences.package_id AND o.user_id = auth.uid()
));

CREATE POLICY "Admins can view all collateral evidences"
ON public.collateral_evidences FOR SELECT
USING (public.has_role(auth.uid(), 'admin'));

-- Indexes
CREATE INDEX idx_collateral_packages_operation ON public.collateral_packages(operation_id);
CREATE INDEX idx_collateral_evidences_package ON public.collateral_evidences(package_id);

-- Trigger for updated_at on collateral_packages
CREATE TRIGGER update_collateral_packages_updated_at
BEFORE UPDATE ON public.collateral_packages
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();