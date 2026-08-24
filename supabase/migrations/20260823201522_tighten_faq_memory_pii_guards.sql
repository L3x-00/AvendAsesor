-- Defense in depth for direct identifiers that can be supplied by a compromised
-- or future server client. The application removes these values first, and the
-- database refuses a candidate if that reduction regresses.

create function private.validate_faq_memory_candidate_redaction()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.canonical_question ~* '[A-Z0-9._%+-]+@[A-Z0-9.-]+[.][A-Z]{2,}'
    or new.canonical_question ~ '(^|[^0-9])[0-9]{8}([^0-9]|$)' then
    raise exception using
      errcode = '22023',
      message = 'FAQ memory candidate contains an unredacted direct identifier';
  end if;

  return new;
end;
$$;

revoke all on function private.validate_faq_memory_candidate_redaction() from public;

create trigger faq_memory_candidates_validate_redaction
before insert or update of canonical_question on public.faq_memory_candidates
for each row execute procedure private.validate_faq_memory_candidate_redaction();
