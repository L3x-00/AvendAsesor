# Release Hito 3–4 — estado y runbook de promoción

## Estado

**Estado remoto: BLOQUEADO.** El release local está preparado, pero no se
ejecutará una migración contra Supabase producción mientras falte recuperación
verificable y una validación staging.

La inspección remota de solo lectura del 2026-08-23 confirmó:

- Producción permanece en Hitos 1–2 (`20260809045322` a `20260809220458`).
- El proyecto no tiene PITR habilitado ni backup físico disponible.
- No existe una rama Supabase Preview ni un proyecto staging separado.

La autorización del Product Owner exige esos dos controles antes de promover,
por lo que el bloqueo es deliberado y no una falla técnica del release.

## Lote exacto

Promover como una sola unidad las migraciones desde
`20260821064610_create_hito3_rag_foundation.sql` hasta
`20260824005736_retire_legacy_faq_completion_rpc.sql`: **22 migraciones**.

Las cuatro migraciones finales corrigen el release sin reescribir historial:

1. `20260824005015_hito3_hito4_release_security_hardening.sql`: evidencia
   vigente al citar, cola sin texto literal, revisiones inmutables, estado de
   cuenta activo y serialización de SUPERADMIN.
2. `20260824005604_retire_invalid_legacy_faq_rpc.sql`: elimina una RPC
   heredada revocada e inválida.
3. `20260824005654_eliminate_legacy_faq_and_lint_debt.sql`: elimina el
   registrador v1 deshabilitado y limpia una advertencia real de PostgreSQL.
4. `20260824005736_retire_legacy_faq_completion_rpc.sql`: elimina el wrapper
   v1 que dependía del registrador retirado.

## Recuperación y reversión

1. Habilitar y confirmar PITR o crear un backup físico recuperable en Supabase.
2. Guardar el ID/hora del respaldo y el SHA del commit de release en el ticket
   de cambio; nunca guardar secretos.
3. Crear un proyecto staging o una Preview Branch aislada y aplicar el mismo
   lote allí primero.
4. Si una migración posterior requiere corrección, crear una migración
   compensatoria; no editar ni borrar una migración ya aplicada.
5. Solo ante una contingencia que requiera volver datos, usar la recuperación
   documentada de Supabase con el respaldo/PITR confirmado.

## Validación antes de producción

En el checkout limpio del release, y primero en staging:

```powershell
supabase migration list --linked
supabase db push --dry-run
supabase db push
supabase migration list --linked
supabase db advisors --linked --fail-on warn
```

Luego ejecutar contratos, autenticación y el smoke test API/Web contra las URLs
de staging. No habilitar `RAG_INGESTION_WORKER_ENABLED` ni configurar proveedor
IA/corpus en esta promoción: esos gates siguen separados.

## Evidencia local ya obtenida

- 264 contratos pgTAP en 11 archivos: PASS.
- `supabase db lint --local --fail-on warning`: sin hallazgos.
- La suite integrada de Hitos 3–4 se debe repetir desde el checkout limpio
  antes de registrar el commit como candidato de producción.
