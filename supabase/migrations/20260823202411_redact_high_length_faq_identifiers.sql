-- A canonical FAQ question must never preserve an identifier merely because it
-- is longer than a local document-number convention. This includes payment-card
-- sized values and future identifiers; application and database both redact or
-- reject any numeric sequence of eight or more digits.

create or replace function private.validate_faq_memory_candidate_redaction()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  candidate_without_iso_dates text := regexp_replace(
    new.canonical_question,
    '[0-9]{4}[-/][0-9]{2}[-/][0-9]{2}',
    '',
    'g'
  );
begin
  if new.canonical_question ~* '[A-Z0-9._%+-]+@[A-Z0-9.-]+[.][A-Z]{2,}'
    or new.canonical_question ~ '(^|[^0-9])[0-9]{8,}([^0-9]|$)'
    or candidate_without_iso_dates ~ '(^|[^0-9])([0-9]{2,4}[ ./-]){1,3}[0-9]{2,4}([^0-9]|$)' then
    raise exception using
      errcode = '22023',
      message = 'FAQ memory candidate contains an unredacted direct identifier';
  end if;

  return new;
end;
$$;
