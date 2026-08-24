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
| Fase 5 — Cierre técnico | REVIEW | Codex + revisión independiente | 264 contratos pgTAP, correcciones de release y gate remoto pendiente |

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
| CA-H4-07 | La suite integral no regresa contratos Hitos 1–3; la capa visual queda diferida por instrucción vigente. |

## Riesgos y bloqueos

- Producción solo contiene migraciones hasta Hito 2. El release local incorpora
  22 migraciones acumulativas de Hitos 3–4 y no se promueve hasta que se
  confirme recuperación verificable y staging. El runbook exacto está en
  `fase5/RELEASE_HITO3_HITO4.md`.
- El borrado definitivo y la retención de conversaciones requieren política
  formal; Hito 4 aplica baja lógica y no programa purgas automáticas.
- La administración de una consulta sin sustento muestra un resumen operativo
  generado por el servidor, nunca la consulta literal ni conversaciones ajenas.
- Las métricas de proveedor/costo permanecen `not_configured` hasta que exista
  proveedor autorizado y telemetría real.
