-- C1: Tabela operation_status_history para auditoria formal de transições
CREATE TABLE public.operation_status_history (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  operation_id UUID NOT NULL REFERENCES public.operations(id) ON DELETE CASCADE,
  from_status TEXT NOT NULL,
  to_status TEXT NOT NULL,
  changed_by UUID NOT NULL,
  changed_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  notes TEXT
);

-- Enable RLS
ALTER TABLE public.operation_status_history ENABLE ROW LEVEL SECURITY;

-- Policies: users can insert for own operations, admins can view all
CREATE POLICY "Users can insert own status history"
ON public.operation_status_history
FOR INSERT
WITH CHECK (EXISTS (
  SELECT 1 FROM operations WHERE operations.id = operation_status_history.operation_id AND operations.user_id = auth.uid()
));

CREATE POLICY "Users can view own status history"
ON public.operation_status_history
FOR SELECT
USING (EXISTS (
  SELECT 1 FROM operations WHERE operations.id = operation_status_history.operation_id AND operations.user_id = auth.uid()
));

CREATE POLICY "Admins can view all status history"
ON public.operation_status_history
FOR SELECT
USING (public.has_role(auth.uid(), 'admin'));

-- Index for efficient lookups
CREATE INDEX idx_operation_status_history_operation_id ON public.operation_status_history(operation_id);
CREATE INDEX idx_operation_status_history_changed_at ON public.operation_status_history(changed_at DESC);