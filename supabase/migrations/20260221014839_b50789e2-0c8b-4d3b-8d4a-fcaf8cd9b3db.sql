
-- Create table for immutable pricing snapshots
CREATE TABLE public.order_pricing_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operation_id uuid NOT NULL REFERENCES public.operations(id) ON DELETE CASCADE,
  snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  snapshot_type text NOT NULL DEFAULT 'simulation', -- 'simulation' | 'order' | 'formalization'
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid
);

-- Index for fast lookup by operation
CREATE INDEX idx_ops_snapshots_operation ON public.order_pricing_snapshots(operation_id);
CREATE INDEX idx_ops_snapshots_type ON public.order_pricing_snapshots(snapshot_type);

-- Enable RLS
ALTER TABLE public.order_pricing_snapshots ENABLE ROW LEVEL SECURITY;

-- Users can view snapshots of their own operations
CREATE POLICY "Users can view own snapshots"
ON public.order_pricing_snapshots
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.operations
    WHERE operations.id = order_pricing_snapshots.operation_id
    AND operations.user_id = auth.uid()
  )
);

-- Users can insert snapshots for their own operations
CREATE POLICY "Users can insert own snapshots"
ON public.order_pricing_snapshots
FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.operations
    WHERE operations.id = order_pricing_snapshots.operation_id
    AND operations.user_id = auth.uid()
  )
);

-- Admins can view all snapshots
CREATE POLICY "Admins can view all snapshots"
ON public.order_pricing_snapshots
FOR SELECT
USING (has_role(auth.uid(), 'admin'::app_role));

-- Snapshots are immutable: no UPDATE or DELETE allowed for regular users
-- Only admins can delete (for data cleanup)
CREATE POLICY "Admins can delete snapshots"
ON public.order_pricing_snapshots
FOR DELETE
USING (has_role(auth.uid(), 'admin'::app_role));
