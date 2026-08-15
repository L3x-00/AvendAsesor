-- The browser roles remain unable to update profiles. This narrow permission
-- supports controlled server-side role assignment without granting profile
-- mutation broadly to the service client.
grant update (role) on table public.profiles to service_role;
