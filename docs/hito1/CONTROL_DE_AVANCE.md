# Control de avance — Hito 1

> Estado inicial de planificación: 2026-08-08. Actualizar únicamente con evidencia verificable; no usar este archivo como registro narrativo de conversación.

## Estado de fases

| Fase | Estado | Inicio | Fin | Responsable | Evidencia de salida |
| --- | --- | --- | --- | --- | --- |
| Fase 1 — Base de ingeniería y diseño | DONE | 2026-08-08 | 2026-08-08 | Codex + Claude Code | Verificación completa; dos hallazgos MEDIUM corregidos y re-revisados sin BLOCKER/HIGH/MEDIUM |
| Fase 2 — Identidad, datos y ambientes | BLOCKED | 2026-08-08 | — | Codex + Claude Code | Migración aplicada y configuración RLS/trigger verificada en desarrollo; faltan prueba con identidad real y ambiente staging aislado |
| Fase 3 — Flujos de autenticación | BLOCKED | 2026-08-09 | — | Codex + Claude Code | Implementación local completa; Mailpit local queda configurado pero Docker no está iniciado, y Resend/URLs remotas no se configuran sin staging autorizado |
| Fase 4 — RBAC, staging y aceptación | BLOCKED | 2026-08-09 | — | Codex + Claude Code | RBAC API/web, límite de solicitudes, pruebas y revisiones completas; el smoke contractual permanece bloqueado por staging, despliegue y cuentas de prueba |

Estados permitidos: `PLANNED`, `ACTIVE`, `BLOCKED`, `REVIEW`, `DONE`.

## Lista de evidencia por fase

Antes de cerrar una fase, enlazar o anotar aquí:

- tarea(s), PR o commits que componen el alcance;
- archivos/migraciones que cambiaron;
- comandos de validación y resultado;
- revisión independiente, si aplica, y hallazgos resueltos;
- decisión/ADR, si el cambio modifica arquitectura, datos, seguridad, infraestructura o dependencias persistentes;
- riesgos y trabajo explícitamente diferido;
- para staging: URL, fecha, responsable validador y resultado, sin incluir secretos ni tokens.

### Fase 2 — evidencia local (2026-08-09)

- Alcance implementado: `supabase/`, `infrastructure/supabase/`, adaptadores NestJS en `apps/api/src/supabase/`, servicios de Auth/Users/Authorization, pruebas y ADR-0003.
- Calidad: lint, typecheck, cobertura, API E2E, build, diff check y auditoría de dependencias de producción pasaron. Cobertura: 27 pruebas, 100% líneas/funciones/sentencias y 93.18% ramas.
- Revisión independiente: Claude Code revisó material no secreto de la Fase 2 y no reportó hallazgos BLOCKER, HIGH ni MEDIUM.
- Pendiente externo: ni la migración ni la prueba RLS se ejecutaron contra base local/remota. Docker no está disponible y la CLI actual no identifica el proyecto Supabase configurado. Ver EXT-001.

### Fase 3 — evidencia local (2026-08-09)

- Alcance implementado: SSR de Supabase Auth, Server Actions, callback PKCE, cierre de sesión local, formularios accesibles, validación Zod, pruebas web y ADR-0004 bajo `apps/web/`.
- Calidad: lint, typecheck, pruebas, cobertura, API E2E, build, diff check y auditoría de dependencias de producción pasaron. Web: 21 pruebas, 100% líneas/funciones/sentencias y 96.36% ramas.
- Navegador: inicio y registro comprobados localmente; los controles se renderizan y la entrada inválida se bloquea antes de llamar al proveedor.
- Revisión independiente: Claude Code no reportó hallazgos BLOCKER, HIGH ni MEDIUM. La única observación preventiva sobre destinos internos del callback fue corregida con una lista explícita y re-revisada sin hallazgos.
- Pendiente externo: Fase 2 debe validar antes la migración/RLS. Luego se requiere acceso de CLI, SMTP/remitente, URLs autorizadas y cuentas de prueba para CA-01, CA-02 y CA-03.

### Fase 2 — evidencia de desarrollo remoto (2026-08-09)

- Migración: `20260809045322_create_identity_profiles.sql` fue aplicada únicamente al proyecto de desarrollo `blxrdotroysitfyehmqw` (AVENDSESOR). La lista de migraciones local/remota coincide.
- Seguridad de datos: los advisors de Supabase no reportaron hallazgos. Una consulta de verificación confirmó RLS activo, solo la política de lectura del perfil propio y permisos `authenticated` de solo lectura; `INSERT`, `UPDATE` y `DELETE` permanecen denegados.
- Trigger: se confirmó que `on_auth_user_created` apunta a `private.handle_new_user` y que `anon` y `authenticated` no pueden ejecutar esa función.
- Pendiente: una prueba de RLS con sesión de una cuenta de prueba y la repetición en staging; no se crearon usuarios reales durante esta ejecución.

### Fase 4 — evidencia local (2026-08-09)

- RBAC: `AuthorizationGuard` valida un bearer token contra Supabase, exige correo confirmado y carga el rol controlado por base de datos. `RolesGuard` falla cerrado. `docente` recibe `403`; token ausente, alterado o vencido recibe `401`.
- Frontera administrativa: `/admin/access` acepta solo `admin` y `superadmin`; `/admin/system` exige `superadmin`. La ruta web `/admin` consulta `auth.getUser()` y el perfil propio por RLS antes de renderizar contenido; usuarios no autorizados se redirigen a acceso restringido.
- Protección adicional: límite de 10 solicitudes por 60 segundos sobre la superficie administrativa, comprobado con respuesta `429`.
- Calidad: API 42 pruebas unitarias y 8 E2E; cobertura API 99.36% sentencias, 92.64% ramas, 90.32% funciones y 99.27% líneas. Web: 33 pruebas; 100% sentencias/funciones/líneas y 96.96% ramas.
- Revisión: Claude Code revisó el API/configuración en modo de solo lectura real sin hallazgos `BLOCKER`, `HIGH` ni `MEDIUM`. Codex revisó la implementación web de Claude Code, endureció las excepciones inesperadas para fallar cerrado y volvió a verificarla.
- Entorno de correo: Mailpit queda versionado y limitado a loopback para desarrollo; Resend queda documentado para el SMTP remoto futuro. No se modificó Resend, staging ni producción.

### Actualización visual de Fases 3 y 4 — 2026-08-21

- Alcance: marco de autenticación responsive, estados de confirmación/error,
  acceso denegado y entrada administrativa; todos emplean logo oficial, paleta
  aprobada y componentes de foco/estado legibles para docentes y profesionales
  adultos.
- Preservación: la revisión de diff confirmó que esta actualización no modifica
  `apps/api/`, migraciones, RLS, Storage, contratos, Server Actions ni la
  frontera administrativa server-side ya existente.
- Calidad: web lint, typecheck, 56 pruebas, cobertura 98.71 % de sentencias y
  96.58 % de ramas, y build de producción: PASS. Navegador móvil de 375px y
  axe-core WCAG 2 A/AA: PASS sin incidencias.
- Revisión independiente: permanece pendiente mientras la CLI local de Claude
  Code no esté autenticada. Este límite no se presenta como aprobación de
  staging ni como sustituto de las pruebas contractuales ya bloqueadas.

## Registro de bloqueos externos

| ID | Fase | Bloqueo | Propietario | Estado | Resolución/evidencia |
| --- | --- | --- | --- | --- | --- |
| EXT-001 | Fase 2 | Desarrollo Supabase `blxrdotroysitfyehmqw` fue confirmado y validado; falta un proyecto staging separado. | Product Owner / AVEND | PARTIALLY RESOLVED | La migración/RLS de desarrollo se aplicó y verificó el 2026-08-09. Confirmar el identificador de staging antes de cualquier enlace o migración. |
| EXT-002 | Fase 3 | Mailpit necesita Docker Desktop para la validación local; dominio, API key y SMTP de Resend permanecen sin configurar en un ambiente remoto autorizado. | Product Owner / AVEND | OPEN | Iniciar Docker para CA locales; configurar Resend solo al habilitar staging, sin compartir secretos en Git. |
| EXT-003 | Fase 4 | URL/dominio de staging y responsables de aceptación pendientes. | Product Owner / AVEND | OPEN | — |

## Matriz de aceptación final

| Criterio | Caso automatizado | Smoke test de staging | Estado |
| --- | --- | --- | --- |
| CA-01 — Registro | Implementación y validación de entrada listas; entrega de correo local pendiente | Pendiente de Fase 4 | BLOCKED BY EMAIL/STAGING |
| CA-02 — Confirmación y login | Callback/validación listos; correo local pendiente | Pendiente de Fase 4 | BLOCKED BY EMAIL/STAGING |
| CA-03 — Recuperación | Callback/validación listos; correo local pendiente | Pendiente de Fase 4 | BLOCKED BY EMAIL/STAGING |
| CA-18 — Docente bloqueado del panel | API `403`, URL server-side denegada y límite `429` cubiertos por pruebas | Pendiente de Fase 4 | AUTOMATED PASS; STAGING PENDING |
| Arquitectura sin bloqueantes | Puerta de calidad integral en verde; RLS de desarrollo verificado | Pendiente de Fase 4 | DEVELOPMENT PASS; STAGING PENDING |
