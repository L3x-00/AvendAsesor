-- Fase 3 del plan de rendimiento de navegación: resolver en una sola consulta
-- la identidad, el papel, el estado y el permiso de módulos de la sesión.
--
-- Antes, cada ruta del panel encadenaba tres viajes a Supabase:
--   auth.getUser() -> profiles -> current_user_has_admin_module_access()
-- Bajo `experimental.staleTimes` las revisitas ya no pagan ese coste, pero la
-- primera visita sí: 0,9-1,4 s medidos en producción. Unificarlo en un RPC lo
-- deja en un viaje sin mover ninguna decisión de seguridad a la web.
--
-- La identidad NO se recibe como parámetro: se toma de `auth.uid()`, que viene
-- del token verificado. Así un cliente no puede pedir el contexto de otro
-- usuario. El permiso se calcula con la misma función `has_admin_module_access`
-- que se usaba antes, por lo que el modelo de permisos no cambia.

create function public.current_user_access_context()
returns table (
  user_id uuid,
  role public.app_role,
  account_status public.account_status,
  full_name text,
  access_expires_at timestamptz,
  modules_access boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    profile.id,
    profile.role,
    profile.account_status,
    profile.full_name,
    profile.access_expires_at,
    public.has_admin_module_access(profile.id)
  from public.profiles as profile
  where profile.id = (select auth.uid());
$$;

revoke all on function public.current_user_access_context() from public, anon, authenticated;
grant execute on function public.current_user_access_context() to authenticated;
