-- Registra en la auditoría el envío de un enlace de restablecimiento de
-- contraseña (nunca la contraseña en sí). Solo un superadministrador activo.
create function public.record_user_password_reset(
  p_actor_id uuid,
  p_target_user_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.require_superadministrator(p_actor_id);

  if not exists (
    select 1 from public.profiles where id = p_target_user_id
  ) then
    raise exception using
      errcode = 'P0002',
      message = 'User profile was not found';
  end if;

  perform private.record_operational_audit(
    p_actor_id,
    'user_password_reset',
    'profile',
    p_target_user_id,
    jsonb_build_object('via', 'recovery_email')
  );
end;
$$;

revoke all on function public.record_user_password_reset(uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.record_user_password_reset(uuid, uuid)
  to service_role;
