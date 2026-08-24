-- Extend the previous guard to cover RUC/carne lengths and common separated
-- identifier formats. ISO dates remain accepted because they are useful
-- normative context and do not match the separated-identifier expressions.

create or replace function private.validate_faq_memory_candidate_redaction()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.canonical_question ~* '[A-Z0-9._%+-]+@[A-Z0-9.-]+[.][A-Z]{2,}'
    or new.canonical_question ~ '(^|[^0-9])[0-9]{8,12}([^0-9]|$)'
    or new.canonical_question ~ '(^|[^0-9])([0-9]{4}[ .-][0-9]{4}|[0-9]{2,4}[ .-][0-9]{3,4}[ .-][0-9]{3,4})([^0-9]|$)' then
    raise exception using
      errcode = '22023',
      message = 'FAQ memory candidate contains an unredacted direct identifier';
  end if;

  return new;
end;
$$;
