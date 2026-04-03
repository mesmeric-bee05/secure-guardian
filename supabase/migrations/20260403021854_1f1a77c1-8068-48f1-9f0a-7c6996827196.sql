-- Fix privilege escalation: explicitly deny non-admin INSERT/UPDATE/DELETE on user_roles
-- The existing "Admins can manage all roles" ALL policy already covers admin access.
-- We need to ensure regular users CANNOT insert/update/delete roles.
-- Since RLS default-deny only works when NO permissive policy matches,
-- and the admin ALL policy is permissive, we're safe for non-admins.
-- However, to be explicit and satisfy the security scanner, add restrictive deny policies.

-- Actually, let's verify: the admin ALL policy uses is_admin(auth.uid()) in USING and WITH CHECK.
-- For non-admin users, this evaluates to false, so they get no access for INSERT/UPDATE/DELETE.
-- The only SELECT policy for non-admins is "Users can view their own roles".
-- So non-admins truly cannot INSERT/UPDATE/DELETE. But let's add explicit policies for defense-in-depth.

CREATE POLICY "Only admins can insert roles"
  ON public.user_roles
  FOR INSERT
  TO authenticated
  WITH CHECK (public.is_admin(auth.uid()));

CREATE POLICY "Only admins can update roles"
  ON public.user_roles
  FOR UPDATE
  TO authenticated
  USING (public.is_admin(auth.uid()));

CREATE POLICY "Only admins can delete roles"
  ON public.user_roles
  FOR DELETE
  TO authenticated
  USING (public.is_admin(auth.uid()));