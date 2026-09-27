# Control de avance — Hito 4

> Registrar solo evidencia comprobable. Ninguna fase autoriza por sí misma
> cambios de Supabase, Render, Vercel, secretos o datos de producción.

## Estado de fases

| Fase | Estado | Responsable | Evidencia de salida |
| --- | --- | --- | --- |
| Fase 1 — Gobierno y contratos | DONE (local) | Codex | Matriz RBAC, ADR, modelo de auditoría/retención y pruebas planificadas |
| Fase 2 — Historial privado | DONE (local) | Codex | API/RPCs de listado, lectura, continuación y baja lógica propia |
| Fase 3 — Consultas no resueltas y métricas | DONE (local) | Codex | Bandeja administrativa, clasificación, indicadores agregados y auditoría |
| Fase 4 — Seguridad, usuarios y permisos | DONE (local) | Codex | Gestión SUPERADMIN, eventos append-only y regresiones de autorización |
| Fase 5 — Cierre técnico | DONE (esquema en producción) | Codex + revisión independiente | 264 contratos pgTAP, correcciones de release, 23 migraciones aplicadas y auditoría sin BLOCKER/HIGH |
| Fase 6 — UI/UX y responsive | DONE (revalidado 2026-09-27, ver actualización) | Codex + revisión independiente | BFF web, historial paginado, UI accesible, 100 pruebas, API/Web publicadas, QA autenticado por rol y responsive PASS; ver `fase6/VERIFICACION_VISUAL_QA_PRODUCCION_2026-08-24.md` |

Estados permitidos: `PLANNED`, `ACTIVE`, `REVIEW`, `DONE`, `BLOCKED`.

## Criterios de aceptación locales

| ID | Criterio |
| --- | --- |
| CA-H4-01 | Un usuario solo lista, abre, continúa y elimina lógicamente sus propias conversaciones. |
| CA-H4-02 | ADMIN clasifica y revisa consultas sin sustento sin adquirir gestión de roles. |
| CA-H4-03 | SUPERADMIN gestiona usuarios y roles con salvaguardas contra auto-bloqueo. |
| CA-H4-04 | Las acciones administrativas sensibles generan eventos de auditoría inmutables y consultables según rol. |
| CA-H4-05 | Las métricas son agregadas, acotadas y no exponen contenido de chats ni inventan consumo de IA. |
| CA-H4-06 | RLS, privilegios, RPCs y API niegan acceso directo y entre usuarios/roles indebidos. |
| CA-H4-07 | La suite integral no regresa contratos Hitos 1–3 y conserva las autorizaciones server-side. |
| CA-H4-08 | Historial, operación, usuarios y auditoría muestran solo datos autorizados, mantienen estados claros y responden en escritorio, tableta y teléfono. |

## Actualización 2026-09-27 — estado real y cierre de brechas

Revisión del Hito 4 sobre el sistema actual (tras el Hito 3 y los ajustes de
septiembre). Cambios de contexto respecto de la sección de riesgos:

- **IA y worker RAG activos** en producción (OpenRouter/OpenAI); ya no están
  deshabilitados.
- **«Consultas no resueltas» vive en «Consultas y reportes»** (especificación
  del PO del 2026-09-05, TSK-0036): cada respuesta sin sustento crea una
  alerta automática. La bandeja original del Hito 4 dejó de tener pantalla;
  la cola `unanswered_questions` se conserva en la base.
- Por esa misma especificación, el detalle de un caso muestra la consulta y
  la respuesta originales al administrador (antes: solo un resumen operativo).

| Brecha encontrada | Solución | Evidencia |
| --- | --- | --- |
| 19 alertas sin atender, revisión caso por caso, sin aviso al docente | «¿Qué documentación falta?»: consultas sin sustento agrupadas por tema, «Cargar documento en este tema», cierre en bloque (resuelta avisa al docente; descartada no) y aviso «Hay novedades / Volver a preguntar» en el historial y la conversación | PR #69 (fusionado); agrupamiento probado con las 19 alertas reales |
| Módulos sin historial (10 eliminados sin rastro) | Trigger de auditoría con responsable explícito (`modules.audit_actor`) en el registro inmutable | Migraciones `20260927100000`/`20260927100100` aplicadas en producción; PR #70 (fusionado); pgTAP 17/17 |
| La web no reconocía el evento `user_created` (la primera alta desde el panel rompía la actividad auditada) | Esquema y etiquetas actualizados; columna «Detalle» en lenguaje llano | PR #70 |
| Detalle de caso, documento o módulo con UUID v5 respondía 400 | Los ids de ruta aceptan cualquier versión de UUID | PR #71 |
| Pantallas del administrador en móvil | Actividad auditada como tarjetas, buscador sin doble borde, filtros legibles | PR #71; recorrido a 375 y 768 px de 12 pantallas sin desbordes |

### Validación por criterio (2026-09-27)

| ID | Resultado | Evidencia |
| --- | --- | --- |
| CA-H4-01 | Cumple | pgTAP `hito4_private_history` 15/15; `GET /chat/updates` filtra por el usuario autenticado y conversaciones no eliminadas |
| CA-H4-02 | Cumple | Casos y grupos usan RPC con `require_active_consultation_administrator`; el cierre en bloque revalida en el servidor |
| CA-H4-03 | Cumple | pgTAP `users_provisioning` 19/19, `admin_module_permissions` 28/28 |
| CA-H4-04 | Cumple | Auditoría operacional (usuarios, vigencias, historial, módulos), de documentos, de casos y de permisos; pgTAP `module_audit` 17/17 |
| CA-H4-05 | Cumple, con pendiente | Métricas agregadas; el costo de IA sigue `not_configured` aunque la IA ya está activa |
| CA-H4-06 | Cumple | pgTAP `hito3_hito4_release_security_hardening` 13/13 y aislamiento de historial |
| CA-H4-07 | Cumple | API 961/961 (cobertura 93.4 %), web 571/571 (91.7 %) |
| CA-H4-08 | Cumple | Recorrido responsive del 2026-09-27 (PR #71) |

Nota: en la base local, `hito4_security_and_user_admin`,
`hito4_unanswered_operations`, `consultation_reports_quality` y
`users_access_window_management` fallan solo en aserciones de **conteo o
ranking** por los datos de demostración acumulados (p. ej. «62 docentes,
se esperan 6»); fallan igual sin los cambios de esta revisión. Repetir la
suite completa en una base limpia antes de la entrega final.

### Pendientes registrados

- Costo real de IA en las métricas (hoy `not_configured`).
- `list_operational_audit_events` devuelve los últimos 100 sin filtros ni
  paginación.
- Índice por `user_id` en `consultation_cases` para el aviso al docente
  (requiere migración).
- Buscador dentro del historial del docente (opcional).

## Riesgos y bloqueos

- La Fase 1 de producción aplicó las 23 migraciones acumulativas de Hitos 3–4
  desde un checkout limpio, con respaldo lógico privado y staging aislado.
  El historial local/remoto coincide en 29 versiones. La Fase 2 publicó API y
  web, con health check de dependencia, CORS y protección de rutas verificados.
  El piloto QA ficticio validó las lecturas autenticadas por rol y las rutas
  responsive seleccionadas. El worker RAG, proveedores IA y correo permanecen
  deshabilitados. El runbook está en `fase5/RELEASE_HITO3_HITO4.md` y la
  evidencia visual en
  `fase6/VERIFICACION_VISUAL_QA_PRODUCCION_2026-08-24.md`.
- El borrado definitivo y la retención de conversaciones requieren política
  formal; Hito 4 aplica baja lógica y no programa purgas automáticas.
- La administración de una consulta sin sustento muestra un resumen operativo
  generado por el servidor, nunca la consulta literal ni conversaciones ajenas.
- Las métricas de proveedor/costo permanecen `not_configured` hasta que exista
  proveedor autorizado y telemetría real.
- La carga de datos ficticios y cuentas de prueba en producción se trata como
  una operación separada: exige un conjunto exacto, una credencial fresca no
  expuesta, recuperación verificable y autorización explícita para el recurso
  remoto. No se incluye en una migración de esquema.
