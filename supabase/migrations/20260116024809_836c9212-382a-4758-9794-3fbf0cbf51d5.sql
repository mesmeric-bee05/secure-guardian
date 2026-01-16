-- Fix the first_aid_protocols select policy to be permissive (not restrictive)
DROP POLICY IF EXISTS "Anyone can view protocols" ON public.first_aid_protocols;

CREATE POLICY "Anyone can view protocols" 
ON public.first_aid_protocols 
FOR SELECT 
TO anon, authenticated
USING (true);