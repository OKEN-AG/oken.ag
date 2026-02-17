
-- Allow all authenticated users to manage campaigns (sem controle por enquanto)
CREATE POLICY "Authenticated can manage campaigns"
ON public.campaigns
FOR ALL
TO authenticated
USING (true)
WITH CHECK (true);

-- Allow all authenticated users to manage channel_margins
CREATE POLICY "Authenticated can manage margins"
ON public.channel_margins
FOR ALL
TO authenticated
USING (true)
WITH CHECK (true);
