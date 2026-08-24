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

## Promoción de esquema ejecutada

El 2026-08-24, tras un checkout limpio/revisado, respaldo lógico privado,
validación staging y autorización específica del Product Owner, se promovieron
las 23 migraciones acumulativas de Hitos 3–4. El historial remoto coincide en
29 versiones; se comprobó `pgvector` 0.8.2, el índice HNSW calificado y las
tablas críticas. La auditoría independiente no dejó BLOCKER/HIGH.

Esta evidencia solo cierra el esquema. El despliegue API/Web, la QA autenticada
y cualquier dato ficticio se realizan en fases separadas. Worker RAG,
proveedores IA, correo, HMAC y corpus continúan deshabilitados. El runbook de
recuperación y límites queda en `RELEASE_HITO3_HITO4.md`.
