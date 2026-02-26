-- Fix: distributor_id should reference campaign_distributors, not auth.users
ALTER TABLE public.operations DROP CONSTRAINT operations_distributor_id_fkey;

ALTER TABLE public.operations 
ADD CONSTRAINT operations_distributor_id_fkey 
FOREIGN KEY (distributor_id) REFERENCES public.campaign_distributors(id);
