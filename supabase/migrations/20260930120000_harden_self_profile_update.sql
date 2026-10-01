-- TSK-0070 / ADR-0023: la edición del propio perfil deja de ser una escritura
-- directa del navegador sobre public.profiles y pasa a una RPC acotada,
-- public.update_own_profile. Corrige los hallazgos de la auditoría de PR #89:
--
--  * perfil-db-1: sin el GRANT directo nadie puede guardar un nombre con
--    relleno de espacios (su longitud en bruto no tenía límite y rompía el
--    directorio del superadministrador). Además, la base exige ahora que el
--    nombre esté recortado y mida 2..160 caracteres en bruto.
--  * perfil-db-2: la RPC rechaza cuentas suspendidas o con acceso vencido.
--  * perfil-db-3: se revoca UPDATE(full_name, phone, department, city) a
--    authenticated y se elimina la política de UPDATE propia (ADR-0003 §4).
--  * perfil-db-4: updated_at solo cambia con los datos del registro, no con
--    last_access_at; la autoedición deja updated_by = la propia persona.
--  * perfil-db-7: la RPC recorta también espacios Unicode (NBSP, tabulador,
--    saltos de línea, espacios de ancho cero) y convierte los vacíos en null.
--  * perfil-db-8: admin y superadmin no pueden cambiar su propio nombre.

-- 1. Cerrar la escritura directa desde el navegador.
drop policy if exists "Authenticated users can update their own profile"
on public.profiles;

revoke update (full_name, phone, department, city)
on table public.profiles from authenticated;
-- Revocar a nivel de tabla también retira cualquier privilegio de columna.
revoke insert, update, delete on table public.profiles from anon, authenticated;

-- 2. updated_at refleja cambios de datos, no el último acceso.
-- touch_profile_last_access solo escribe last_access_at, así que ya no mueve
-- la «Última modificación» del directorio ni de la exportación.
drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at
before update of
  full_name,
  role,
  account_status,
  status_changed_at,
  status_changed_by,
  status_reason,
  access_start_at,
  access_expires_at,
  phone,
  department,
  city,
  created_by,
  updated_by
on public.profiles
for each row execute procedure private.set_updated_at();

comment on column public.profiles.updated_by is
  'Última persona que modificó los datos del registro: un administrador o, '
  'desde Mi perfil, la propia persona.';

-- 3. Invariante del nombre en bruto. El CHECK original solo medía btrim(),
-- así que un relleno de espacios a los lados no tenía límite. Todas las vías
-- de escritura (handle_new_user, provision_administrative_user y la RPC nueva)
-- ya guardan el nombre recortado; se normalizan las filas previas por si la
-- escritura directa se usó mientras estuvo abierta. btrim() conserva siempre
-- 2..160 caracteres porque el CHECK original ya lo garantizaba.
update public.profiles as profile
set full_name = btrim(profile.full_name)
where profile.full_name <> btrim(profile.full_name);

-- Evita 55006 si el UPDATE anterior dejó eventos de trigger pendientes.
set constraints all immediate;

alter table public.profiles
  drop constraint if exists profiles_full_name_trimmed_check;

alter table public.profiles
  add constraint profiles_full_name_trimmed_check
  check (
    full_name = btrim(full_name)
    and char_length(full_name) between 2 and 160
  );

-- 4. RPC de edición del propio perfil.
create or replace function public.update_own_profile(
  p_full_name text,
  p_phone text,
  p_department text,
  p_city text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  -- Blancos en los extremos: los que quita String.prototype.trim() de JS
  -- (\s, NBSP, espacios tipográficos, separadores de línea y párrafo, BOM)
  -- más los de ancho cero (U+200B..U+200D y U+2060). Escapes \xHHHH del
  -- motor de expresiones regulares de PostgreSQL.
  edge_blank constant text :=
    '^[\s\xa0\x1680\x2000-\x200d\x2028\x2029\x202f\x205f\x2060\x3000\xfeff]+'
    '|[\s\xa0\x1680\x2000-\x200d\x2028\x2029\x202f\x205f\x2060\x3000\xfeff]+$';
  -- Caracteres de control (C0, DEL y C1): nunca válidos dentro de un dato.
  control_char constant text := '[\x01-\x1f\x7f-\x9f]';
  requester_id uuid := auth.uid();
  target public.profiles%rowtype;
  requested_name text;
  next_name text;
  next_phone text;
  next_department text;
  next_city text;
begin
  if requester_id is null then
    raise exception using errcode = '28000', message = 'not_authenticated';
  end if;

  select * into target
  from public.profiles as profile
  where profile.id = requester_id
  for update;

  -- Misma regla que resolve-chat-access.ts (web) y AuthorizationService
  -- (API): cuenta activa y acceso sin vencer (vence cuando
  -- access_expires_at < now()). access_start_at es solo informativo.
  if not found
    or target.account_status <> 'active'
    or (
      target.access_expires_at is not null
      and target.access_expires_at < now()
    ) then
    raise exception using errcode = '42501', message = 'profile_inactive';
  end if;

  requested_name := regexp_replace(
    coalesce(p_full_name, ''),
    edge_blank,
    '',
    'g'
  );

  if target.role = 'docente' then
    if char_length(requested_name) not between 2 and 160
      or requested_name ~ control_char then
      raise exception using errcode = '22023', message = 'invalid_full_name';
    end if;

    next_name := requested_name;
  else
    -- El nombre de admin y superadmin lo gestiona la administración. Se
    -- acepta que envíen su nombre actual, o ninguno (null o vacío), y se
    -- conserva el guardado tal cual.
    if requested_name <> ''
      and requested_name
        <> regexp_replace(target.full_name, edge_blank, '', 'g') then
      raise exception using errcode = '42501', message = 'name_managed_by_admin';
    end if;

    next_name := target.full_name;
  end if;

  next_phone := nullif(
    regexp_replace(coalesce(p_phone, ''), edge_blank, '', 'g'),
    ''
  );
  if next_phone is not null
    and (
      char_length(next_phone) not between 6 and 20
      or next_phone ~ control_char
    ) then
    raise exception using errcode = '22023', message = 'invalid_phone';
  end if;

  next_department := nullif(
    regexp_replace(coalesce(p_department, ''), edge_blank, '', 'g'),
    ''
  );
  if next_department is not null
    and (
      char_length(next_department) not between 2 and 120
      or next_department ~ control_char
    ) then
    raise exception using errcode = '22023', message = 'invalid_department';
  end if;

  next_city := nullif(
    regexp_replace(coalesce(p_city, ''), edge_blank, '', 'g'),
    ''
  );
  if next_city is not null
    and (
      char_length(next_city) not between 2 and 120
      or next_city ~ control_char
    ) then
    raise exception using errcode = '22023', message = 'invalid_city';
  end if;

  -- Guardar sin cambios no mueve «Última modificación» ni «Modificado por».
  if next_name is distinct from target.full_name
    or next_phone is distinct from target.phone
    or next_department is distinct from target.department
    or next_city is distinct from target.city then
    update public.profiles as profile
    set
      full_name = next_name,
      phone = next_phone,
      department = next_department,
      city = next_city,
      updated_by = requester_id
    where profile.id = requester_id;
  end if;
end;
$$;

alter function public.update_own_profile(text, text, text, text)
  owner to postgres;

revoke all on function public.update_own_profile(text, text, text, text)
  from public, anon, authenticated, service_role;
grant execute on function public.update_own_profile(text, text, text, text)
  to authenticated;

comment on function public.update_own_profile(text, text, text, text) is
  'Edición del propio perfil (Mi perfil). Solo cuentas activas y vigentes. '
  'Errores en el mensaje: not_authenticated (28000), profile_inactive y '
  'name_managed_by_admin (42501), invalid_full_name, invalid_phone, '
  'invalid_department e invalid_city (22023). ADR-0023.';

notify pgrst, 'reload schema';
