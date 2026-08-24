# Release Hito 3–4 — estado y runbook de promoción

## Estado

**Estado remoto: Fase 1 ejecutada.** El esquema Hitos 3–4 se promovió a
Supabase producción; el despliegue de la API, la web y las pruebas autenticadas
siguen pendientes y se controlan como fases separadas.

La inspección remota de solo lectura del 2026-08-23 confirmó, antes de la
promoción:

- Producción permanece en Hitos 1–2 (`20260809045322` a `20260809220458`).
- El proyecto no tiene PITR habilitado ni backup físico disponible.
- No existe una rama Supabase Preview ni un proyecto staging separado.

Para la promoción se usaron un proyecto staging aislado y un respaldo lógico
privado recuperable de `public` fuera del repositorio. El plan Free no aporta
PITR, por lo que el mismo control debe repetirse antes de futuras migraciones.

## Lote exacto

Promover como una sola unidad las migraciones desde
`20260821064610_create_hito3_rag_foundation.sql` hasta
`20260824005736_retire_legacy_faq_completion_rpc.sql`: **23 migraciones**.

### Fase 1 ejecutada — producción

El 2026-08-24 se aplicó el lote desde el checkout limpio
`codex/hito3-hito4-production-fix`. La verificación posterior confirmó los 29
timestamps locales/remotos de Hitos 1–4, `pgvector` 0.8.2, el operador HNSW en
`extensions` y la presencia de las tablas críticas de RAG, historial, cola y
auditoría. El primer intento falló transaccionalmente sin dejar historial ni
esquema parcial porque el operador vectorial no estaba calificado; se corrigió
la migración aún pendiente a `extensions.vector_cosine_ops` y se reintentó con
éxito. La auditoría independiente no dejó BLOCKER/HIGH.

La consulta post-release de asesores agotó el tiempo y el cache experimental
`pg-delta` del CLI informó un error posterior a la promoción; ambos quedan como
limitación de observabilidad, no como evidencia de migración incompleta.

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
