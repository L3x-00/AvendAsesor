-- This revoked v1 wrapper depends on the removed v1 recorder. Its v2
-- replacement is already the only API contract granted to the server role.
drop function public.complete_chat_turn_with_learning(
  uuid,
  uuid,
  uuid,
  public.chat_message_role,
  text,
  jsonb,
  public.unanswered_question_reason,
  real,
  text,
  text
);
