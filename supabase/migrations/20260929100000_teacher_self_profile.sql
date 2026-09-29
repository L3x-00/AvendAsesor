-- Datos opcionales del perfil docente y edición propia acotada.
-- El correo continúa viviendo únicamente en auth.users.

alter table public.profiles
  add column if not exists department text,
  add column if not exists city text;

alter table public.profiles
  drop constraint if exists profiles_department_length_check,
  drop constraint if exists profiles_city_length_check;

alter table public.profiles
  add constraint profiles_department_length_check
  check (
    department is null
    or (
      department = btrim(department)
      and char_length(department) between 2 and 120
    )
  ),
  add constraint profiles_city_length_check
  check (
    city is null
    or (
      city = btrim(city)
      and char_length(city) between 2 and 120
    )
  );

comment on column public.profiles.department is
  'Departamento o región de residencia declarado por la persona usuaria.';
comment on column public.profiles.city is
  'Ciudad de residencia declarada por la persona usuaria.';

-- La persona solo puede modificar estas columnas. Rol, estado y vigencia
-- siguen fuera de su alcance y continúan bajo control administrativo.
revoke update (updated_at) on table public.profiles from authenticated;
grant update (full_name, phone, department, city)
on table public.profiles to authenticated;

drop policy if exists "Authenticated users can update their own profile"
on public.profiles;

create policy "Authenticated users can update their own profile"
on public.profiles
for update
to authenticated
using ((select auth.uid()) = id)
with check ((select auth.uid()) = id);

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at
before update on public.profiles
for each row execute procedure private.set_updated_at();
