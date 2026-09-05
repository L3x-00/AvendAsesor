-- Fase 3 "Usuarios y accesos": campos de directorio y trazabilidad por registro.
--
-- Solo columnas y el valor de enum, aislados de las funciones que los usan
-- (archivo siguiente): un valor de enum recien anadido no puede usarse en DML
-- dentro de la misma transaccion.
--
-- El correo NO se duplica aqui: vive en auth.users.email y se expone de solo
-- lectura desde las RPC del directorio. No se anade usuario/login separado ni
-- PIN (ADR-0017): el correo es el login y un PIN propio seria un segundo factor
-- debil.

alter type public.operational_audit_action
  add value if not exists 'user_created';

alter table public.profiles
  add column if not exists phone text,
  add column if not exists created_by uuid,
  add column if not exists updated_by uuid;

-- Celular opcional. Se guarda normalizado; el formato exacto varia por pais,
-- asi que la base solo garantiza una longitud razonable y ausencia de blancos
-- en los extremos.
alter table public.profiles
  drop constraint if exists profiles_phone_length_check;

alter table public.profiles
  add constraint profiles_phone_length_check
  check (
    phone is null
    or (
      phone = btrim(phone)
      and char_length(phone) between 6 and 20
    )
  );

comment on column public.profiles.phone is
  'Celular de contacto, opcional. El correo vive en auth.users y no se duplica.';
comment on column public.profiles.created_by is
  'Administrador que dio de alta el registro (trazabilidad por registro).';
comment on column public.profiles.updated_by is
  'Ultimo administrador que modifico el registro (trazabilidad por registro).';
