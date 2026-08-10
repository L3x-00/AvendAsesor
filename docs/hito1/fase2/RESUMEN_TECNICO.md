# Fase 2 — Identidad, datos y ambientes aislados

## Objetivo

Construir el fundamento seguro de identidad y autorización en un entorno de desarrollo aislado, dejando preparado el paso controlado a staging. Al finalizar no habrá un flujo público completo, pero sí modelos de datos, roles, políticas y adaptadores verificables.

## Incluye

- Configuración de proyectos/credenciales separados para desarrollo y staging cuando AVEND entregue los accesos aprobados. Producción se mantiene aislada y no se usa como ambiente de prueba.
- Esquema de perfil de AVEND ASESOR vinculado por identificador inmutable al usuario de Supabase Auth, con nombre completo, rol y campos mínimos justificados.
- Roles iniciales: `superadmin`, `admin` y `docente`. El rol se obtiene del origen de datos autorizado; no se acepta desde formularios, cookies ni un claim manipulable por el cliente.
- Migraciones revisables, restricciones, índices necesarios y mecanismo idempotente de creación/sincronización de perfiles.
- Políticas RLS y privilegios mínimos para impedir lectura o modificación cruzada de perfiles y roles. La clave de servicio se reserva a procesos server-side estrictamente necesarios.
- Adaptador de Supabase en NestJS que verifica tokens emitidos por el proveedor y carga el contexto de autorización necesario para los guards.
- Esquema de configuración con separación de variables públicas y privadas, validación de URLs/redirecciones y `.env.example` actualizado sin secretos.
- Preparación de la lista inicial de superadministradores mediante un procedimiento controlado y auditable, nunca por autoasignación pública de roles.

## No incluye

- Formularios completos de registro/login ni activación pública del servicio.
- Panel administrativo, gestión de usuarios o promoción de roles desde la UI.
- Credenciales de producción, migraciones destructivas, almacenamiento documental o funciones RAG.

## Pruebas obligatorias

- Migraciones ejecutan desde cero contra un entorno de prueba aislado y son repetibles.
- Un perfil se crea o sincroniza una sola vez para el mismo usuario de identidad.
- `docente` no puede leer, editar ni elevar roles de otros usuarios; `admin` y `superadmin` se validan según la matriz definida.
- Token ausente, alterado, expirado o con audiencia/issuer incorrectos es denegado por la API.
- Las claves privadas no llegan a bundles web, logs, errores ni archivos versionados.

## Criterios de salida

- Existe una ruta reproducible para inicializar desarrollo y staging con configuraciones distintas y sin reutilizar la base de producción.
- El modelo de perfiles/roles, migraciones y RLS pasó pruebas de permitir/denegar con datos aislados.
- La API puede identificar de forma verificable a un usuario autenticado y obtener su contexto de rol sin confiar en datos del navegador.
- El alta inicial de superadministradores está documentada y requiere una acción administrativa controlada.
- Los cambios poseen ADR si se decidió ORM/acceso a datos, revisión independiente y evidencia de pruebas.

## Ejecución local y evidencia

Estado al 2026-08-09: `BLOCKED` solo para la aceptación completa. El proyecto de desarrollo `blxrdotroysitfyehmqw` fue confirmado, enlazado y recibió la migración versionada. La lista de migraciones, los advisors, RLS, privilegios y trigger fueron verificados por consulta de solo lectura. Falta probar una sesión de identidad real y repetir la evidencia en un staging aislado aún no confirmado.

### Artefactos implementados

- `supabase/config.toml` con confirmación obligatoria de correo, requisitos mínimos de contraseña y redirección local explícita.
- Migración versionada `20260809045322_create_identity_profiles.sql`: perfiles vinculados a `auth.users`, enum de roles controlado por la base de datos, RLS de lectura propia, privilegios mínimos y trigger privado que asigna únicamente `docente` a nuevas identidades.
- Adaptadores server-side de Supabase en NestJS para validar el token con el proveedor y obtener el perfil/rol desde la base de datos. La clave `service_role` se conserva exclusivamente en el proceso API.
- ADR-0003 y runbook sin secretos bajo `infrastructure/supabase/`.

### Verificación realizada

- `npm run lint`, `npm run typecheck`, `npm run test:coverage`, `npm run test:e2e`, `npm run build`, `git diff --check` y `npm audit --omit=dev --audit-level=high`: PASS.
- Cobertura: 27 pruebas; 100% de líneas, funciones y sentencias; 93.18% de ramas.
- Claude Code realizó una revisión independiente de material no secreto: sin hallazgos `BLOCKER`, `HIGH` ni `MEDIUM`.
- Docker sigue sin estar disponible para la prueba local completa. En desarrollo remoto se aplicó la migración y se verificó RLS activo, solo lectura propia para `authenticated`, sin `INSERT`/`UPDATE`/`DELETE`, y trigger privado no ejecutable por `anon`/`authenticated`. Permanece pendiente la prueba con una cuenta de sesión y la repetición en staging.

## Dependencias externas

- Aprobación y acceso a Supabase para los ambientes que correspondan.
- Correos de los superadministradores iniciales.
- URLs autorizadas de desarrollo y staging para la configuración de Auth.
