-- An audit history can contain several events produced by one administrative
-- action. `now()` is transaction-scoped in PostgreSQL, so it made those events
-- indistinguishable and left their display order to a random UUID tie-breaker.
-- Keep the append-only history in the real order in which events are written.
alter table public.consultation_case_events
  alter column created_at set default clock_timestamp();
