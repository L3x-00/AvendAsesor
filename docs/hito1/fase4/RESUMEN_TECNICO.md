# Fase 4 — RBAC endurecido, staging y aceptación

## Objetivo

Cerrar el Hito 1 con una frontera administrativa resistente a intentos directos de URL o API, un ambiente de staging separado y evidencia contractual reproducible. La prioridad es demostrar que un docente no puede alcanzar funciones administrativas bajo ninguna circunstancia cubierta por el sistema.

## Incluye

- Guards y políticas de autorización de NestJS aplicados a cada endpoint administrativo. La protección no se basa únicamente en ocultar botones o redirigir desde el frontend.
- Middleware/layout de Next.js para una navegación coherente, sumado a comprobaciones server-side y de API.
- Layout administrativo mínimo y rutas de entrada diferenciadas para `admin` y `superadmin`; no incorpora aún el CRUD administrativo del Hito 2.
- Matriz explícita de permisos iniciales: `docente` no accede a ningún recurso administrativo; los permisos diferenciados entre `admin` y `superadmin` se implementan solo cuando estén confirmados por requerimiento o se dejan cerrados de forma conservadora.
- Rate limiting y protecciones de autenticación proporcionales a la arquitectura, manejo seguro de CORS y cabeceras que correspondan al despliegue.
- Configuración de staging con variables y base de datos separadas, despliegue de web/API únicamente en el ambiente autorizado y documentación de rollback seguro.
- Smoke tests y ejecución de la matriz de aceptación en staging con cuentas de prueba no productivas.

## Pruebas de seguridad y aceptación

| Prueba | Resultado esperado |
| --- | --- |
| Docente navega al panel desde la UI | Es redirigido o recibe una vista de acceso denegado sin contenido administrativo |
| Docente abre una URL administrativa directamente | Denegación consistente sin filtrar datos |
| Docente llama la API administrativa con token válido | `403` o respuesta equivalente definida, sin ejecutar la operación |
| Solicitud sin token, alterado o vencido | `401` o respuesta equivalente definida, sin datos sensibles |
| Admin/superadmin autorizado | Puede entrar solo a las rutas de su permiso confirmado |
| Registro, confirmación y recuperación en staging | CA-01, CA-02 y CA-03 pasan con el proveedor y redirecciones del ambiente |
| Cambio de ambiente | Ninguna credencial, base ni URL de producción se reutiliza en desarrollo o staging |

## Criterios de salida

- CA-18 queda demostrado por pruebas automatizadas de UI, URL directa y API, además de un smoke test en staging.
- CA-01, CA-02 y CA-03 se ejecutan satisfactoriamente en staging y se registra evidencia sin secretos.
- La puerta de calidad completa del repositorio pasa sobre el código integrado; los fallos bloqueantes se corrigen y se revalidan.
- Existe una guía operativa de staging que indique variables requeridas por nombre, responsables, despliegue y rollback, sin valores confidenciales.
- Se actualizan el estado del proyecto, riesgos, deudas, ADRs aplicables y el control de avance con resultados reales.

## Cierre del Hito 1

El Hito 1 estará listo para validación del cliente cuando los cuatro criterios contractuales y la arquitectura de staging tengan evidencia comprobable. La entrega es un enlace de staging y un reporte técnico consolidado; no autoriza por sí misma cambios en producción ni el inicio automático del Hito 2.

## Ejecución local y evidencia (2026-08-09)

- Codex implementó la frontera administrativa NestJS: límite de solicitudes, validación remota de bearer token, correo confirmado, rol de perfil controlado por base de datos y denegación por defecto.
- Claude Code implementó en un área aislada la frontera web server-side: `/admin` obtiene el usuario desde Supabase y consulta solo su propio rol mediante RLS antes de mostrar contenido. Codex revisó el aporte y añadió el manejo de excepciones inesperadas para que también fallen cerradas.
- La matriz automatizada cubre token ausente/alterado/vencido (`401`), docente (`403`), admin/superadmin autorizado, restricción `admin` frente a `/admin/system` y límite de 10 solicitudes (`429`).
- Claude Code efectuó una revisión real de solo lectura del API, Mailpit y Resend; no encontró hallazgos `BLOCKER`, `HIGH` ni `MEDIUM`. La observación LOW sobre dependencias fue contrastada por la puerta integral: `ValidationPipe` requiere `class-validator`/`class-transformer`, por lo que se conservan.
- No se autorizó ni realizó despliegue, cambio de staging/producción, alta de usuarios reales ni configuración remota de Resend.

Estado al 2026-08-09: `BLOCKED` únicamente por la aceptación contractual de staging. El alcance local y de desarrollo está integrado y verificado; CA-01 a CA-03 requieren Mailpit local o SMTP/URLs de staging, y CA-18 requiere el smoke de staging antes de declarar el Hito 1 terminado.
