# Control de avance — Hito 2

> Actualizar solo con evidencia verificable. La ejecución actual es local y no autoriza acciones de staging, despliegue o proveedores externos.

## Estado de fases

| Fase | Estado | Inicio | Fin | Responsable | Evidencia de salida |
| --- | --- | --- | --- | --- | --- |
| Fase 1 — Entorno local y control técnico | DONE | 2026-08-09 | 2026-08-09 | Codex + Claude Code | Supabase local aislado, Auth/RLS real, comandos efímeros, documentación y re-revisión independiente sin BLOCKER/HIGH/MEDIUM |
| Fase 2 — Datos, versionado, Storage y RLS | DONE | 2026-08-09 | 2026-08-09 | Codex + Claude Code | Migración local reproducible, 34 pruebas pgTAP, sesión real denegada, Auth/RLS sin regresión, advisors y calidad integral aprobados |
| Fase 3 — API de módulos y permisos | DONE | 2026-08-09 | 2026-08-09 | Codex + Claude Code | API local protegida, migraciones de integridad, 40 pgTAP, regresión real, E2E y revisión independiente cerradas |
| Fase 4 — API documental y Storage seguro | DONE | 2026-08-09 | 2026-08-09 | Codex + Claude Opus | API local PDF blindada, Storage privado, descarga temporal auditada, 70 pgTAP, regresiones reales y re-revisión sin BLOCKER/HIGH |
| Fase 5 — Panel administrativo funcional | DONE | 2026-08-09 | 2026-08-09 | Codex + Claude Code | BFF server-only, rutas/formularios funcionales, 53 pruebas, build y regresión local con identidades temporales |
| Fase 6 — Aceptación local y cierre técnico | DONE | 2026-08-09 | 2026-08-09 | Codex + Claude Code | Matriz integral local aprobada, estado Hito 2 vacío y revisión independiente cerrada |

Estados permitidos: `PLANNED`, `ACTIVE`, `REVIEW`, `DONE`, `BLOCKED`.

## Criterios de aceptación del hito

| Criterio | Evidencia local requerida | Estado |
| --- | --- | --- |
| CA-04 — Gestión de módulos | Administrador crea, edita, lista y cambia el estado de módulos/subprocesos; docente recibe denegación | DONE (aceptación local Fase 6) |
| CA-05 — PDF y versionado | Administrador carga un PDF de máximo 20 MB, registra metadatos, lo versiona o desactiva sin perder historial | DONE (aceptación local Fase 6) |
| Storage privado | Descarga no autenticada denegada; descarga autorizada, temporal y auditada | DONE (aceptación local Fase 6) |
| Sin regresión de Hito 1 | Registro, sesión y RBAC conservan sus pruebas y límites de seguridad | DONE (aceptación local Fase 6) |

El criterio contractual de staging no se ejecuta durante esta fase local. Requerirá una autorización y un ambiente separado cuando corresponda.

## Promoción de esquema remoto autorizada — 2026-08-22

Tras la autorización expresa del Product Owner, se promovió **solo** el esquema
versionado de Hito 2 al proyecto remoto de Supabase. La operación se hizo desde
un worktree limpio anclado a `c057d87`, por lo que sus únicas migraciones eran:

1. `20260809194717_create_document_management_foundation.sql`;
2. `20260809203949_enforce_module_logical_hierarchy.sql`;
3. `20260809205720_grant_server_role_profile_role_update.sql`;
4. `20260809213049_document_lifecycle_rpc.sql`;
5. `20260809220458_document_download_audit.sql`.

La simulación previa y el `db push` aplicaron exactamente esas cinco
migraciones. El historial remoto ahora registra las seis migraciones de Hitos
1–2 y `supabase db advisors --linked --fail-on warn` devolvió cero hallazgos.
No se promovieron migraciones de Hito 3, datos de negocio, objetos Storage,
usuarios, secretos, correo ni configuración de autenticación.

## Evidencia de Fase 5 — 2026-08-09

- Interfaz: `/admin/modules`, `/admin/documents` y detalle documental entregan listado, alta, edición, orden, ciclo lógico, asociación, nueva versión y enlace temporal. Un submódulo puede volver explícitamente a raíz. No se creó ningún dato de negocio.
- Límite: las lecturas son Server Components y las mutaciones Server Actions. El cliente BFF `server-only` valida `ADMIN_API_URL`, usa la sesión SSR ya autorizada y envía el bearer únicamente a NestJS; no hay cliente de Data API, Storage, RPC, key de servicio, ruta privada ni hash en el navegador.
- Confiabilidad: formularios bloquean el reenvío mientras hay una petición. El cliente no reintenta; un `503` pide actualizar listado/detalle antes de repetir la operación. La idempotencia persistente queda registrada como TD-003.
- Pruebas: tipo, lint, 53 pruebas web y build de producción aprobaron. `Test-LocalAdminWeb.ps1` construyó/lanzó API y web locales aisladas, comprobó redirección anónima, páginas BFF de ADMIN y bloqueo DOCENTE, y eliminó las identidades temporales.
- Revisión: Claude Code Haiku realizó una revisión independiente por material exacto del flujo SSR/BFF y no encontró hallazgos relevantes. Dos solicitudes más amplias a Claude Opus agotaron el tiempo y no se cuentan como dictamen.

### Actualización visual local de Fase 5 — 2026-08-21

- La interfaz protegida de módulos y documentos recibió el shell administrativo
  responsive, navegación visible, logo oficial y tokens de la guía visual
  aprobada. En móvil el menú es explícito y en escritorio la barra lateral
  permanece estable; ninguna ruta ni decisión de autorización cambió.
- Los componentes priorizan legibilidad para el público objetivo: texto base de
  16 px, controles de al menos 44 px, etiquetas explícitas, foco visible,
  contraste basado en la paleta aprobada y movimiento reducido respetado.
- Calidad local: lint, typecheck, build, 57 pruebas de web (98.74 % statements;
  96.63 % branches), comprobación de espacios y auditoría axe WCAG 2 A/AA a
  375 px: PASS. La guarda anónima de `/admin/modules` se comprobó en navegador
  y no expuso contenido administrativo.
- La revisión independiente nueva no se declara aprobada: Claude Code local no
  está autenticado y su invocación de solo lectura no produjo dictamen. La
  regresión integrada de identidades temporales se inició sobre Supabase local,
  pero el ejecutor terminó después de los builds antes de emitir su resultado;
  se mantiene la evidencia PASS histórica de la Fase 5 y esta actualización no
  la sustituye.

## Evidencia de Fase 6 — 2026-08-09

- Cierre reproducible: `Test-LocalHito2Closure.ps1 -AllowLocalReset` aprobó la matriz completa y rechaza cualquier Supabase que no sea `127.0.0.1:55321`/loopback. El reset queda protegido por un parámetro explícito y se aplica únicamente a la base local AVEND.
- Contratos y seguridad: 70 pruebas pgTAP, advisors sin incidencias, historial de seis migraciones, Auth/RLS, denegación de Data API/Storage directo, CA-04 módulos, CA-05 PDF/versionado y frontera web ADMIN/DOCENTE: PASS.
- Calidad: cobertura API 94.93 % statements y 80.17 % branches; web 53 pruebas; 19 E2E API; lint, typecheck, builds, health check, auditoría de dependencias de producción y `git diff --check`: PASS.
- Limpieza: la suite comprobó que las cinco tablas Hito 2 y el bucket privado estaban vacíos inmediatamente después del reset de CA-05 y nuevamente al finalizar. No quedaron módulos, documentos, versiones, auditorías ni objetos de prueba.
- Revisión: Claude Code Haiku revisó el ejecutor. Identificó la exposición de la clave local mediante variable de entorno, limpieza intermedia y preflight insuficiente; se corrigieron. La re-revisión no dejó BLOCKER ni HIGH. Los MEDIUM restantes son trade-offs explícitos del test local: la clave se usa solo en memoria de un proceso efímero y el control final de vacío falla de forma segura si la web dejara datos.

## Evidencia de Fase 1 — 2026-08-09

- Docker: Mailpit local y el stack de Supabase de AVEND ASESOR ejecutan sin interferir con otro proyecto local. AVEND usa API `55321`, PostgreSQL `55322`, Studio `55323` y buzón local `55324`.
- Seguridad local: `db.seed` está desactivado, Studio AI no tiene clave/configuración externa y `storage.vector` está desactivado. No se creó bucket, módulo, documento ni migración de Hito 2.
- Regresión real: `infrastructure/local/Test-LocalAuthRls.ps1` aprobó registro, correo de confirmación, confirmación, login, recuperación y perfil RLS `docente`; las cuentas temporales se eliminaron al finalizar.
- Aislamiento: `infrastructure/local/Invoke-LocalEnvironment.ps1` inyecta claves locales únicamente en memoria y rechaza URLs que no sean loopback; no modifica `.env.local`.
- Calidad: `ai-status.ps1 -RunProjectChecks` y `git diff --check` aprobaron antes del cierre. API: 42 unitarias; web: 33 pruebas; API E2E: 8 pruebas.
- Revisión: Claude Code revisó el contenido real de `config.toml`, scripts locales, ADR y resumen; confirmó siete correcciones y no dejó hallazgos `BLOCKER`, `HIGH` ni `MEDIUM`.

## Evidencia de Fase 2 — 2026-08-09

- Persistencia: la migración `20260809194717_create_document_management_foundation.sql` crea módulos jerárquicos ordenados sin ciclos, documentos lógicos, versiones PDF inmutables, relación muchos-a-muchos, auditoría append-only y baja lógica. No se creó ni sembró ningún módulo o documento de negocio.
- Integridad: una clave compuesta impide que una versión o evento de auditoría pertenezca a un documento distinto; un disparador diferido impide confirmar un documento activo sin versión vigente, conservando la creación atómica que implementará la futura API.
- Seguridad: las cinco tablas nuevas tienen RLS y revocación explícita para `public`, `anon` y `authenticated`; solo `service_role` queda reservado para la futura API. El bucket `normative-documents` es privado, acepta solo `application/pdf`, limita a 20 MiB y deniega de forma explícita el Storage directo para `anon` y `authenticated`.
- Pruebas locales: `supabase db reset --local`, `supabase test db --local supabase/tests/database/document_management_foundation_test.sql` (34 pruebas), `Test-LocalDocumentSecurity.ps1`, `Test-LocalAuthRls.ps1`, `supabase db advisors --local` y `supabase migration list --local` aprobaron. Las pruebas temporales terminaron con cero usuarios, perfiles y objetos normativos persistentes.
- Regresión integral: `ai-status.ps1 -RunProjectChecks` y `git diff --check` aprobaron; API: 42 pruebas unitarias y 8 E2E; web: 33 pruebas; lint, typecheck y build completos aprobados.
- Revisión: Claude Code ejecutó una revisión independiente por material de migración y pruebas. Identificó la mutabilidad residual de metadatos de ingesta y la revocación explícita del rol PostgreSQL `public`; ambos hallazgos se corrigieron y verificaron. Las alertas sobre políticas “incompletas” procedían de truncamiento de material en la CLI; la migración completa se aplicó correctamente y las pruebas pgTAP y de sesión real verifican dichas políticas.

## Evidencia de Fase 3 — 2026-08-09

- API: `POST`, `GET`, `PATCH`, cambio de posición, cambio de estado y `DELETE` lógico de `/admin/modules` se implementaron en NestJS. La autorización se ejecuta antes del servicio y permite exclusivamente `admin` y `superadmin`; no existe endpoint de gestión de usuarios ni acceso documental en esta fase.
- Integridad: las migraciones `20260809203949_enforce_module_logical_hierarchy.sql` y `20260809205720_grant_server_role_profile_role_update.sql` impiden asignar un padre eliminado o eliminar lógicamente un padre con hijos activos. El único privilegio adicional es `UPDATE(role)` para `service_role`; ningún rol de navegador puede cambiar roles.
- Pruebas: `supabase db reset --local`, la batería pgTAP completa (40 pruebas), advisors y el historial de cuatro migraciones aprobaron. La regresión real `Test-LocalModulesApi.ps1` creó identidades locales efímeras, confirmó sus correos con Mailpit, verificó que una sesión docente no puede consultar la tabla ni usar la API y comprobó todo el ciclo ADMIN; su limpieza aprobó.
- Calidad: API unitarias (66), cobertura (98.19 % statements, 84.76 % branches, 92.18 % functions, 98.04 % lines), E2E (14) y los controles integrales del repositorio aprobaron. `git diff --check` no encontró errores de espacios.
- Revisión: Claude Code revisó de forma independiente el servicio y controlador suministrados en modo lectura. No dejó hallazgos aplicables `BLOCKER`, `HIGH` ni `MEDIUM`; se reforzó el bloqueo de concurrencia del padre en la migración y se dejó explícito el estado `201 Created`. Las observaciones sobre auditoría de lectura están fuera del alcance aprobado.

## Evidencia de Fase 4 — 2026-08-09

- API: `/admin/documents` expone crear, listar paginado, detalle sin rutas privadas, nueva versión, metadatos, enlaces/desenlaces de módulo, activación/desactivación, baja lógica y descarga temporal. Todas las rutas exigen correo confirmado y rol `admin` o `superadmin`; `docente` recibe `403` antes de ejecutar la lógica.
- Validación: la API inspecciona el contenido real del PDF, rechaza archivo ausente/malformado, limita a 20 MiB y 300 páginas, calcula SHA-256 y no confía en extensión ni MIME declarados. Las rutas de objeto se forman solo con UUIDs de servidor y Storage nunca sobrescribe un objeto.
- Integridad y auditoría: seis migraciones reproducibles incluyen RPC transaccionales, bloqueo de documento vivo, permisos exclusivos de `service_role` y el evento append-only `download_url_generated`. La creación/versionado reconcilia un resultado de persistencia ambiguo antes de borrar un objeto; si no puede confirmarlo, responde seguro y conserva el objeto para reconciliación.
- Pruebas: `supabase test db --local` aprobó 70 contratos pgTAP; `supabase db advisors --local` no informó incidencias. `Test-LocalDocumentsApi.ps1 -ResetAfter` aprobó PDF real, versiones, asociaciones, ciclo lógico, bloqueo de `docente`, denegación directa de tabla/Storage, URL no pública, descarga y auditoría, y limpió el entorno local.
- Regresión: `Test-LocalAuthRls.ps1`, `Test-LocalDocumentSecurity.ps1` y `Test-LocalModulesApi.ps1` aprobaron. API: 102 pruebas unitarias con 94.93 % statements y 80.17 % branches, y 19 E2E aprobadas; `ai-status.ps1 -RunProjectChecks` aprobó lint, typecheck, pruebas y build de API/Web completos.
- Revisión: Claude Opus ejecutó una revisión independiente del servicio. Detectó tres riesgos altos aplicables (compensación ciega, trazabilidad de limpieza y paginación); se corrigieron. El cuarto señalamiento alto era condicional y quedó descartado porque el gateway ya excluía bajas lógicas. La re-revisión no dejó `BLOCKER` ni `HIGH`. Los riesgos de idempotencia/reconciliación se registran para Fase 5 sin inventar un contrato UI antes de tiempo.
