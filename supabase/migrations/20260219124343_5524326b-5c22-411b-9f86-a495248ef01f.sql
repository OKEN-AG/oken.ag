ALTER TABLE public.operation_documents
ADD COLUMN IF NOT EXISTS validated_at timestamptz;