# Hito 4 — Fase 5: cierre técnico local

## Propósito

Consolidar la verificación regresiva de los contratos Hitos 1–4, registrar el resultado de la auditoría y dejar un handoff de release seguro. Esta fase no promueve esquema, datos, secretos ni despliegues.

## Matriz de cierre

- Contratos PostgreSQL, RLS, permisos de RPC, triggers, índices y migraciones locales.
- Cobertura de API, pruebas E2E, typecheck, lint, pruebas de workspace y build de producción.
- Auditoría de dependencias de producción y revisión de higiene de diferencias.
- Revisión independiente limitada, documentada solo si entrega una conclusión verificable.
- Confirmación de que UI, responsive, proveedor IA, corpus, HMAC, presupuestos y calibración siguen fuera de esta entrega.

## Herramienta reproducible

`infrastructure/local/Test-LocalHito4Closure.ps1` se niega a trabajar contra una instancia Supabase que no sea loopback y verifica el puerto local aislado antes de ejecutar cualquier prueba. No hace reset ni muta servicios remotos.

## Resultado verificable

`HITO4_LOCAL_ACCEPTANCE=PASS` se revalidará como release integrado tras las correcciones acumulativas de 2026-08-24. La última verificación directa de base de datos registra:

- 264 contratos pgTAP en 11 archivos, sin fallos, y `supabase db lint --local --fail-on warning` sin hallazgos.
- 48 suites / 216 pruebas unitarias de API, con 95.03% de sentencias y 80.58% de ramas.
- 22 pruebas E2E de API y 91 pruebas web de regresión.
- Typecheck y lint de workspace, build de producción y `npm audit --omit=dev --audit-level=high` superados (0 vulnerabilidades).
- `git diff --check` superado; los avisos CRLF existentes no son errores de contenido.

La invocación independiente de Claude Code no emitió una conclusión útil, incluso con herramientas deshabilitadas y material suministrado. Se registra como limitación de revisión, no como aprobación ni hallazgo resuelto.

## Gate de promoción

El cierre local no autoriza producción. Antes de cualquier promoción se requiere un checkout limpio y revisado, conjunto exacto de migraciones, respaldo/PITR comprobable, plan de reversión, staging verificable y autorización específica del Product Owner para la operación remota.

La comprobación remota de solo lectura del 2026-08-23 confirma que producción
está en Hitos 1–2 (`20260809045322` a `20260809220458`). Hito 4 depende de las
22 migraciones acumulativas locales Hitos 3–4, por lo que no se promueve de
forma aislada ni desde el árbol de trabajo compartido. El runbook y estado de
recuperación están en `RELEASE_HITO3_HITO4.md`.
