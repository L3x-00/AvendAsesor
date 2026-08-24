# Hito 4 — Fase 4: seguridad de cuentas y auditoría operativa

## Resultado

La plataforma ahora diferencia estado de cuenta de rol. Una cuenta `suspended` es rechazada antes de que el guard exponga sus permisos. La administración de usuarios y la lectura de auditoría son exclusivas de SUPERADMIN tanto en API como en PostgreSQL.

## Diseño de seguridad

- `profiles.account_status` admite solo `active` o `suspended` y obliga actor, fecha y motivo cuando se suspende una cuenta.
- Las fronteras SSR de administrador y chat consultan rol y estado de cuenta; cualquier estado ausente o distinto de `active` falla cerrado antes de renderizar contenido protegido.
- Un SUPERADMIN no puede modificar su propio rol o estado. El procedimiento también evita dejar el sistema sin un superadministrador activo.
- Las modificaciones de rol/estado, la revisión de preguntas y la eliminación lógica de historial se registran en `operational_audit_events` append-only.
- La auditoría no almacena texto de conversaciones, respuestas ni documentos privados; guarda actor, acción, recurso, fecha y metadatos estructurados mínimos.
- Solo la API de servidor puede ejecutar los RPC. Los privilegios de navegador se revocan explícitamente y las tablas nuevas mantienen RLS.
- El registro de último acceso se actualiza como telemetría con frecuencia máxima de 15 minutos y nunca invalida una autorización correcta si el dato accesorio no está disponible.

## API preparada para interfaz futura

- `GET /admin/users`
- `PATCH /admin/users/:id`
- `GET /admin/users/audit-events`

No se creó panel ni se alteró la interfaz. Los contratos exponen solo los datos operativos necesarios, con DTOs validados, throttling y defensa en profundidad en la base de datos.

## Verificación local

- 34 contratos pgTAP nuevos: privilegios, RLS, superadministración, suspensión, autoedición, motivo, telemetría y auditoría inmutable.
- Base de datos completa: 251 contratos superados.
- API: 48 suites y 216 pruebas unitarias superadas.
- Lint y typecheck de API superados antes de la regresión final de cierre.

## Revisión independiente

Se ejecutaron dos invocaciones reales de Claude Code (`opus`) limitadas a este alcance y en modo de planificación/solo lectura. La primera agotó su límite y la segunda, con el material de seguridad suministrado y las herramientas deshabilitadas, finalizó sin texto. Ninguna se registra como aprobación. El cierre local queda verificado, pero una conclusión independiente verificable sigue pendiente antes de una promoción formal.
