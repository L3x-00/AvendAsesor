# Supabase — Hito 1 Fase 2

## Estado operativo

La configuración y migraciones canónicas se encuentran en `supabase/`. Esta carpeta conserva el runbook de infraestructura; no contiene secretos ni valores de ambientes.

La migración `20260809045322_create_identity_profiles.sql` se aplicó el 2026-08-09 exclusivamente al proyecto de desarrollo confirmado `blxrdotroysitfyehmqw` (AVENDSESOR). La CLI confirmó que la migración local y remota coinciden y los advisors de base de datos no reportaron hallazgos. Staging y producción permanecen sin enlazar ni modificar.

## Modelo de identidad

- Supabase Auth es la fuente de credenciales, confirmación de correo, recuperación de contraseña y emisión de sesión.
- `public.profiles.id` referencia la clave primaria inmutable de `auth.users` y se elimina en cascada cuando se elimina la identidad.
- Los roles de aplicación son `superadmin`, `admin` y `docente`; todo usuario nuevo recibe únicamente `docente` desde la base de datos. El rol no se lee desde `user_metadata` ni puede asignarse desde el navegador.
- El trigger `private.handle_new_user` solo copia el nombre como dato de perfil y se ejecuta al crear la identidad. La función no está expuesta por la Data API ni es ejecutable por `PUBLIC`.
- RLS permite a un usuario autenticado leer solo su propio perfil. No se concede a `authenticated` permiso de insertar, actualizar o eliminar perfiles, por lo que no puede elevar su rol.

## Aplicación remota futura

Para cualquier ambiente adicional confirmado:

1. Enlazar exclusivamente ese proyecto con la CLI después de revisar su identificador y finalidad.
2. Revisar la migración y ejecutar los advisors de seguridad antes de aplicarla.
3. Aplicar y probar la migración en desarrollo usando una cuenta de prueba.
4. Repetir el proceso en el proyecto de staging separado; no reutilizar la base ni las claves de desarrollo.
5. Registrar evidencia, responsables y resultados en `docs/hito1/CONTROL_DE_AVANCE.md`.

La promoción de superadministradores será una acción administrativa controlada después de recibir los correos aprobados. Nunca se automatiza mediante registro público ni se ejecuta sobre un ambiente sin confirmar.
