begin;

select plan(36);

select has_column(
  'public',
  'profiles',
  'access_expires_at',
  'Profiles expose an optional access-expiry timestamp'
);
select ok(
  (
    select is_nullable = 'YES' and column_default is null
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'profiles'
      and column_name = 'access_expires_at'
  ),
  'A null access expiry represents indefinite access'
);
select ok(
  (
    select position(
      'access_expires_at is not null'
      in lower(pg_get_indexdef(index_definition.indexrelid))
    ) > 0
    from pg_index as index_definition
    where index_definition.indexrelid =
      'public.profiles_access_expires_at_idx'::regclass
  ),
  'The expiry lookup uses a partial index that omits indefinite access rows'
);
select has_function(
  'public',
  'get_admin_home_dashboard_metrics',
  array['uuid', 'integer'],
  'The administrative home has a dedicated aggregate RPC'
);
select ok(
  (
    select procedure_definition.prosecdef
    from pg_proc as procedure_definition
    where procedure_definition.oid =
      'public.get_admin_home_dashboard_metrics(uuid,integer)'::regprocedure
  ),
  'The aggregate RPC is a SECURITY DEFINER function'
);
select is(
  (
    select array_to_string(procedure_definition.proconfig, ' | ')
    from pg_proc as procedure_definition
    where procedure_definition.oid =
      'public.get_admin_home_dashboard_metrics(uuid,integer)'::regprocedure
  ),
  'search_path=""',
  'The aggregate RPC has an empty search path'
);
select ok(
  not has_function_privilege(
    'public',
    'public.get_admin_home_dashboard_metrics(uuid,integer)'::regprocedure,
    'execute'
  ),
  'PUBLIC cannot execute the privileged dashboard RPC'
);
select ok(
  not has_function_privilege(
    'anon',
    'public.get_admin_home_dashboard_metrics(uuid,integer)'::regprocedure,
    'execute'
  ),
  'Anonymous clients cannot execute the privileged dashboard RPC'
);
select ok(
  not has_function_privilege(
    'authenticated',
    'public.get_admin_home_dashboard_metrics(uuid,integer)'::regprocedure,
    'execute'
  ),
  'Authenticated clients cannot execute the privileged dashboard RPC directly'
);
select ok(
  has_function_privilege(
    'service_role',
    'public.get_admin_home_dashboard_metrics(uuid,integer)'::regprocedure,
    'execute'
  ),
  'The server role can execute the dashboard RPC'
);

insert into auth.users (
  id,
  aud,
  role,
  email,
  raw_app_meta_data,
  raw_user_meta_data,
  created_at,
  updated_at
)
values
  (
    '00000000-0000-0000-0000-00000000d001',
    'authenticated', 'authenticated', 'dashboard-admin@example.test',
    '{}'::jsonb, '{"full_name":"Administrador Dashboard"}'::jsonb,
    now(), now()
  ),
  (
    '00000000-0000-0000-0000-00000000d002',
    'authenticated', 'authenticated', 'dashboard-owner@example.test',
    '{}'::jsonb, '{"full_name":"Superadministrador Dashboard"}'::jsonb,
    now(), now()
  ),
  (
    '00000000-0000-0000-0000-00000000d003',
    'authenticated', 'authenticated', 'dashboard-docente@example.test',
    '{}'::jsonb, '{"full_name":"Docente Indefinido"}'::jsonb,
    now(), now()
  ),
  (
    '00000000-0000-0000-0000-00000000d004',
    'authenticated', 'authenticated', 'dashboard-boundary@example.test',
    '{}'::jsonb, '{"full_name":"Docente Limite Actual"}'::jsonb,
    now(), now()
  ),
  (
    '00000000-0000-0000-0000-00000000d005',
    'authenticated', 'authenticated', 'dashboard-week@example.test',
    '{}'::jsonb, '{"full_name":"Docente Limite Semana"}'::jsonb,
    now(), now()
  ),
  (
    '00000000-0000-0000-0000-00000000d006',
    'authenticated', 'authenticated', 'dashboard-inside@example.test',
    '{}'::jsonb, '{"full_name":"Docente Dentro Semana"}'::jsonb,
    now(), now()
  ),
  (
    '00000000-0000-0000-0000-00000000d007',
    'authenticated', 'authenticated', 'dashboard-expired@example.test',
    '{}'::jsonb, '{"full_name":"Docente Expirado"}'::jsonb,
    now(), now()
  ),
  (
    '00000000-0000-0000-0000-00000000d008',
    'authenticated', 'authenticated', 'dashboard-suspended@example.test',
    '{}'::jsonb, '{"full_name":"Administrador Suspendido"}'::jsonb,
    now(), now()
  );

update public.profiles
set role = case id
  when '00000000-0000-0000-0000-00000000d001'::uuid
    then 'admin'::public.app_role
  when '00000000-0000-0000-0000-00000000d002'::uuid
    then 'superadmin'::public.app_role
  when '00000000-0000-0000-0000-00000000d007'::uuid
    then 'admin'::public.app_role
  when '00000000-0000-0000-0000-00000000d008'::uuid
    then 'admin'::public.app_role
  else role
end,
access_expires_at = case id
  when '00000000-0000-0000-0000-00000000d004'::uuid then now()
  when '00000000-0000-0000-0000-00000000d005'::uuid
    then now() + interval '7 days'
  when '00000000-0000-0000-0000-00000000d006'::uuid
    then now() + interval '7 days' - interval '1 second'
  when '00000000-0000-0000-0000-00000000d007'::uuid
    then now() - interval '1 second'
  when '00000000-0000-0000-0000-00000000d008'::uuid
    then now() - interval '2 days'
  else null
end;

update public.profiles
set
  account_status = 'suspended',
  status_changed_at = now(),
  status_changed_by = '00000000-0000-0000-0000-00000000d001',
  status_reason = 'Suspensión ficticia para validar autorización.'
where id = '00000000-0000-0000-0000-00000000d008';

insert into public.modules (id, name, code, sort_order)
values
  (
    '00000000-0000-0000-0000-00000000e101',
    'Contrato y desplazamiento', 'QA_CONTRATO_DESPLAZAMIENTO', 10
  ),
  (
    '00000000-0000-0000-0000-00000000e102',
    'Evaluacion docente', 'QA_EVALUACION_DOCENTE', 20
  ),
  (
    '00000000-0000-0000-0000-00000000e103',
    'Situaciones administrativas', 'QA_SITUACIONES_ADMIN', 30
  ),
  (
    '00000000-0000-0000-0000-00000000e104',
    'Auxiliar de educacion', 'QA_AUXILIAR_EDUCACION', 40
  ),
  (
    '00000000-0000-0000-0000-00000000e105',
    'Ley y reglamento', 'QA_LEY_REGLAMENTO', 50
  ),
  (
    '00000000-0000-0000-0000-00000000e106',
    'Cargos y plazas', 'QA_CARGOS_PLAZAS', 60
  ),
  (
    '00000000-0000-0000-0000-00000000e107',
    'Remuneraciones', 'QA_REMUNERACIONES', 70
  );

update public.modules
set
  is_active = false,
  deactivated_at = now(),
  deactivated_by = '00000000-0000-0000-0000-00000000d001',
  deactivation_reason = 'Módulo inactivo para validar la métrica.'
where id = '00000000-0000-0000-0000-00000000e107';

insert into public.modules (
  id,
  parent_module_id,
  name,
  code,
  sort_order
)
values
  (
    '00000000-0000-0000-0000-00000000e201',
    '00000000-0000-0000-0000-00000000e101',
    'Submódulo activo', 'DASHBOARD_CHILD_ACTIVE', 10
  ),
  (
    '00000000-0000-0000-0000-00000000e202',
    '00000000-0000-0000-0000-00000000e201',
    'Descendiente activo', 'DASHBOARD_GRANDCHILD_ACTIVE', 20
  ),
  (
    '00000000-0000-0000-0000-00000000e203',
    '00000000-0000-0000-0000-00000000e101',
    'Submódulo inactivo', 'DASHBOARD_CHILD_INACTIVE', 30
  ),
  (
    '00000000-0000-0000-0000-00000000e204',
    '00000000-0000-0000-0000-00000000e101',
    'Submódulo eliminado', 'DASHBOARD_CHILD_DELETED', 40
  );

update public.modules
set
  is_active = false,
  deactivated_at = now(),
  deactivated_by = '00000000-0000-0000-0000-00000000d001',
  deactivation_reason = 'Submódulo inactivo para validar conteos.'
where id in (
  '00000000-0000-0000-0000-00000000e203',
  '00000000-0000-0000-0000-00000000e204'
);

update public.modules
set
  is_deleted = true,
  deleted_at = now(),
  deleted_by = '00000000-0000-0000-0000-00000000d001',
  deletion_reason = 'Submódulo eliminado para validar conteos.'
where id = '00000000-0000-0000-0000-00000000e204';

insert into public.documents (
  id,
  title,
  document_type,
  publication_status,
  deactivated_at,
  deactivated_by,
  deactivation_reason,
  is_deleted,
  deleted_at,
  deleted_by,
  deletion_reason,
  situation
)
values
  (
    '00000000-0000-0000-0000-00000000f101',
    'Documento inactivo vinculado dos veces',
    'LEY',
    'inactive',
    now(),
    '00000000-0000-0000-0000-00000000d001',
    'Documento inactivo conservado en biblioteca.',
    false,
    null,
    null,
    null,
    'archived'
  ),
  (
    '00000000-0000-0000-0000-00000000f102',
    'Documento inactivo del descendiente',
    'RESOLUCION',
    'inactive',
    now(),
    '00000000-0000-0000-0000-00000000d001',
    'Documento inactivo conservado en biblioteca.',
    false,
    null,
    null,
    null,
    'archived'
  ),
  (
    '00000000-0000-0000-0000-00000000f103',
    'Documento eliminado lógicamente',
    'DIRECTIVA',
    'inactive',
    now(),
    '00000000-0000-0000-0000-00000000d001',
    'Documento inactivo antes de su eliminación.',
    true,
    now(),
    '00000000-0000-0000-0000-00000000d001',
    'Documento eliminado para validar conteos.',
    'archived'
  ),
  (
    '00000000-0000-0000-0000-00000000f104',
    'Documento conservado de submódulo eliminado',
    'DIRECTIVA',
    'inactive',
    now(),
    '00000000-0000-0000-0000-00000000d001',
    'Documento no vigente conservado en biblioteca.',
    false,
    null,
    null,
    null,
    'archived'
  );

insert into public.document_modules (document_id, module_id, created_by)
values
  (
    '00000000-0000-0000-0000-00000000f101',
    '00000000-0000-0000-0000-00000000e101',
    '00000000-0000-0000-0000-00000000d001'
  ),
  (
    '00000000-0000-0000-0000-00000000f101',
    '00000000-0000-0000-0000-00000000e201',
    '00000000-0000-0000-0000-00000000d001'
  ),
  (
    '00000000-0000-0000-0000-00000000f102',
    '00000000-0000-0000-0000-00000000e202',
    '00000000-0000-0000-0000-00000000d001'
  ),
  (
    '00000000-0000-0000-0000-00000000f103',
    '00000000-0000-0000-0000-00000000e101',
    '00000000-0000-0000-0000-00000000d001'
  ),
  (
    '00000000-0000-0000-0000-00000000f104',
    '00000000-0000-0000-0000-00000000e204',
    '00000000-0000-0000-0000-00000000d001'
  );

insert into public.chat_conversations (id, user_id, title)
values (
  '00000000-0000-0000-0000-00000000f201',
  '00000000-0000-0000-0000-00000000d003',
  'Conversación ficticia para métricas'
);

insert into public.chat_messages (id, conversation_id, role, content)
values
  (
    '00000000-0000-0000-0000-00000000f301',
    '00000000-0000-0000-0000-00000000f201',
    'user',
    'Primera consulta ficticia'
  ),
  (
    '00000000-0000-0000-0000-00000000f302',
    '00000000-0000-0000-0000-00000000f201',
    'user',
    'Segunda consulta ficticia'
  ),
  (
    '00000000-0000-0000-0000-00000000f303',
    '00000000-0000-0000-0000-00000000f201',
    'user',
    'Tercera consulta ficticia'
  );

insert into public.chat_messages (
  id,
  conversation_id,
  role,
  content,
  in_reply_to_message_id
)
values
  (
    '00000000-0000-0000-0000-00000000f311',
    '00000000-0000-0000-0000-00000000f201',
    'assistant',
    'Respuesta IA ficticia',
    '00000000-0000-0000-0000-00000000f301'
  ),
  (
    '00000000-0000-0000-0000-00000000f312',
    '00000000-0000-0000-0000-00000000f201',
    'clarification',
    'Aclaración reglada ficticia',
    '00000000-0000-0000-0000-00000000f302'
  ),
  (
    '00000000-0000-0000-0000-00000000f313',
    '00000000-0000-0000-0000-00000000f201',
    'no_evidence',
    'Salida sin evidencia ficticia',
    '00000000-0000-0000-0000-00000000f303'
  );

select lives_ok(
  $$
    select * from public.get_admin_home_dashboard_metrics(
      '00000000-0000-0000-0000-00000000d001'
    )
  $$,
  'An active administrator can read the home dashboard'
);
select lives_ok(
  $$
    select * from public.get_admin_home_dashboard_metrics(
      '00000000-0000-0000-0000-00000000d002'
    )
  $$,
  'An active superadministrator can read the home dashboard'
);
select throws_ok(
  $$
    select * from public.get_admin_home_dashboard_metrics(
      '00000000-0000-0000-0000-00000000d003'
    )
  $$,
  '42501',
  'Only an active administrator may perform this operation',
  'A docente cannot read administrative dashboard data'
);
select throws_ok(
  $$
    select * from public.get_admin_home_dashboard_metrics(
      '00000000-0000-0000-0000-00000000d008'
    )
  $$,
  '42501',
  'Only an active administrator may perform this operation',
  'A suspended administrator cannot read administrative dashboard data'
);
select throws_ok(
  $$
    select * from public.get_admin_home_dashboard_metrics(
      '00000000-0000-0000-0000-00000000d007'
    )
  $$,
  '42501',
  'Only an active administrator may perform this operation',
  'An expired administrator cannot read administrative dashboard data'
);
select throws_ok(
  $$
    select * from public.get_admin_home_dashboard_metrics(
      '00000000-0000-0000-0000-00000000d001',
      0
    )
  $$,
  '22023',
  'The expiring-soon window must be between 1 and 365 days',
  'The expiry window cannot bypass its supported bounds'
);
select is(
  (
    select total_users
    from public.get_admin_home_dashboard_metrics(
      '00000000-0000-0000-0000-00000000d001'
    )
  ),
  8::bigint,
  'Registered users count every profile'
);
select is(
  (
    select active_users
    from public.get_admin_home_dashboard_metrics(
      '00000000-0000-0000-0000-00000000d001'
    )
  ),
  6::bigint,
  'Active users require active status and non-expired or indefinite access'
);
select is(
  (
    select expiring_soon_users
    from public.get_admin_home_dashboard_metrics(
      '00000000-0000-0000-0000-00000000d001'
    )
  ),
  2::bigint,
  'Expiring soon includes now and excludes the exact seven-day upper bound'
);
select is(
  (
    select expired_users
    from public.get_admin_home_dashboard_metrics(
      '00000000-0000-0000-0000-00000000d001'
    )
  ),
  2::bigint,
  'Expired users count every past access expiry independently of account status'
);
select is(
  (
    select expiry_window_days
    from public.get_admin_home_dashboard_metrics(
      '00000000-0000-0000-0000-00000000d001'
    )
  ),
  7,
  'The technical expiry window defaults to seven days'
);
select is(
  (
    select expiring_soon_users
    from public.get_admin_home_dashboard_metrics(
      '00000000-0000-0000-0000-00000000d001',
      1
    )
  ),
  1::bigint,
  'A custom window is calculated from the same inclusive and exclusive boundaries'
);
select is(
  (
    select active_modules
    from public.get_admin_home_dashboard_metrics(
      '00000000-0000-0000-0000-00000000d001'
    )
  ),
  6::bigint,
  'Active module totals include only active non-deleted roots'
);
select is(
  (
    select active_submodules
    from public.get_admin_home_dashboard_metrics(
      '00000000-0000-0000-0000-00000000d001'
    )
  ),
  2::bigint,
  'Active submodule totals include only active non-deleted non-roots'
);
select is(
  (
    select total_documents
    from public.get_admin_home_dashboard_metrics(
      '00000000-0000-0000-0000-00000000d001'
    )
  ),
  3::bigint,
  'Document totals include inactive library records even when their module was deleted'
);
select is(
  (
    select total_queries
    from public.get_admin_home_dashboard_metrics(
      '00000000-0000-0000-0000-00000000d001'
    )
  ),
  3::bigint,
  'Total queries count every user chat message'
);
select is(
  (
    select ai_queries_processed
    from public.get_admin_home_dashboard_metrics(
      '00000000-0000-0000-0000-00000000d001'
    )
  ),
  1::bigint,
  'AI consumption counts assistant replies but not deterministic clarification or no-evidence outcomes'
);
select is(
  (
    select jsonb_array_length(module_summaries)
    from public.get_admin_home_dashboard_metrics(
      '00000000-0000-0000-0000-00000000d001'
    )
  ),
  7,
  'The dashboard returns exactly seven canonical module summaries'
);
select is(
  (
    select string_agg(summary.value ->> 'name', ' | ' order by summary.ordinality)
    from public.get_admin_home_dashboard_metrics(
      '00000000-0000-0000-0000-00000000d001'
    ) as dashboard
    cross join lateral jsonb_array_elements(dashboard.module_summaries)
      with ordinality as summary(value, ordinality)
  ),
  'Contratación y desplazamientos | Evaluación docente | Situaciones administrativas | Auxiliar de educación | Ley y reglamento | Cargos y plazas | Remuneraciones',
  'Legacy production identifiers are exposed with exact canonical labels and order'
);
select is(
  (
    select string_agg(summary.value ->> 'id', ' | ' order by summary.ordinality)
    from public.get_admin_home_dashboard_metrics(
      '00000000-0000-0000-0000-00000000d001'
    ) as dashboard
    cross join lateral jsonb_array_elements(dashboard.module_summaries)
      with ordinality as summary(value, ordinality)
  ),
  '00000000-0000-0000-0000-00000000e101 | 00000000-0000-0000-0000-00000000e102 | 00000000-0000-0000-0000-00000000e103 | 00000000-0000-0000-0000-00000000e104 | 00000000-0000-0000-0000-00000000e105 | 00000000-0000-0000-0000-00000000e106 | 00000000-0000-0000-0000-00000000e107',
  'Every canonical card resolves to a distinct real root module id'
);
select is(
  (
    select (module_summaries -> 0 ->> 'submoduleCount')::bigint
    from public.get_admin_home_dashboard_metrics(
      '00000000-0000-0000-0000-00000000d001'
    )
  ),
  3::bigint,
  'Module summaries count all non-deleted descendants at any depth'
);
select is(
  (
    select (module_summaries -> 0 ->> 'documentCount')::bigint
    from public.get_admin_home_dashboard_metrics(
      '00000000-0000-0000-0000-00000000d001'
    )
  ),
  2::bigint,
  'Module summaries count distinct non-deleted documents across visible descendants'
);
select ok(
  (
    select
      (module_summaries -> 1 ->> 'submoduleCount')::bigint = 0
      and (module_summaries -> 1 ->> 'documentCount')::bigint = 0
    from public.get_admin_home_dashboard_metrics(
      '00000000-0000-0000-0000-00000000d001'
    )
  ),
  'A configured module without content returns explicit zero counts'
);
select ok(
  (
    select not (
      to_jsonb(dashboard) ? 'pending_unanswered_questions'
      or to_jsonb(dashboard) ? 'resolved_unanswered_questions'
      or to_jsonb(dashboard) ? 'dismissed_unanswered_questions'
    )
    from public.get_admin_home_dashboard_metrics(
      '00000000-0000-0000-0000-00000000d001'
    ) as dashboard
  ),
  'Inicio exposes no RAG incident or review-queue metric'
);
select is(
  (
    select count(*)
    from public.get_admin_home_dashboard_metrics(
      '00000000-0000-0000-0000-00000000d001'
    )
  ),
  1::bigint,
  'The aggregate RPC returns exactly one dashboard row'
);

delete from public.modules
where id = '00000000-0000-0000-0000-00000000e107';

select throws_ok(
  $$
    select * from public.get_admin_home_dashboard_metrics(
      '00000000-0000-0000-0000-00000000d001'
    )
  $$,
  'P0002',
  'The seven canonical AVEND ASESOR modules are not configured',
  'The dashboard fails closed instead of returning a non-navigable module card'
);

select * from finish();
rollback;
