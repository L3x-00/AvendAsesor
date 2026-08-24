create or replace function public.claim_document_ingestion_job(
  p_lease_seconds integer default 300
)
returns table (
  job_id uuid,
  lease_token uuid,
  document_id uuid,
  document_version_id uuid,
  storage_bucket text,
  storage_path text,
  page_count integer,
  sha256 text,
  attempt_count integer
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  candidate public.document_ingestion_jobs%rowtype;
  next_lease_token uuid;
begin
  if p_lease_seconds not between 30 and 900 then
    raise exception using
      errcode = '22023',
      message = 'Lease duration must be between 30 and 900 seconds';
  end if;

  loop
    select * into candidate
    from public.document_ingestion_jobs
    where (
      status = 'pending'
      or (status = 'processing' and lease_expires_at < now())
    )
    order by requested_at, id
    for update skip locked
    limit 1;

    if not found then
      return;
    end if;

    if candidate.status = 'processing'
      and candidate.attempt_count >= candidate.max_attempts then
      update public.document_ingestion_jobs
      set
        status = 'failed',
        lease_token = null,
        leased_at = null,
        lease_expires_at = null,
        last_error_code = 'LEASE_EXPIRED',
        last_error_message = 'The ingestion worker lease expired before completion.',
        completed_at = now(),
        updated_at = now()
      where id = candidate.id;

      perform private.set_document_ingestion_status(
        candidate.document_version_id,
        'failed'
      );
      continue;
    end if;

    next_lease_token := gen_random_uuid();

    update public.document_ingestion_jobs as job
    set
      status = 'processing',
      attempt_count = job.attempt_count + 1,
      lease_token = next_lease_token,
      leased_at = now(),
      lease_expires_at = now() + make_interval(secs => p_lease_seconds),
      last_error_code = null,
      last_error_message = null,
      completed_at = null,
      updated_at = now()
    where job.id = candidate.id;

    if candidate.status = 'pending' then
      perform private.set_document_ingestion_status(
        candidate.document_version_id,
        'processing'
      );
    end if;

    return query
    select
      candidate.id,
      next_lease_token,
      candidate.document_id,
      candidate.document_version_id,
      version.storage_bucket,
      version.storage_path,
      version.page_count,
      version.sha256,
      candidate.attempt_count + 1
    from public.document_versions as version
    where version.id = candidate.document_version_id;
    return;
  end loop;
end;
$$;

-- The original function is deliberately fully qualified. The extension schema
-- is still required for its cosine operator at execution time.
alter function public.search_document_chunks(
  extensions.vector,
  text,
  uuid,
  real,
  integer
) set search_path to extensions, pg_catalog;
