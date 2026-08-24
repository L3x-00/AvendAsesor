-- The privacy-first FAQ migration replaced this RPC with the explicitly named
-- v2 contract and revoked all legacy access. Remove the stale, invalid
-- definition so no unsupported server integration can revive it.

drop function public.list_faq_memory_candidates(
  uuid,
  public.faq_memory_review_status,
  integer
);
