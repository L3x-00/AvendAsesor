# Hito 1 — Base, autenticación, roles y ambientes

## Propósito

Este directorio convierte el alcance contractual del Hito 1 en cuatro fases técnicas pequeñas, verificables y trazables. Es el plan de control para desarrollar la base segura de AVEND ASESOR; no acredita que una capacidad esté implementada.

La implementación se realizará en orden. Una fase solo puede pasar a la siguiente cuando haya evidencia de sus criterios de salida, revisión independiente proporcional al cambio y actualización del estado real del proyecto.

## Alcance confirmado

- Registro con nombre completo, correo y contraseña.
- Confirmación de correo, inicio y cierre de sesión, y restablecimiento de contraseña.
- Roles `superadmin`, `admin` y `docente`.
- Protección efectiva de recursos y rutas administrativas.
- PostgreSQL y Supabase Auth como base de identidad, con ambientes aislados de desarrollo, staging y producción.
- Correo transaccional mediante Mailpit en desarrollo local y Resend como SMTP de Supabase para futuros ambientes remotos.
- Un ambiente de staging apto para validar los criterios CA-01, CA-02, CA-03 y CA-18.

## Fuera de alcance del Hito 1

- Inteligencia artificial, RAG, carga o procesamiento documental.
- Chat, historial, fuentes, módulos funcionales y generación de documentos.
- CRUD administrativo completo: el panel de esta etapa solo cubre la frontera de acceso y un punto de entrada protegido.
- Despliegue o cambios en producción sin una tarea explícita y autorización para las acciones que lo requieran.

## División de fases

| Fase | Resultado verificable | Dependencia principal |
| --- | --- | --- |
| [Fase 1](fase1/RESUMEN_TECNICO.md) | Base de ingeniería, decisiones y sistema de pruebas para Auth/RBAC | Ninguna cuenta externa |
| [Fase 2](fase2/RESUMEN_TECNICO.md) | Identidad, esquema de perfiles, roles y ambientes de datos aislados | Aprobación y accesos de Supabase |
| [Fase 3](fase3/RESUMEN_TECNICO.md) | Flujos completos de registro, confirmación, sesión y recuperación | Fase 2 y configuración de correo |
| [Fase 4](fase4/RESUMEN_TECNICO.md) | RBAC endurecido, staging y validación contractual del hito | Fase 3, dominios y accesos de staging |

El avance real se registra en [CONTROL_DE_AVANCE.md](CONTROL_DE_AVANCE.md). Los documentos de fase describen las tareas previstas; los resultados, hashes, enlaces de PR y evidencias se anotan solo después de su ejecución.

## Diseño de calidad obligatorio

Cada fase aplica las siguientes reglas:

1. Código TypeScript estricto, módulos con una responsabilidad clara y dependencias dirigidas hacia contratos y servicios, no hacia interfaces concretas.
2. Validación de entradas en ambos límites: formularios/UI y API. Los mensajes al usuario no exponen información sensible ni permiten enumerar cuentas.
3. Secretos exclusivamente en variables de entorno locales o del proveedor. Se versionan archivos `.env.example` con nombres, nunca valores reales.
4. Las comprobaciones de interfaz solo mejoran la experiencia. La autorización efectiva se ejecuta en API, base de datos/RLS cuando corresponda y configuración del proveedor.
5. Las migraciones son revisables, reproducibles y se prueban antes de cualquier aplicación en staging. No se aplican cambios destructivos ni en producción sin la aprobación exigida por `dangerous-actions`.
6. Cualquier dependencia nueva debe justificarse, fijarse en el lockfile y pasar las comprobaciones del repositorio.

## Estrategia de pruebas y regresión

La Fase 1 deja una puerta de calidad que las demás fases amplían:

| Capa | Propósito | Evidencia mínima al final del hito |
| --- | --- | --- |
| Unitarias API | Reglas de dominio, roles, validadores, adaptadores y errores | Casos positivos, límites y fallos relevantes |
| Integración API | DTOs, guards, controladores, JWT y persistencia en entorno aislado | Pruebas con Supertest y datos no productivos |
| Datos y seguridad | Migraciones, restricciones, RLS y accesos por rol | Casos permitir/denegar reproducibles |
| UI | Formularios accesibles, estados de carga/error y navegación según sesión | Pruebas de componentes y validaciones críticas |
| E2E | Registro, confirmación, login, logout, recuperación y bloqueo administrativo | Flujos CA-01, CA-02, CA-03 y CA-18 automatizados cuando el proveedor lo permita |
| Staging | Configuración, redirecciones autorizadas y smoke tests reales | Registro de evidencia con fecha, entorno y resultado |

Una corrección de defecto debe añadir o ajustar una prueba que evite la regresión, salvo que se documente una limitación externa comprobable.

## Criterios contractuales y trazabilidad

| Criterio | Implementación | Prueba final |
| --- | --- | --- |
| CA-01 — Registro | Fases 2 y 3 | Usuario nuevo creado y perfil inicial correcto |
| CA-02 — Verificación e inicio | Fase 3 | Enlace válido/expirado, login y sesión segura |
| CA-03 — Recuperación | Fase 3 | Solicitud, correo, cambio de contraseña y nuevo acceso |
| CA-18 — Docente sin panel administrativo | Fase 4 | Intentos por UI, URL directa y API devuelven denegación |
| Arquitectura y staging | Fases 1 a 4 | Puerta de calidad, separación de ambientes y smoke tests sin bloqueantes |

## Insumos y puntos de control del Product Owner

El equipo puede preparar código y configuraciones de ejemplo sin estos insumos, pero no debe inventar ni publicar configuraciones reales:

- aprobación y accesos a Supabase, Resend, Vercel y Render;
- cuentas/correos iniciales de superadministración;
- dominio(s) y URLs permitidas para redirección de confirmación y recuperación;
- remitente y DNS necesarios para el correo transaccional;
- logo, paleta y referencias visuales finales para sustituir el estilo neutral funcional;
- confirmación de los responsables de validar staging.

## Definición de terminado de una fase

Una fase se marca `DONE` únicamente si el alcance indicado está implementado, probado, revisado, sin hallazgos `BLOCKER` o `HIGH` en alcance, con `git diff --check` limpio, memoria/estado actualizados y un resumen técnico con evidencia. Compilar por sí solo no equivale a terminar.

## Roles de ejecución

Codex coordina las tareas, selecciona el rol técnico y mantiene el estado compartido. Claude Code puede implementar o revisar áreas acotadas mediante la coordinación del repositorio. Si se usa una revisión independiente, se registra evidencia real en `.ai-shared/coordination/REVIEWS.md`; no se simula la participación de ningún agente.
