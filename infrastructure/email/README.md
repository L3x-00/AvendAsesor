# Correo transaccional de AVEND ASESOR

## Decisión vigente

- **Desarrollo local:** Mailpit, únicamente como bandeja de pruebas.
- **Staging y producción futuros:** Resend configurado como SMTP personalizado de Supabase Auth.
- No se migra ni se elimina ninguna cuenta remota durante esta fase.

El web no envía correos directamente. Registro, confirmación y recuperación se delegan a Supabase Auth; por lo tanto, Resend se configura en la sección de SMTP personalizado del proyecto Supabase correspondiente, nunca como clave pública ni como variable `NEXT_PUBLIC_*`.

## Preparación de Resend para un ambiente remoto futuro

Antes de habilitar correo fuera de desarrollo deben existir un dominio verificado y una API key de Resend con el alcance mínimo necesario. En el proyecto Supabase de **staging** (cuando se autorice), configurar SMTP con estos nombres de parámetros:

| Campo de Supabase Auth | Valor esperado |
| --- | --- |
| Host SMTP | `smtp.resend.com` |
| Puerto | `587` (STARTTLS) |
| Usuario | `resend` |
| Contraseña | API key de Resend, solo en el proveedor |
| Remitente | una dirección del dominio verificado |
| Confirmación de correo | habilitada |

También se debe registrar el `APP_URL` HTTPS de ese ambiente y únicamente las dos rutas de callback usadas por la aplicación: confirmación y actualización de contraseña. Las claves, dominios y URLs reales se configuran en el proveedor/gestor de secretos, no en Git.

## Límites y seguridad

- Mantener el límite de envío de Auth y habilitar CAPTCHA antes de abrir el registro a público.
- Separar el dominio/remitente de autenticación del correo de marketing.
- Configurar SPF, DKIM y DMARC del dominio antes de la validación de staging.
- No usar Mailpit, su SMTP sin cifrado ni direcciones `*.test` fuera de desarrollo local.
