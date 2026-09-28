begin;

select plan(5);

select ok(
  private.consultation_period_start('last_6h')
    between now() - interval '6 hours 1 minute'
    and now() - interval '5 hours 59 minutes',
  'La ventana de 6 horas resta seis horas exactas'
);

select ok(
  private.consultation_period_start('last_24h')
    between now() - interval '24 hours 1 minute'
    and now() - interval '23 hours 59 minutes',
  'La ventana de 24 horas resta un día exacto'
);

select ok(
  private.consultation_period_start('last_7d')
    between now() - interval '7 days 1 minute'
    and now() - interval '7 days' + interval '1 minute',
  'La ventana de 7 días resta una semana'
);

select ok(
  private.consultation_period_start('last_30d')
    between now() - interval '30 days 1 minute'
    and now() - interval '30 days' + interval '1 minute',
  'La ventana de 30 días resta un mes'
);

select ok(
  private.consultation_period_start('today')::date
    = (timezone('America/Lima', now()))::date,
  'Los periodos anteriores (today) siguen funcionando'
);

select * from finish();
rollback;
