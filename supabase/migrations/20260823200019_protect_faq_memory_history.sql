-- FAQ observations and review records are decision evidence. They must remain
-- append-only even for the server role; a correction is represented by a new
-- review, never by rewriting prior operational history.

create function private.prevent_faq_memory_history_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception using
    errcode = '55000',
    message = 'FAQ memory history is append-only';
end;
$$;

revoke all on function private.prevent_faq_memory_history_mutation() from public;

create trigger faq_memory_observations_append_only
before update or delete on public.faq_memory_observations
for each row execute procedure private.prevent_faq_memory_history_mutation();

create trigger faq_memory_reviews_append_only
before update or delete on public.faq_memory_reviews
for each row execute procedure private.prevent_faq_memory_history_mutation();
