create function private.enforce_live_module_hierarchy()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  parent_is_deleted boolean;
begin
  if new.parent_module_id is not null then
    select module.is_deleted
    into parent_is_deleted
    from public.modules as module
    where module.id = new.parent_module_id
    for update;

    if parent_is_deleted then
      raise exception 'A module cannot be placed under a logically deleted parent';
    end if;
  end if;

  if new.is_deleted
    and (tg_op = 'INSERT' or not old.is_deleted)
    and exists (
      select 1
      from public.modules as child
      where child.parent_module_id = new.id
        and not child.is_deleted
    ) then
    raise exception 'A module with non-deleted children cannot be logically deleted';
  end if;

  return new;
end;
$$;

revoke all on function private.enforce_live_module_hierarchy() from public;

create trigger modules_prevent_deleted_parent_assignment
before insert or update of parent_module_id on public.modules
for each row execute procedure private.enforce_live_module_hierarchy();

create trigger modules_prevent_logical_deletion_with_live_children
before update of is_deleted on public.modules
for each row execute procedure private.enforce_live_module_hierarchy();
