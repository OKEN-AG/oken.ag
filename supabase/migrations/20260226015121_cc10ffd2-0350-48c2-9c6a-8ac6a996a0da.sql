
-- Fix 1.3: RLS log poisoning - validate operation ownership
DROP POLICY IF EXISTS "Users can insert own operation logs" ON public.operation_logs;

CREATE POLICY "Users can insert logs for own operations"
ON public.operation_logs FOR INSERT
WITH CHECK (
  auth.uid() = user_id AND
  EXISTS (
    SELECT 1 FROM public.operations o
    WHERE o.id = operation_id AND o.user_id = auth.uid()
  )
);
