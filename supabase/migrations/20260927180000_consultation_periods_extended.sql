-- Filtros de reportes por día: además de hoy/semana/mes se admiten ventanas
-- móviles (6 h, 24 h, 7 d, 30 d) para el tablero operativo.
create or replace function private.consultation_period_start(p_period text)
returns timestamptz
language plpgsql
stable
set search_path = ''
as $$
declare
  local_now timestamp := timezone('America/Lima', now());
begin
  if p_period = 'today' then
    return date_trunc('day', local_now) at time zone 'America/Lima';
  end if;

  if p_period = 'week' then
    return date_trunc('week', local_now) at time zone 'America/Lima';
  end if;

  if p_period = 'month' then
    return date_trunc('month', local_now) at time zone 'America/Lima';
  end if;

  if p_period = 'last_6h' then
    return now() - interval '6 hours';
  end if;

  if p_period = 'last_24h' then
    return now() - interval '24 hours';
  end if;

  if p_period = 'last_7d' then
    return now() - interval '7 days';
  end if;

  if p_period = 'last_30d' then
    return now() - interval '30 days';
  end if;

  raise exception using
    errcode = '22023',
    message = 'The consultation period is invalid';
end;
$$;

revoke all on function private.consultation_period_start(text)
  from public, anon, authenticated;
